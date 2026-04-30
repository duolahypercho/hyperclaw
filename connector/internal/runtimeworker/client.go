package runtimeworker

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"os"
	"os/exec"
	"sync"
	"sync/atomic"
	"time"

	"github.com/hypercho/hyperclaw-connector/internal/protocol"
)

type Client struct {
	executable string
	mode       string

	startMu sync.Mutex
	writeMu sync.Mutex
	cmd     *exec.Cmd
	stdin   io.WriteCloser
	enc     *json.Encoder

	jobsMu sync.Mutex
	jobs   map[string]chan workerOutput
	nextID atomic.Uint64
}

type workerOutput struct {
	hubMessage *HubMessage
	done       bool
	err        error
}

func NewClient(executable, mode string) *Client {
	if mode == "" {
		mode = DeploymentModeRemote
	}
	return &Client{
		executable: executable,
		mode:       mode,
		jobs:       make(map[string]chan workerOutput),
	}
}

func (c *Client) RunStreaming(ctx context.Context, action string, params map[string]interface{}, requestID string, toHub chan<- []byte) error {
	jobID, ch, err := c.startJob(ctx, action, params, requestID)
	if err != nil {
		return err
	}
	defer c.unregister(jobID)

	for {
		select {
		case <-ctx.Done():
			c.sendBestEffortAbort(action, params, requestID)
			return ctx.Err()
		case out, ok := <-ch:
			if !ok {
				return errors.New("runtime worker stopped")
			}
			if out.err != nil {
				return out.err
			}
			if out.done {
				return nil
			}
			if out.hubMessage != nil {
				c.forwardHubMessage(ctx, *out.hubMessage, toHub)
			}
		}
	}
}

func (c *Client) RunAction(ctx context.Context, action string, params map[string]interface{}) (map[string]interface{}, error) {
	jobID, ch, err := c.startJob(ctx, action, params, "worker-"+action)
	if err != nil {
		return nil, err
	}
	defer c.unregister(jobID)

	var final map[string]interface{}
	for {
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case out, ok := <-ch:
			if !ok {
				return nil, errors.New("runtime worker stopped")
			}
			if out.err != nil {
				return nil, out.err
			}
			if out.done {
				if final == nil {
					final = map[string]interface{}{"success": true}
				}
				return final, nil
			}
			if out.hubMessage != nil && out.hubMessage.IsFinalResponse() {
				data, err := responseData(out.hubMessage.Data)
				if err != nil {
					return nil, err
				}
				final = data
			}
		}
	}
}

func (c *Client) Status() map[string]interface{} {
	c.startMu.Lock()
	cmd := c.cmd
	c.startMu.Unlock()
	stats := map[string]interface{}{
		"available": cmd != nil && cmd.Process != nil,
		"mode":      c.mode,
	}
	if cmd != nil && cmd.Process != nil {
		stats["pid"] = cmd.Process.Pid
	}
	return stats
}

func (c *Client) Shutdown() error {
	c.startMu.Lock()
	defer c.startMu.Unlock()
	if c.stdin != nil {
		_ = c.stdin.Close()
	}
	if c.cmd != nil && c.cmd.Process != nil {
		_ = c.cmd.Process.Kill()
	}
	return nil
}

func (c *Client) startJob(ctx context.Context, action string, params map[string]interface{}, requestID string) (string, <-chan workerOutput, error) {
	if err := c.ensureStarted(ctx); err != nil {
		return "", nil, err
	}
	jobID := fmt.Sprintf("job-%d", c.nextID.Add(1))
	ch := make(chan workerOutput, 256)
	c.jobsMu.Lock()
	c.jobs[jobID] = ch
	c.jobsMu.Unlock()

	err := c.send(JobRequest{
		Type:      MessageTypeJob,
		JobID:     jobID,
		Action:    action,
		RequestID: requestID,
		Params:    params,
		Mode:      c.mode,
	})
	if err != nil {
		c.unregister(jobID)
		return "", nil, err
	}
	return jobID, ch, nil
}

func (c *Client) ensureStarted(ctx context.Context) error {
	c.startMu.Lock()
	defer c.startMu.Unlock()
	if c.cmd != nil && c.cmd.Process != nil {
		return nil
	}
	exe := c.executable
	if exe == "" {
		var err error
		exe, err = os.Executable()
		if err != nil {
			return err
		}
	}
	cmd := exec.Command(exe, "runtime-worker")
	cmd.Env = append(os.Environ(), "HYPERCLAW_RUNTIME_WORKER=1")
	stdin, err := cmd.StdinPipe()
	if err != nil {
		return err
	}
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return err
	}
	cmd.Stderr = os.Stderr
	if err := cmd.Start(); err != nil {
		return err
	}
	c.cmd = cmd
	c.stdin = stdin
	c.enc = json.NewEncoder(stdin)
	go c.readLoop(stdout)
	go func() {
		err := cmd.Wait()
		if err != nil {
			log.Printf("runtime worker exited: %v", err)
		}
		c.failAll(errors.New("runtime worker exited"))
		c.startMu.Lock()
		if c.cmd == cmd {
			c.cmd = nil
			c.stdin = nil
			c.enc = nil
		}
		c.startMu.Unlock()
	}()
	return nil
}

func (c *Client) readLoop(stdout io.Reader) {
	dec := json.NewDecoder(bufio.NewReader(stdout))
	for {
		var envelope struct {
			Type  string `json:"type"`
			JobID string `json:"jobId"`
		}
		var raw json.RawMessage
		if err := dec.Decode(&raw); err != nil {
			c.failAll(err)
			return
		}
		if err := json.Unmarshal(raw, &envelope); err != nil {
			continue
		}
		switch envelope.Type {
		case MessageTypeReady:
			continue
		case MessageTypeHubMessage:
			var msg HubMessage
			if err := json.Unmarshal(raw, &msg); err == nil {
				c.deliver(envelope.JobID, workerOutput{hubMessage: &msg})
			}
		case MessageTypeDone:
			c.deliver(envelope.JobID, workerOutput{done: true})
		case MessageTypeError:
			var msg ErrorMessage
			if err := json.Unmarshal(raw, &msg); err == nil {
				c.deliver(envelope.JobID, workerOutput{err: errors.New(msg.Message)})
			}
		}
	}
}

func (c *Client) send(v interface{}) error {
	c.writeMu.Lock()
	defer c.writeMu.Unlock()
	if c.enc == nil {
		return errors.New("runtime worker is not running")
	}
	return c.enc.Encode(v)
}

func (c *Client) unregister(jobID string) {
	c.jobsMu.Lock()
	delete(c.jobs, jobID)
	c.jobsMu.Unlock()
}

func (c *Client) deliver(jobID string, out workerOutput) {
	c.jobsMu.Lock()
	defer c.jobsMu.Unlock()
	ch := c.jobs[jobID]
	if ch == nil {
		return
	}
	select {
	case ch <- out:
	default:
		log.Printf("runtime worker output queue full for %s", jobID)
	}
}

func (c *Client) sendBestEffortAbort(action string, params map[string]interface{}, requestID string) {
	abortAction := abortActionFor(action)
	if abortAction == "" {
		return
	}
	_ = c.send(JobRequest{
		Type:      MessageTypeJob,
		JobID:     fmt.Sprintf("job-%d", c.nextID.Add(1)),
		Action:    abortAction,
		RequestID: requestID + "-abort",
		Params:    params,
		Mode:      c.mode,
	})
}

func abortActionFor(action string) string {
	switch action {
	case "claude-code-send":
		return "claude-code-abort"
	case "codex-send":
		return "codex-abort"
	case "hermes-chat":
		return "hermes-abort"
	default:
		return ""
	}
}

func (c *Client) failAll(err error) {
	c.jobsMu.Lock()
	defer c.jobsMu.Unlock()
	for jobID, ch := range c.jobs {
		select {
		case ch <- workerOutput{err: err}:
		default:
			log.Printf("runtime worker could not deliver failure for %s", jobID)
		}
		close(ch)
		delete(c.jobs, jobID)
	}
}

func (c *Client) forwardHubMessage(ctx context.Context, msg HubMessage, toHub chan<- []byte) {
	if msg.IsFinalResponse() {
		select {
		case toHub <- msg.Data:
		case <-time.After(30 * time.Second):
			log.Printf("runtime worker timed out forwarding final response for %s", msg.JobID)
		case <-ctx.Done():
		}
		return
	}
	select {
	case toHub <- msg.Data:
	default:
		log.Printf("runtime worker dropping stream event for %s while hub queue is backed up", msg.JobID)
	}
}

func responseData(raw json.RawMessage) (map[string]interface{}, error) {
	var msg protocol.Message
	if err := json.Unmarshal(raw, &msg); err != nil {
		return nil, err
	}
	payload := msg.Payload
	if payload == nil {
		return map[string]interface{}{}, nil
	}
	if data, ok := payload["data"].(map[string]interface{}); ok {
		return data, nil
	}
	return map[string]interface{}{}, nil
}
