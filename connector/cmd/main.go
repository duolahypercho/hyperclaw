package main

import (
	"context"
	"crypto/ed25519"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"math/rand"
	"net"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"syscall"
	"time"

	"github.com/BurntSushi/toml"
	"github.com/fsnotify/fsnotify"
	"github.com/hypercho/hyperclaw-connector/internal/bridge"
	"github.com/hypercho/hyperclaw-connector/internal/config"
	"github.com/hypercho/hyperclaw-connector/internal/gateway"
	"github.com/hypercho/hyperclaw-connector/internal/hub"
	"github.com/hypercho/hyperclaw-connector/internal/localauth"
	hyperclawmcp "github.com/hypercho/hyperclaw-connector/internal/mcp"
	"github.com/hypercho/hyperclaw-connector/internal/plugin"
	"github.com/hypercho/hyperclaw-connector/internal/protocol"
	"github.com/hypercho/hyperclaw-connector/internal/runtimeworker"
	"github.com/hypercho/hyperclaw-connector/internal/service"
	"github.com/hypercho/hyperclaw-connector/internal/setup"
	"github.com/hypercho/hyperclaw-connector/internal/store"
	syncp "github.com/hypercho/hyperclaw-connector/internal/sync"
	tokenpkg "github.com/hypercho/hyperclaw-connector/internal/token"
)

var (
	version = "0.5.10"
	commit  = "dev"
)

// Exponential backoff with jitter: 1s, 2s, 4s, 8s, 16s, 30s (max) + 0-50% jitter.
// Jitter prevents thundering herd when the hub restarts and all connectors reconnect.
func backoffDelay(attempt int) time.Duration {
	if attempt > 5 {
		attempt = 5
	}
	base := time.Duration(1<<uint(attempt)) * time.Second
	if base > 30*time.Second {
		base = 30 * time.Second
	}
	jitter := time.Duration(rand.Int63n(int64(base) / 2))
	return base + jitter
}

// isAuthError checks if a connection error indicates token/auth rejection (401/403).
func isAuthError(err error) bool {
	s := err.Error()
	return strings.Contains(s, "401") || strings.Contains(s, "403") || strings.Contains(s, "Unauthorized") || strings.Contains(s, "Forbidden")
}

func main() {
	// Handle subcommands before flag parsing
	if len(os.Args) > 1 {
		switch os.Args[1] {
		case "runtime-worker":
			runRuntimeWorker()
			return
		case "install":
			if err := service.Install(); err != nil {
				log.Fatalf("Install failed: %v", err)
			}
			// Auto-install OpenClaw plugin
			paths := bridge.ResolvePaths()
			if err := plugin.Setup(paths.HyperClaw); err != nil {
				log.Printf("Plugin setup warning: %v", err)
			}
			return
		case "uninstall":
			purge := false
			for _, arg := range os.Args[2:] {
				if arg == "--purge" {
					purge = true
				}
			}
			if err := service.Uninstall(!purge); err != nil {
				log.Fatalf("Uninstall failed: %v", err)
			}
			return
		case "status":
			service.Status()
			return
		case "version":
			fmt.Printf("hyperclaw-connector v%s (%s)\n", version, commit)
			return
		case "gateway-setup":
			cfg := config.Parse()
			cfg.ResetGatewayConfig()
			if err := cfg.PromptGatewaySetup(); err != nil {
				log.Fatalf("Gateway setup failed: %v", err)
			}
			return
		}
	}

	startTime := time.Now()
	cfg := config.Parse()

	// Auto-setup: login + create device + get pairing token
	if cfg.DeviceToken == "" && !cfg.EnrollMode {
		if err := setup.AutoSetup(cfg); err != nil {
			log.Fatalf("Setup failed: %v\n\nUsage:\n  ./hyperclaw-connector --email you@example.com --password yourpass\n  ./hyperclaw-connector --token <PAIRING_TOKEN>", err)
		}
	}

	cfg.Version = version

	// Interactive gateway setup if not configured.
	// When running as a daemon (non-interactive), skip this — OpenClaw may not be
	// installed yet and will be provisioned via onboarding-provision-workspace after
	// the device comes online.
	if cfg.GatewayNeedsSetup() {
		if err := cfg.PromptGatewaySetup(); err != nil {
			log.Printf("OpenClaw gateway not configured yet (will be provisioned via hub): %v", err)
		}
	}

	raiseOpenFileLimit()

	log.Printf("HyperClaw Connector v%s (%s)", version, commit)
	log.Printf("Hub: %s | Bridge: native", cfg.HubURL)

	// Create bounded channels for communication. These can carry large chat frames,
	// so keeping the queue modest prevents retained byte slices from ballooning memory.
	// Created early so that agent-change events can be pushed during init.
	gatewayToHub := make(chan []byte, 128)
	hubToGateway := make(chan []byte, 128)

	// Shared flag: tracks whether the local OpenClaw gateway WS is connected.
	// The gateway goroutine toggles it; the hub's GatewayRouter reads it to
	// fast-fail requests when OpenClaw isn't reachable (avoids 30s+ timeouts).
	var gwConnected atomic.Int32

	// Buffered kick channel: onboarding pokes this after `openclaw daemon start`
	// so the reconnect loop wakes from its backoff sleep and dials the freshly
	// started gateway immediately. Prevents "gateway not connected" right after
	// onboarding when the goroutine is already in a ~30s backoff window.
	kickGateway := make(chan struct{}, 1)

	// Context and WaitGroup for graceful shutdown
	ctx, cancel := context.WithCancel(context.Background())
	var shutdownWg sync.WaitGroup
	runtimeWorker := runtimeworker.NewClient("", runtimeworker.DeploymentModeRemote)
	defer runtimeWorker.Shutdown()

	// currentHub tracks the active hub instance so the signal handler can ask
	// it to drain in-flight bridge requests (answering them with an explicit
	// "connector restarting" error) before we exit. Without this, a request
	// that arrives in the last few milliseconds before SIGTERM gets dispatched
	// into a detached goroutine that dies with the process, and the dashboard
	// waits out the 20-minute action timeout with no user feedback.
	var currentHub atomic.Pointer[hub.Hub]

	// Initialize paths and ensure directory structure exists
	paths := bridge.ResolvePaths()
	if err := paths.EnsureDirectories(); err != nil {
		log.Fatalf("Failed to create directory structure: %v", err)
	}

	// Repair openclaw.json if gateway.mode is missing. Without this the
	// OpenClaw daemon refuses to start with "existing config is missing
	// gateway.mode", which cascades into "gateway not connected" for every
	// dashboard request. Idempotent — no-op when mode is already set or
	// when openclaw.json does not exist yet (first-boot onboarding creates it).
	bridge.EnsureOpenClawGatewayModeLocal(paths.OpenClaw)

	// Bootstrap OpenClaw if the gateway was never set up. Without this, users
	// who onboard the connector but skip the runtime-install step (or whose
	// ~/.openclaw was wiped) get stuck with "gateway token missing" forever.
	// Idempotent — returns immediately when gateway.auth.token already exists.
	bridge.BootstrapOpenClawIfNeeded(paths)

	// Re-read gateway config from disk — bootstrap may have written a fresh
	// openclaw.json with the gateway port and auth token.
	cfg.RefreshGatewayConfig()

	// Initialize SQLite store
	dataStore, err := store.New(paths.HyperClaw)
	if err != nil {
		log.Printf("WARNING: SQLite store failed to initialize: %v (falling back to JSON files)", err)
	} else {
		defer dataStore.Close()
		log.Printf("SQLite store ready: %s/data/connector.db", paths.HyperClaw)

		// One-time: migrate legacy JSON files into SQLite
		dataStore.MigrateJSONFiles(paths.HyperClaw)
		dataStore.MigrateIntelCronAnnounces(paths.HyperClaw)

		// Seed model pricing table (INSERT OR IGNORE — safe to call every boot)
		if err := dataStore.SeedModelPrices(); err != nil {
			log.Printf("WARNING: SeedModelPrices: %v", err)
		}

		// Seed agents from OpenClaw on startup
		seedAgents(dataStore, paths.OpenClaw)

		// Seed cron jobs from OpenClaw on startup
		seedCronJobs(dataStore, paths)

		// Seed Hermes crons at startup
		seedHermesCronJobs(dataStore)

		// Periodic maintenance: cleanup old data + refresh agent status
		shutdownWg.Add(1)
		go func() {
			defer shutdownWg.Done()
			maintenanceLoop(ctx, dataStore, paths.OpenClaw, gatewayToHub)
		}()

		// Watch openclaw.json for agent changes (e.g. AI adding new agents or deleting them)
		shutdownWg.Add(1)
		go func() {
			defer shutdownWg.Done()
			watchOpenClawConfig(ctx, paths, dataStore, gatewayToHub)
		}()

		// Watch ~/.hermes/ for Hermes profile additions/removals/renames
		shutdownWg.Add(1)
		go func() {
			defer shutdownWg.Done()
			watchHermesProfiles(ctx, gatewayToHub)
		}()

		// Watch cron/jobs.json for cron job changes
		shutdownWg.Add(1)
		go func() {
			defer shutdownWg.Done()
			watchCronJobsFile(ctx, paths, dataStore)
		}()

		// Watch Hermes cron file
		shutdownWg.Add(1)
		go func() {
			defer shutdownWg.Done()
			watchHermesCronFile(ctx, dataStore)
		}()

		// Seed Codex automations at startup
		seedCodexAutomations(dataStore)

		// Watch Codex automations directory
		shutdownWg.Add(1)
		go func() {
			defer shutdownWg.Done()
			watchCodexAutomations(ctx, dataStore)
		}()

		// Orphan discovery: re-seeds OpenClaw, Hermes, and Codex cron jobs every 5 minutes and
		// runs the 90-day retention sweep on cron_runs.
		orphanScanner := bridge.NewCronOrphanScanner(dataStore,
			func() { seedCronJobs(dataStore, paths) },
			func() { seedHermesCronJobs(dataStore) },
			func() { seedCodexAutomations(dataStore) },
		)
		orphanScanner.Start()
		shutdownWg.Add(1)
		go func() {
			defer shutdownWg.Done()
			<-ctx.Done()
			orphanScanner.Stop()
		}()

		// Periodic runtime health checks
		shutdownWg.Add(1)
		go func() {
			defer shutdownWg.Done()
			runtimeHealthLoop(ctx, dataStore, paths)
		}()

		shutdownWg.Add(1)
		go func() {
			defer shutdownWg.Done()
			teamModeBootstrapLoop(ctx, dataStore, paths)
		}()

		// Hermes token usage sync — immediately at boot, then every 60s.
		// Syncs the root state.db (agentID="hermes") plus any per-profile state.dbs.
		shutdownWg.Add(1)
		go func() {
			defer shutdownWg.Done()
			home, _ := os.UserHomeDir()

			syncHermes := func() {
				totalRows := 0

				// Root agent
				rootDB := filepath.Join(home, ".hermes", "state.db")
				if _, err := os.Stat(rootDB); err == nil {
					n, err := tokenpkg.SyncHermesTokenUsage(rootDB, "hermes", dataStore)
					if err != nil {
						log.Printf("[token] hermes root sync: %v", err)
					} else {
						totalRows += n
					}
				}

				// Per-profile isolated agents: ~/.hermes/profiles/{id}/state.db
				profilesDir := filepath.Join(home, ".hermes", "profiles")
				if entries, err := os.ReadDir(profilesDir); err == nil {
					for _, entry := range entries {
						if !entry.IsDir() {
							continue
						}
						profileID := entry.Name()
						profileDB := filepath.Join(profilesDir, profileID, "state.db")
						if _, statErr := os.Stat(profileDB); statErr != nil {
							continue
						}
						n, err := tokenpkg.SyncHermesTokenUsage(profileDB, profileID, dataStore)
						if err != nil {
							log.Printf("[token] hermes profile %s sync: %v", profileID, err)
						} else {
							totalRows += n
						}
					}
				}

				if totalRows > 0 {
					msg := map[string]interface{}{
						"type":  "evt",
						"event": "token.usage.updated",
						"data":  map[string]interface{}{"source": "hermes", "rows": totalRows},
					}
					payload, _ := json.Marshal(msg)
					select {
					case gatewayToHub <- payload:
					default:
					}
				}
			}

			syncHermes() // immediate boot sync
			ticker := time.NewTicker(60 * time.Second)
			defer ticker.Stop()
			for {
				select {
				case <-ticker.C:
					syncHermes()
				case <-ctx.Done():
					return
				}
			}
		}()
	}

	// Initialize Intel DB store (separate intel.db)
	intelStore, err := store.NewIntelStore(paths.HyperClaw)
	if err != nil {
		log.Printf("WARNING: Intel store failed to initialize: %v", err)
	} else {
		defer intelStore.Close()
		log.Printf("Intel store ready: %s/data/intel.db", paths.HyperClaw)
	}

	// --- SyncEngine: file ↔ SQLite real-time sync ---
	var syncEng bridge.SyncEngineIface
	if dataStore != nil {
		home, _ := os.UserHomeDir()
		hubNotifier := func(eventType string, data map[string]interface{}) {
			msg := map[string]interface{}{
				"type":  "evt",
				"event": eventType,
				"data":  data,
			}
			payload, _ := json.Marshal(msg)
			select {
			case gatewayToHub <- payload:
			default:
				log.Printf("[sync] hub channel full, dropped %s event", eventType)
			}
		}
		se, syncErr := syncp.New(dataStore, hubNotifier, home)
		if syncErr != nil {
			log.Printf("[sync] failed to start SyncEngine: %v", syncErr)
		} else {
			syncEng = se
			defer se.Stop()
			log.Printf("[sync] SyncEngine started")
		}
	}

	// Auto-install OpenClaw plugin in background (idempotent)
	go func() {
		if err := plugin.Setup(paths.HyperClaw); err != nil {
			log.Printf("Plugin auto-setup: %v", err)
		}
	}()

	// Separate event channels so each reconnection loop only sees its own disconnect events.
	// Previously a shared channel caused one loop to steal the other's disconnect signal,
	// preventing reconnection.
	gwEvents := make(chan string, 256)
	hubEvents := make(chan string, 256)

	// Signal handling
	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)

	// Start gateway connection with reconnection
	shutdownWg.Add(1)
	go func() {
		defer shutdownWg.Done()
		attempt := 0
		for {
			select {
			case <-ctx.Done():
				return
			default:
			}
			cfg.RefreshGatewayConfig()
			gwURL := cfg.GatewayURL
			if gwURL == "" {
				gwURL = fmt.Sprintf("ws://%s:%d/gateway", cfg.GatewayHost, cfg.GatewayPort)
			}
			gw := gateway.New(cfg)
			if dataStore != nil {
				gw.SetStore(dataStore)
			}
			if err := gw.Connect(gatewayToHub, hubToGateway, gwEvents); err != nil {
				delay := backoffDelay(attempt)
				if attempt == 0 {
					// First failure: give a helpful message
					if strings.Contains(err.Error(), "connection refused") {
						log.Printf("Waiting for OpenClaw gateway at %s ...", gwURL)
						log.Println("  Make sure OpenClaw is running. The connector will keep retrying.")
					} else {
						log.Printf("Gateway connection error: %v", err)
					}
				} else if attempt%10 == 0 {
					// Periodic reminder every ~10 attempts so it's not silent forever
					log.Printf("Still waiting for OpenClaw gateway at %s (attempt %d)", gwURL, attempt+1)
				}
				attempt++
				select {
				case <-ctx.Done():
					return
				case <-kickGateway:
					// Onboarding just started the daemon — retry immediately.
				case <-time.After(delay):
				}
				continue
			}
			if attempt > 0 {
				log.Printf("Gateway connected after %d attempt(s)", attempt)
			}
			gwConnected.Store(1)
			connectedAt := time.Now()
			attempt = 0
			// Wait for disconnect event
			for evt := range gwEvents {
				if evt == "gateway:disconnected" {
					break
				}
			}
			gwConnected.Store(0)
			// Drain stale events so sender goroutines don't block
		drainGw:
			for {
				select {
				case <-gwEvents:
				default:
					break drainGw
				}
			}
			log.Println("Gateway disconnected, reconnecting...")
			// Use exponential backoff for rapid disconnects (connected < 30s),
			// quick retry only when the connection was stable for a while.
			if time.Since(connectedAt) < 30*time.Second {
				attempt++
			} else {
				attempt = 0
			}
			reconDelay := backoffDelay(attempt)
			select {
			case <-ctx.Done():
				return
			case <-kickGateway:
			case <-time.After(reconDelay):
			}
		}
	}()

	// Start hub connection with reconnection and self-healing token refresh
	shutdownWg.Add(1)
	go func() {
		defer shutdownWg.Done()
		attempt := 0
		tokenRefreshAttempts := 0
		for {
			select {
			case <-ctx.Done():
				return
			default:
			}
			h := hub.New(cfg)
			h.SetGatewayFlag(&gwConnected)
			h.SetGatewayKick(kickGateway)
			h.SetRuntimeWorker(runtimeWorker)
			if dataStore != nil {
				h.SetStore(dataStore)
			}
			if intelStore != nil {
				h.SetIntelStore(intelStore)
			}
			if syncEng != nil {
				h.SetSyncEngine(syncEng)
			}
			currentHub.Store(h)
			connStart := time.Now()
			if err := h.Connect(hubToGateway, gatewayToHub, hubEvents); err != nil {
				// Self-healing: if auth error, try refreshing the pairing token
				if isAuthError(err) && tokenRefreshAttempts < 3 {
					log.Printf("Hub auth error: %v — attempting token refresh...", err)
					if newToken, refreshErr := setup.RefreshToken(cfg); refreshErr == nil {
						log.Printf("Token refreshed successfully (new token: %s...)", newToken[:8])
						tokenRefreshAttempts++
						attempt = 0
						time.Sleep(2 * time.Second)
						continue
					} else {
						log.Printf("Token refresh failed: %v", refreshErr)
						tokenRefreshAttempts++
					}
				}

				delay := backoffDelay(attempt)
				log.Printf("Hub connection error: %v (reconnecting in %s)", err, delay)
				attempt++
				time.Sleep(delay)
				continue
			}

			// Connection succeeded — reset counters and send immediate health ping
			// so the hub knows we're online without waiting up to 60s.
			attempt = 0
			tokenRefreshAttempts = 0
			healthEvt := connectorHealthEvent(version, startTime, gwConnected.Load() == 1)
			if data, err := json.Marshal(healthEvt); err == nil {
				select {
				case gatewayToHub <- data:
				default:
				}
			}

			// Wait for disconnect event OR shutdown signal. If ctx is canceled
			// (SIGINT/SIGTERM) while the hub is connected, start graceful
			// shutdown so in-flight bridge actions return an explicit
			// "connector restarting" response instead of orphaning goroutines
			// and letting the dashboard hang on the 20-minute action timeout.
		waitHub:
			for {
				select {
				case evt, ok := <-hubEvents:
					if !ok {
						break waitHub
					}
					if evt == "hub:disconnected" {
						break waitHub
					}
				case <-ctx.Done():
					h.ShutdownGracefully(3 * time.Second)
					_ = h.Close()
					// Drain any remaining event so close can proceed.
					select {
					case <-hubEvents:
					default:
					}
					return
				}
			}
			// Drain stale events so sender goroutines don't block
		drainHub:
			for {
				select {
				case <-hubEvents:
				default:
					break drainHub
				}
			}

			// If the connection lasted > 30s, it was a healthy session — quick retry.
			// If it dropped almost immediately, use exponential backoff to avoid
			// rapid connect/disconnect cycling that keeps the profile red.
			connDuration := time.Since(connStart)
			if connDuration < 30*time.Second {
				attempt++
				log.Printf("Hub disconnected after %s (short-lived), reconnecting with backoff...", connDuration.Round(time.Second))
			} else {
				attempt = 0
				log.Println("Hub disconnected, reconnecting...")
			}
			time.Sleep(backoffDelay(attempt))
		}
	}()

	// Health reporting: periodic status to hub
	shutdownWg.Add(1)
	go func() {
		defer shutdownWg.Done()
		ticker := time.NewTicker(60 * time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-ticker.C:
				healthEvt := connectorHealthEvent(version, startTime, gwConnected.Load() == 1)
				data, _ := json.Marshal(healthEvt)
				select {
				case gatewayToHub <- data:
				default:
				}
			case <-ctx.Done():
				return
			}
		}
	}()

	// Local HTTP bridge so the app can call the connector directly
	// without going through the Hub (fallback when Hub WS is unavailable).
	// Runs in a retry loop so it auto-recovers if the port is killed.
	// Self-probe first: if another connector instance already owns :18790,
	// exit fast so launchd surfaces the conflict instead of us spinning
	// forever in a bind-failure retry loop.
	if isBridgePortOwnedByAnotherInstance(18790) {
		log.Fatalf("Local bridge port 18790 is already held by a healthy connector instance; refusing to start a second copy.")
	}
	shutdownWg.Add(1)
	go func() {
		defer shutdownWg.Done()
		startLocalBridgeWithRetry(ctx, 18790, dataStore, intelStore, syncEng, runtimeWorker, gatewayToHub, &gwConnected, kickGateway)
	}()

	<-sigCh
	log.Println("Shutting down...")
	// Start bridge drain BEFORE canceling ctx so in-flight actions get a
	// chance to either complete or be told "connector restarting" explicitly.
	// Reconnect loops then exit when ctx is canceled below.
	if h := currentHub.Load(); h != nil {
		drained := h.ShutdownGracefully(3 * time.Second)
		if drained {
			log.Println("Bridge drained cleanly.")
		} else {
			log.Println("Bridge drain timed out — in-flight requests answered with restart error.")
		}
	}
	cancel()
	shutdownDone := make(chan struct{})
	go func() {
		shutdownWg.Wait()
		close(shutdownDone)
	}()
	select {
	case <-shutdownDone:
		log.Println("Clean shutdown complete.")
	case <-time.After(30 * time.Second):
		log.Println("Shutdown timeout — forcing exit.")
	}
}

// isBridgePortOwnedByAnotherInstance returns true when :port is already
// serving our /bridge/health endpoint. That means another connector process
// owns the port — we must not start a second instance and race the listener.
func isBridgePortOwnedByAnotherInstance(port int) bool {
	client := &http.Client{Timeout: 500 * time.Millisecond}
	resp, err := client.Get(fmt.Sprintf("http://127.0.0.1:%d/bridge/health", port))
	if err != nil {
		return false
	}
	defer resp.Body.Close()
	return resp.StatusCode == http.StatusOK
}

func connectorHealthEvent(version string, startTime time.Time, gatewayConnected bool) protocol.Message {
	gatewayState := "disconnected"
	if gatewayConnected {
		gatewayState = "connected"
	}
	return protocol.NewEvent("connector.health", map[string]interface{}{
		"version":          version,
		"bridge":           "native",
		"uptime":           time.Since(startTime).String(),
		"connectorOnline":  true,
		"gatewayConnected": gatewayConnected,
		"gatewayState":     gatewayState,
		"ts":               time.Now().UnixMilli(),
	})
}

// startLocalBridgeWithRetry wraps startLocalBridge in a retry loop so the
// bridge auto-recovers if the listener is killed (e.g. `kill` on the port).
// Returns when ctx is canceled so shutdown releases the port before launchd
// can respawn the daemon and race the still-bound socket.
func startLocalBridgeWithRetry(ctx context.Context, port int, dataStore *store.Store, intelStore *store.IntelStore, syncEng bridge.SyncEngineIface, runtimeWorker bridge.RuntimeWorker, hubBroadcast chan<- []byte, gwConnected *atomic.Int32, kickGateway chan<- struct{}) {
	attempt := 0
	for {
		if ctx.Err() != nil {
			return
		}
		err := startLocalBridge(ctx, port, dataStore, intelStore, syncEng, runtimeWorker, hubBroadcast, gwConnected, kickGateway)
		if ctx.Err() != nil {
			return
		}
		attempt++
		delay := backoffDelay(attempt)
		log.Printf("Local bridge exited: %v (restarting in %s, attempt %d)", err, delay, attempt)
		select {
		case <-time.After(delay):
		case <-ctx.Done():
			return
		}
	}
}

// startLocalBridge runs a minimal HTTP server on localhost for direct bridge calls.
// The app falls back to this when the Hub WebSocket relay is unavailable.
// Returns an error when the listener stops so the caller can retry. When ctx
// is canceled the server is gracefully shut down so the port is released
// before process exit.
func startLocalBridge(ctx context.Context, port int, dataStore *store.Store, intelStore *store.IntelStore, syncEng bridge.SyncEngineIface, runtimeWorker bridge.RuntimeWorker, hubBroadcast chan<- []byte, gwConnected *atomic.Int32, kickGateway chan<- struct{}) error {
	bh := bridge.NewBridgeHandler()
	bh.SetRuntimeWorker(runtimeWorker)
	if gwConnected != nil {
		bh.SetGatewayFlag(gwConnected)
	}
	if kickGateway != nil {
		bh.SetGatewayKick(kickGateway)
	}
	if hubBroadcast != nil {
		bh.SetHubBroadcast(hubBroadcast)
	}
	if dataStore != nil {
		bh.SetStore(dataStore)
	}
	if intelStore != nil {
		bh.SetIntelStore(intelStore)
	}
	if syncEng != nil {
		bh.SetSyncEngine(syncEng)
	}

	// Load device key for credential encryption (same key as hub.go uses)
	// Try credentials/ subdirectory first, then legacy location
	home, _ := os.UserHomeDir()
	keyPath := filepath.Join(home, ".hyperclaw", "credentials", "device.key")
	keyData, err := os.ReadFile(keyPath)
	if err != nil {
		// Fallback to legacy location
		keyPath = filepath.Join(home, ".hyperclaw", "device.key")
		keyData, err = os.ReadFile(keyPath)
	}
	if err == nil {
		keyBytes, _ := base64.StdEncoding.DecodeString(strings.TrimSpace(string(keyData)))
		if len(keyBytes) == ed25519.PrivateKeySize {
			bh.SetDeviceKey(ed25519.PrivateKey(keyBytes))
		}
	}
	// Bearer token for local listener auth. Stable across restarts so
	// configured MCP clients (Claude Code, Codex, OpenClaw) keep working
	// — rotation is opt-in via `hyperclaw-connector token rotate`.
	tokenManager := localauth.New(filepath.Join(home, ".hyperclaw"))
	if _, err := tokenManager.LoadOrCreate(); err != nil {
		log.Printf("WARNING: failed to load/create connector token: %v (auth disabled)", err)
	}
	// During the rollout window, the dashboard fallback path may not yet
	// send the bearer header. authStrict=false accepts unauth calls but
	// logs them so the rollout can be measured. Flip to true after the
	// dashboard ships its token-aware client.
	authStrict := os.Getenv("HYPERCLAW_AUTH_STRICT") == "1"

	// Allowed origins for state-changing requests. The dashboard runs on
	// :1000 (Next.js dev) or its production build origin; everything else
	// gets denied so a malicious local webpage can't piggyback on the
	// browser's permissive CORS handling.
	allowedOrigins := map[string]bool{
		"http://localhost:1000": true,
		"http://127.0.0.1:1000": true,
	}
	corsOrigin := func(r *http.Request) string {
		origin := r.Header.Get("Origin")
		if origin == "" {
			// Direct curl / non-browser callers don't send Origin; that's
			// fine — they're not subject to CORS at all.
			return ""
		}
		if allowedOrigins[origin] {
			return origin
		}
		return ""
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/bridge", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "POST only", http.StatusMethodNotAllowed)
			return
		}
		if origin := corsOrigin(r); origin != "" {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Vary", "Origin")
		}
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		w.Header().Set("Content-Type", "application/json")

		// Bearer auth. In non-strict (rollout) mode, missing tokens are
		// logged but allowed; wrong tokens are always rejected.
		if err := tokenManager.Verify(r.Header.Get("Authorization")); err != nil {
			if errors.Is(err, localauth.ErrInvalidToken) || authStrict {
				w.WriteHeader(http.StatusUnauthorized)
				_ = json.NewEncoder(w).Encode(map[string]interface{}{"success": false, "error": "unauthorized"})
				return
			}
			log.Printf("[auth] /bridge unauth call permitted (rollout mode); set HYPERCLAW_AUTH_STRICT=1 to enforce")
		}

		var params map[string]interface{}
		if err := json.NewDecoder(r.Body).Decode(&params); err != nil {
			json.NewEncoder(w).Encode(map[string]interface{}{"success": false, "error": "invalid JSON"})
			return
		}
		action, _ := params["action"].(string)
		if action == "" {
			json.NewEncoder(w).Encode(map[string]interface{}{"success": false, "error": "missing action"})
			return
		}
		result := bh.Dispatch(action, params)
		json.NewEncoder(w).Encode(result)
	})
	mux.HandleFunc("/bridge/health", func(w http.ResponseWriter, r *http.Request) {
		// Health stays unauth — used by Electron's reachability probe and
		// container healthchecks. No state, no secrets.
		if origin := corsOrigin(r); origin != "" {
			w.Header().Set("Access-Control-Allow-Origin", origin)
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(bh.Dispatch("connector-health", map[string]interface{}{}))
	})
	// MCP server: exposes the curated hyperclawBuiltinTools surface as
	// Streamable HTTP MCP. Any agent runtime that speaks MCP (Claude Code,
	// Codex, OpenClaw) can attach via http://127.0.0.1:<port>/mcp and call
	// the same tools the dashboard does, routed through the same dispatcher.
	mcpSrv := hyperclawmcp.NewServer(bh)
	mcpSrv.Mount(mux, "/mcp")
	log.Printf("Local MCP: http://127.0.0.1:%d/mcp", port)
	// CORS preflight + bearer auth wrapper for /mcp routes (mcp-go's
	// transport doesn't know about our auth model, so we wrap the mux).
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodOptions {
			if origin := corsOrigin(r); origin != "" {
				w.Header().Set("Access-Control-Allow-Origin", origin)
				w.Header().Set("Vary", "Origin")
			}
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
			w.Header().Set("Access-Control-Max-Age", "86400")
			w.WriteHeader(http.StatusNoContent)
			return
		}
		// Auth is required on /mcp and /mcp/call. /bridge does its own
		// auth above. /bridge/health is unauth by design.
		if strings.HasPrefix(r.URL.Path, "/mcp") {
			if err := tokenManager.Verify(r.Header.Get("Authorization")); err != nil {
				if errors.Is(err, localauth.ErrInvalidToken) || authStrict {
					w.WriteHeader(http.StatusUnauthorized)
					_, _ = w.Write([]byte(`{"jsonrpc":"2.0","error":{"code":-32001,"message":"unauthorized"}}`))
					return
				}
				log.Printf("[auth] %s unauth call permitted (rollout mode)", r.URL.Path)
			}
		}
		mux.ServeHTTP(w, r)
	})
	addr := fmt.Sprintf("127.0.0.1:%d", port)
	listener, err := net.Listen("tcp", addr)
	if err != nil {
		return fmt.Errorf("bind %s: %w", addr, err)
	}
	srv := &http.Server{Handler: handler}
	log.Printf("Local bridge: http://%s/bridge", addr)

	shutdownDone := make(chan struct{})
	go func() {
		<-ctx.Done()
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = srv.Shutdown(shutdownCtx)
		close(shutdownDone)
	}()

	serveErr := srv.Serve(listener)
	if serveErr == http.ErrServerClosed {
		<-shutdownDone
		return nil
	}
	return serveErr
}

// seedAgents resolves the live agent team and upserts into SQLite.
// Returns true if the set of agents changed (added or removed).
func seedAgents(dataStore *store.Store, openclawDir string) bool {
	bh := bridge.NewBridgeHandler()
	team := bh.ResolveTeam()
	if len(team) == 0 {
		return false
	}

	// Snapshot current agents to detect changes.
	before, _ := dataStore.GetAgents()
	beforeIDs := make(map[string]bool, len(before))
	for _, a := range before {
		beforeIDs[a.ID] = true
	}

	seeds := make([]store.SeedAgent, len(team))
	afterIDs := make(map[string]bool, len(team))
	for i, a := range team {
		seeds[i] = store.SeedAgent{
			ID:     a.ID,
			Name:   a.Name,
			Role:   a.Role,
			Status: a.Status,
		}
		afterIDs[a.ID] = true
	}
	if err := dataStore.SeedAgents(seeds); err != nil {
		log.Printf("Agent seeding error: %v", err)
		return false
	}
	log.Printf("Seeded %d agents into SQLite", len(seeds))

	// Clean up orphan workspace directories that no longer have a matching
	// agent in openclaw.json. This prevents deleted agents from lingering
	// in file listings or workspace-scan fallbacks.
	if openclawDir != "" {
		cleanOrphanWorkspaces(openclawDir, afterIDs)
	}

	// Detect additions or removals.
	if len(beforeIDs) != len(afterIDs) {
		return true
	}
	for id := range afterIDs {
		if !beforeIDs[id] {
			return true
		}
	}
	for id := range beforeIDs {
		if !afterIDs[id] {
			return true
		}
	}
	return false
}

// cleanOrphanWorkspaces removes workspace-{id} directories that have no
// matching agent in the active agent set. "main" workspace is always kept.
func cleanOrphanWorkspaces(openclawDir string, activeIDs map[string]bool) {
	entries, err := os.ReadDir(openclawDir)
	if err != nil {
		return
	}
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		name := entry.Name()
		if !strings.HasPrefix(name, "workspace-") {
			continue
		}
		agentID := strings.TrimPrefix(name, "workspace-")
		if agentID == "" || agentID == "main" || activeIDs[agentID] {
			continue
		}
		wsPath := filepath.Join(openclawDir, name)
		log.Printf("Removing orphan workspace: %s", wsPath)
		os.RemoveAll(wsPath)
	}
}

// sendAgentsChangedEvent pushes an agents.changed event to the hub so
// connected dashboards can refresh their agent list in real-time.
// Uses the gateway wire format (top-level "event" field) so the dashboard
// WS handler can match it with gatewayConnection.on("agents.changed", ...).
func sendAgentsChangedEvent(toHub chan<- []byte) {
	msg := map[string]interface{}{
		"type":  "evt",
		"event": "agents.changed",
		"data": map[string]interface{}{
			"ts": time.Now().UnixMilli(),
		},
	}
	data, _ := json.Marshal(msg)
	select {
	case toHub <- data:
		log.Println("Sent agents.changed event to hub")
	default:
		log.Println("agents.changed event dropped (hub channel full)")
	}
}

// maintenanceLoop runs periodic cleanup and agent refresh.
func maintenanceLoop(ctx context.Context, dataStore *store.Store, openclawDir string, toHub chan<- []byte) {
	// Run cleanup once at startup
	dataStore.Cleanup()

	cleanupTicker := time.NewTicker(6 * time.Hour)
	agentRefreshTicker := time.NewTicker(10 * time.Minute)
	defer cleanupTicker.Stop()
	defer agentRefreshTicker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-cleanupTicker.C:
			dataStore.Cleanup()
			// Prune token_usage rows older than 90 days.
			cutoff := time.Now().AddDate(0, 0, -90).UnixMilli()
			if n, err := dataStore.PruneTokenUsage(cutoff); err != nil {
				log.Printf("Maintenance: prune token_usage error: %v", err)
			} else if n > 0 {
				log.Printf("Maintenance: pruned %d old token_usage rows", n)
			}
			sizeMB := float64(dataStore.DBSizeBytes()) / (1024 * 1024)
			log.Printf("Maintenance: DB size %.1f MB", sizeMB)
		case <-agentRefreshTicker.C:
			if changed := seedAgents(dataStore, openclawDir); changed {
				sendAgentsChangedEvent(toHub)
			}
		}
	}
}

// watchOpenClawConfig uses fsnotify to watch ~/.openclaw/openclaw.json for changes.
// When the file is modified (e.g. AI adds a new agent or deletes one), it debounces
// and re-seeds agents into SQLite so changes appear immediately without waiting for
// the 10-minute poll. If agents changed, an event is sent to the hub.
func watchOpenClawConfig(ctx context.Context, paths bridge.Paths, dataStore *store.Store, toHub chan<- []byte) {
	configPath := paths.ConfigPath()

	watcher, err := fsnotify.NewWatcher()
	if err != nil {
		log.Printf("Config watcher: failed to create: %v", err)
		return
	}
	defer watcher.Close()

	// Watch the directory, not the file directly — editors often delete + recreate
	// the file on save, which would remove the watch on the old inode.
	configDir := paths.OpenClaw
	if err := watcher.Add(configDir); err != nil {
		log.Printf("Config watcher: failed to watch %s: %v", configDir, err)
		return
	}
	log.Printf("Config watcher: watching %s for agent changes", configPath)

	// Debounce: wait 2s after the last write before re-seeding, to avoid
	// rapid-fire seeding when the file is written multiple times in quick succession.
	var debounceTimer *time.Timer

	for {
		select {
		case <-ctx.Done():
			return
		case event, ok := <-watcher.Events:
			if !ok {
				return
			}
			// Only react to writes/creates of openclaw.json
			if event.Name != configPath {
				continue
			}
			isWrite := event.Has(fsnotify.Write) || event.Has(fsnotify.Create)
			if !isWrite {
				continue
			}

			// Reset debounce timer
			if debounceTimer != nil {
				debounceTimer.Stop()
			}
			debounceTimer = time.AfterFunc(2*time.Second, func() {
				log.Printf("Config watcher: openclaw.json changed, re-seeding agents...")
				if changed := seedAgents(dataStore, paths.OpenClaw); changed {
					sendAgentsChangedEvent(toHub)
				}
			})

		case err, ok := <-watcher.Errors:
			if !ok {
				return
			}
			log.Printf("Config watcher error: %v", err)
		}
	}
}

// snapshotHermesProfiles returns the current set of Hermes profile IDs.
// Used by watchHermesProfiles to detect additions and removals.
func snapshotHermesProfiles() map[string]bool {
	home, _ := os.UserHomeDir()
	hermesHome := filepath.Join(home, ".hermes")
	snapshot := make(map[string]bool)
	if _, err := os.Stat(hermesHome); err != nil {
		return snapshot
	}
	snapshot["__main__"] = true
	profilesDir := filepath.Join(hermesHome, "profiles")
	entries, err := os.ReadDir(profilesDir)
	if err != nil {
		return snapshot
	}
	for _, e := range entries {
		if e.IsDir() {
			snapshot[e.Name()] = true
		}
	}
	return snapshot
}

// watchHermesProfiles uses fsnotify to watch the Hermes home and profiles directory
// for changes. When profiles are added, removed, or renamed (IDENTITY.md updated),
// an agents.changed event is sent to the hub so connected dashboards refresh
// immediately — mirroring the watchOpenClawConfig pattern for OpenClaw agents.
func watchHermesProfiles(ctx context.Context, toHub chan<- []byte) {
	home, _ := os.UserHomeDir()
	hermesHome := filepath.Join(home, ".hermes")
	profilesDir := filepath.Join(hermesHome, "profiles")

	// Wait for ~/.hermes to exist; Hermes may not be installed at connector start.
	for {
		if _, err := os.Stat(hermesHome); err == nil {
			break
		}
		time.Sleep(30 * time.Second)
	}

	watcher, err := fsnotify.NewWatcher()
	if err != nil {
		log.Printf("Hermes watcher: failed to create: %v", err)
		return
	}
	defer watcher.Close()

	// Watch ~/.hermes/ — catches IDENTITY.md changes for the main profile.
	if err := watcher.Add(hermesHome); err != nil {
		log.Printf("Hermes watcher: failed to watch %s: %v", hermesHome, err)
		return
	}

	// Watch ~/.hermes/profiles/ — catches new/deleted profile directories.
	// Create the dir if it doesn't exist yet so the watch doesn't fail.
	if mkErr := os.MkdirAll(profilesDir, 0755); mkErr == nil {
		if err := watcher.Add(profilesDir); err != nil {
			log.Printf("Hermes watcher: failed to watch %s: %v", profilesDir, err)
		}
	}

	log.Printf("Hermes watcher: watching %s for profile changes", hermesHome)

	prev := snapshotHermesProfiles()
	var debounceTimer *time.Timer

	checkAndNotify := func() {
		curr := snapshotHermesProfiles()
		changed := len(curr) != len(prev)
		if !changed {
			for id := range curr {
				if !prev[id] {
					changed = true
					break
				}
			}
		}
		if !changed {
			for id := range prev {
				if !curr[id] {
					changed = true
					break
				}
			}
		}
		if changed {
			log.Printf("Hermes watcher: profile roster changed, notifying dashboard")
			prev = curr
			sendAgentsChangedEvent(toHub)
		}
	}

	for {
		select {
		case <-ctx.Done():
			return
		case event, ok := <-watcher.Events:
			if !ok {
				return
			}
			// React to profile dir creates/removes and IDENTITY.md writes (display name changes).
			isRelevant := event.Has(fsnotify.Create) || event.Has(fsnotify.Remove) ||
				(event.Has(fsnotify.Write) && filepath.Base(event.Name) == "IDENTITY.md")
			if !isRelevant {
				continue
			}
			if debounceTimer != nil {
				debounceTimer.Stop()
			}
			debounceTimer = time.AfterFunc(2*time.Second, checkAndNotify)

		case err, ok := <-watcher.Errors:
			if !ok {
				return
			}
			log.Printf("Hermes watcher error: %v", err)
		}
	}
}

// readHermesCronJobsForSeed parses ~/.hermes/cron/jobs.json into SeedCronJob structs.
func readHermesCronJobsForSeed() ([]store.SeedCronJob, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return nil, err
	}
	jobsPath := filepath.Join(home, ".hermes", "cron", "jobs.json")
	data, err := os.ReadFile(jobsPath)
	if err != nil {
		return nil, err
	}

	var file struct {
		Jobs []json.RawMessage `json:"jobs"`
	}
	if err := json.Unmarshal(data, &file); err != nil {
		return nil, err
	}

	var seeds []store.SeedCronJob
	for _, raw := range file.Jobs {
		var job struct {
			ID      string `json:"id"`
			Name    string `json:"name"`
			Enabled *bool  `json:"enabled"`
			State   string `json:"state"`
		}
		if err := json.Unmarshal(raw, &job); err != nil || job.ID == "" {
			continue
		}
		// Hermes uses "state" field — "paused" means disabled
		enabled := true
		if job.Enabled != nil {
			enabled = *job.Enabled
		}
		if job.State == "paused" || job.State == "completed" {
			enabled = false
		}
		name := job.Name
		if name == "" {
			name = job.ID
		}
		seeds = append(seeds, store.SeedCronJob{
			ID:      job.ID,
			Runtime: "hermes",
			AgentID: "", // Hermes is single-agent
			Name:    name,
			Enabled: enabled,
			RawJSON: string(raw),
		})
	}
	return seeds, nil
}

// seedHermesCronJobs reads ~/.hermes/cron/jobs.json and upserts into SQLite.
func seedHermesCronJobs(dataStore *store.Store) {
	jobs, err := readHermesCronJobsForSeed()
	if err != nil {
		// Don't log error if file doesn't exist — Hermes may not be installed
		if !os.IsNotExist(err) {
			log.Printf("Hermes cron seeding: %v", err)
		}
		return
	}
	added, updated, removed, err := dataStore.SeedCronJobs("hermes", jobs)
	if err != nil {
		log.Printf("Hermes cron seeding error: %v", err)
		return
	}
	if added > 0 || updated > 0 || removed > 0 {
		log.Printf("Hermes cron: seeded %d jobs (added=%d, updated=%d, removed=%d)",
			len(jobs), added, updated, removed)
	}
}

// watchHermesCronFile watches ~/.hermes/cron/ for changes to jobs.json.
// Watches the directory (not the file) because editors replace files on save.
// Falls back to periodic mtime checks if fsnotify fails.
func watchHermesCronFile(ctx context.Context, dataStore *store.Store) {
	home, err := os.UserHomeDir()
	if err != nil {
		log.Printf("Hermes cron watcher: cannot determine home dir: %v", err)
		return
	}
	cronDir := filepath.Join(home, ".hermes", "cron")
	cronFile := filepath.Join(cronDir, "jobs.json")

	// Wait for the cron directory to exist (Hermes creates it on first cron add)
	for {
		if _, err := os.Stat(cronDir); err == nil {
			break
		}
		select {
		case <-ctx.Done():
			return
		case <-time.After(30 * time.Second):
		}
	}

	watcher, err := fsnotify.NewWatcher()
	if err != nil {
		log.Printf("Hermes cron watcher: failed to create: %v", err)
		go hermesCronMtimeFallback(cronFile, dataStore)
		return
	}
	defer watcher.Close()

	if err := watcher.Add(cronDir); err != nil {
		log.Printf("Hermes cron watcher: failed to watch %s: %v", cronDir, err)
		go hermesCronMtimeFallback(cronFile, dataStore)
		return
	}
	log.Printf("Hermes cron watcher: watching %s for cron job changes", cronFile)

	// Also start mtime fallback in case watcher dies silently
	go hermesCronMtimeFallback(cronFile, dataStore)

	var debounceTimer *time.Timer

	for {
		select {
		case <-ctx.Done():
			return
		case event, ok := <-watcher.Events:
			if !ok {
				return
			}
			// Only react to writes/creates of jobs.json
			if filepath.Base(event.Name) != "jobs.json" {
				continue
			}
			isWrite := event.Has(fsnotify.Write) || event.Has(fsnotify.Create)
			if !isWrite {
				continue
			}

			if debounceTimer != nil {
				debounceTimer.Stop()
			}
			debounceTimer = time.AfterFunc(2*time.Second, func() {
				log.Printf("Hermes cron watcher: jobs.json changed, re-seeding cron jobs...")
				seedHermesCronJobs(dataStore)
			})

		case err, ok := <-watcher.Errors:
			if !ok {
				return
			}
			log.Printf("Hermes cron watcher error: %v", err)
		}
	}
}

// hermesCronMtimeFallback periodically checks if Hermes jobs.json has been modified.
// This catches changes if the fsnotify watcher dies silently.
func hermesCronMtimeFallback(cronFile string, dataStore *store.Store) {
	var lastMtime time.Time

	// Initialize last mtime
	if info, err := os.Stat(cronFile); err == nil {
		lastMtime = info.ModTime()
	}

	ticker := time.NewTicker(60 * time.Second)
	defer ticker.Stop()

	for range ticker.C {
		info, err := os.Stat(cronFile)
		if err != nil {
			continue
		}
		if info.ModTime().After(lastMtime) {
			lastMtime = info.ModTime()
			log.Printf("Hermes cron mtime fallback: jobs.json modified, re-seeding...")
			seedHermesCronJobs(dataStore)
		}
	}
}

// seedCronJobs reads cron/jobs.json and upserts into SQLite.
func seedCronJobs(dataStore *store.Store, paths bridge.Paths) {
	jobs, err := readCronJobsForSeed(paths)
	if err != nil {
		log.Printf("Cron seeding: no jobs.json yet: %v", err)
		return
	}

	added, updated, removed, err := dataStore.SeedCronJobs("openclaw", jobs)
	if err != nil {
		log.Printf("Cron seeding error: %v", err)
		return
	}
	log.Printf("Seeded %d cron jobs into SQLite (added=%d, updated=%d, removed=%d)",
		len(jobs), added, updated, removed)
}

// readCronJobsForSeed parses jobs.json into SeedCronJob structs.
func readCronJobsForSeed(paths bridge.Paths) ([]store.SeedCronJob, error) {
	data, err := os.ReadFile(paths.CronJobsPath())
	if err != nil {
		return nil, err
	}

	var file struct {
		Jobs []json.RawMessage `json:"jobs"`
	}
	if err := json.Unmarshal(data, &file); err != nil {
		return nil, err
	}

	seeds := make([]store.SeedCronJob, 0, len(file.Jobs))
	for _, raw := range file.Jobs {
		var job struct {
			ID      string `json:"id"`
			AgentID string `json:"agentId"`
			Name    string `json:"name"`
			Enabled *bool  `json:"enabled"`
		}
		if err := json.Unmarshal(raw, &job); err != nil {
			continue
		}
		enabled := true
		if job.Enabled != nil {
			enabled = *job.Enabled
		}
		seeds = append(seeds, store.SeedCronJob{
			ID:      job.ID,
			Runtime: "openclaw",
			AgentID: job.AgentID,
			Name:    job.Name,
			Enabled: enabled,
			RawJSON: string(raw),
		})
	}
	return seeds, nil
}

// watchCronJobsFile watches ~/.openclaw/cron/ for changes to jobs.json.
// Watches the directory (not the file) because editors replace files on save.
// Falls back to periodic mtime checks if fsnotify fails.
func watchCronJobsFile(ctx context.Context, paths bridge.Paths, dataStore *store.Store) {
	cronDir := filepath.Join(paths.OpenClaw, "cron")
	cronFile := paths.CronJobsPath()

	// Wait for the cron directory to exist (OpenClaw creates it on first cron add)
	for {
		if _, err := os.Stat(cronDir); err == nil {
			break
		}
		time.Sleep(30 * time.Second)
	}

	watcher, err := fsnotify.NewWatcher()
	if err != nil {
		log.Printf("Cron watcher: failed to create: %v", err)
		go cronMtimeFallback(paths, dataStore)
		return
	}
	defer watcher.Close()

	if err := watcher.Add(cronDir); err != nil {
		log.Printf("Cron watcher: failed to watch %s: %v", cronDir, err)
		go cronMtimeFallback(paths, dataStore)
		return
	}
	log.Printf("Cron watcher: watching %s for cron job changes", cronFile)

	// Also start mtime fallback in case watcher dies silently
	go cronMtimeFallback(paths, dataStore)

	var debounceTimer *time.Timer

	for {
		select {
		case <-ctx.Done():
			return
		case event, ok := <-watcher.Events:
			if !ok {
				return
			}
			// Only react to writes/creates of jobs.json
			if filepath.Base(event.Name) != "jobs.json" {
				continue
			}
			isWrite := event.Has(fsnotify.Write) || event.Has(fsnotify.Create)
			if !isWrite {
				continue
			}

			if debounceTimer != nil {
				debounceTimer.Stop()
			}
			debounceTimer = time.AfterFunc(2*time.Second, func() {
				log.Printf("Cron watcher: jobs.json changed, re-seeding cron jobs...")
				seedCronJobs(dataStore, paths)
			})

		case err, ok := <-watcher.Errors:
			if !ok {
				return
			}
			log.Printf("Cron watcher error: %v", err)
		}
	}
}

// cronMtimeFallback periodically checks if jobs.json has been modified.
// This catches changes if the fsnotify watcher dies silently.
func cronMtimeFallback(paths bridge.Paths, dataStore *store.Store) {
	cronFile := paths.CronJobsPath()
	var lastMtime time.Time

	// Initialize last mtime
	if info, err := os.Stat(cronFile); err == nil {
		lastMtime = info.ModTime()
	}

	ticker := time.NewTicker(60 * time.Second)
	defer ticker.Stop()

	for range ticker.C {
		info, err := os.Stat(cronFile)
		if err != nil {
			continue
		}
		if info.ModTime().After(lastMtime) {
			lastMtime = info.ModTime()
			log.Printf("Cron mtime fallback: jobs.json modified, re-seeding...")
			seedCronJobs(dataStore, paths)
		}
	}
}

// runtimeHealthLoop periodically checks the health of all runtimes
// and updates the runtime_status table in SQLite.
func runtimeHealthLoop(ctx context.Context, dataStore *store.Store, paths bridge.Paths) {
	// Initial check
	checkRuntimeHealth(dataStore, paths)

	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			checkRuntimeHealth(dataStore, paths)
		case <-ctx.Done():
			return
		}
	}
}

func teamModeBootstrapLoop(ctx context.Context, dataStore *store.Store, paths bridge.Paths) {
	if err := bridge.SyncTeamModeBootstrap(dataStore, paths); err != nil {
		log.Printf("team mode bootstrap: %v", err)
	}
	ticker := time.NewTicker(60 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-ticker.C:
			if err := bridge.SyncTeamModeBootstrap(dataStore, paths); err != nil {
				log.Printf("team mode bootstrap: %v", err)
			}
		case <-ctx.Done():
			return
		}
	}
}

func checkRuntimeHealth(dataStore *store.Store, paths bridge.Paths) {
	// OpenClaw: check if gateway config exists and process is likely running
	openclawStatus := "offline"
	if _, err := os.Stat(paths.ConfigPath()); err == nil {
		openclawStatus = "online"
	}
	dataStore.UpdateRuntimeStatus("openclaw", openclawStatus, "", "{}")

	// Hermes: check if API is available
	hermesStatus := "offline"
	client := &http.Client{Timeout: 2 * time.Second}
	if resp, err := client.Get("http://127.0.0.1:8642/health"); err == nil {
		resp.Body.Close()
		if resp.StatusCode == 200 {
			hermesStatus = "online"
		}
	}
	dataStore.UpdateRuntimeStatus("hermes", hermesStatus, "", "{}")

	// Claude Code: check if the CLI binary is in PATH
	claudeStatus := "offline"
	if _, err := exec.LookPath("claude"); err == nil {
		claudeStatus = "online"
	}
	dataStore.UpdateRuntimeStatus("claude-code", claudeStatus, "", "{}")

	// Codex: check if the CLI binary is in PATH
	codexStatus := "offline"
	if _, err := exec.LookPath("codex"); err == nil {
		codexStatus = "online"
	}
	dataStore.UpdateRuntimeStatus("codex", codexStatus, "", "{}")
}

// readCodexAutomationsForSeed reads ~/.codex/automations/<task-name>/automation.toml
// files and returns them as SeedCronJob structs.
func readCodexAutomationsForSeed() ([]store.SeedCronJob, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return nil, err
	}
	automationsDir := filepath.Join(home, ".codex", "automations")

	entries, err := os.ReadDir(automationsDir)
	if err != nil {
		return nil, err
	}

	var seeds []store.SeedCronJob
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		tomlPath := filepath.Join(automationsDir, entry.Name(), "automation.toml")
		data, err := os.ReadFile(tomlPath)
		if err != nil {
			continue // skip dirs without automation.toml
		}

		var auto struct {
			Version              int      `toml:"version"`
			ID                   string   `toml:"id"`
			Kind                 string   `toml:"kind"`
			Name                 string   `toml:"name"`
			Prompt               string   `toml:"prompt"`
			Status               string   `toml:"status"`
			Rrule                string   `toml:"rrule"`
			Model                string   `toml:"model"`
			ReasoningEffort      string   `toml:"reasoning_effort"`
			ExecutionEnvironment string   `toml:"execution_environment"`
			Cwds                 []string `toml:"cwds"`
			CreatedAt            int64    `toml:"created_at"`
			UpdatedAt            int64    `toml:"updated_at"`
		}
		if _, err := toml.Decode(string(data), &auto); err != nil {
			log.Printf("Codex automation parse error (%s): %v", entry.Name(), err)
			continue
		}
		if auto.ID == "" {
			auto.ID = entry.Name() // fallback to directory name
		}

		enabled := true
		if strings.EqualFold(auto.Status, "PAUSED") {
			enabled = false
		}

		name := auto.Name
		if name == "" {
			name = auto.ID
		}

		// Build a JSON representation for rawJSON storage so the dashboard can read
		// all runtimes uniformly.
		rawObj := map[string]interface{}{
			"id":      auto.ID,
			"name":    name,
			"enabled": enabled,
			"runtime": "codex",
			"prompt":  auto.Prompt,
			"model":   auto.Model,
			"schedule": map[string]interface{}{
				"kind": "rrule",
				"expr": auto.Rrule,
			},
			"state": map[string]interface{}{},
			"codex": map[string]interface{}{
				"reasoning_effort":      auto.ReasoningEffort,
				"execution_environment": auto.ExecutionEnvironment,
				"cwds":                  auto.Cwds,
				"version":               auto.Version,
			},
		}
		if auto.CreatedAt > 0 {
			rawObj["createdAt"] = auto.CreatedAt
		}
		if auto.UpdatedAt > 0 {
			rawObj["updatedAt"] = auto.UpdatedAt
		}

		rawJSON, _ := json.Marshal(rawObj)

		seeds = append(seeds, store.SeedCronJob{
			ID:      auto.ID,
			Runtime: "codex",
			AgentID: "",
			Name:    name,
			Enabled: enabled,
			RawJSON: string(rawJSON),
		})
	}
	return seeds, nil
}

// seedCodexAutomations reads ~/.codex/automations/ and upserts into SQLite.
func seedCodexAutomations(dataStore *store.Store) {
	jobs, err := readCodexAutomationsForSeed()
	if err != nil {
		if !os.IsNotExist(err) {
			log.Printf("Codex automation seeding: %v", err)
		}
		return
	}
	if len(jobs) == 0 {
		return
	}
	added, updated, removed, err := dataStore.SeedCronJobs("codex", jobs)
	if err != nil {
		log.Printf("Codex automation seeding error: %v", err)
		return
	}
	if added > 0 || updated > 0 || removed > 0 {
		log.Printf("Codex automations: seeded %d jobs (added=%d, updated=%d, removed=%d)",
			len(jobs), added, updated, removed)
	}
}

// watchCodexAutomations watches ~/.codex/automations/ for additions, changes, and
// removals of automation.toml files. Because automations live in subdirectories,
// we watch the parent directory and each existing subdirectory, and add watches for
// newly created subdirectories dynamically.
func watchCodexAutomations(ctx context.Context, dataStore *store.Store) {
	home, _ := os.UserHomeDir()
	automationsDir := filepath.Join(home, ".codex", "automations")

	// Wait for the automations directory to exist (Codex creates it on first automation add)
	for {
		if _, err := os.Stat(automationsDir); err == nil {
			break
		}
		select {
		case <-ctx.Done():
			return
		case <-time.After(30 * time.Second):
		}
	}

	watcher, err := fsnotify.NewWatcher()
	if err != nil {
		log.Printf("Codex automation watcher: failed to create: %v", err)
		go codexAutomationsMtimeFallback(ctx, automationsDir, dataStore)
		return
	}
	defer watcher.Close()

	// Watch the parent automations dir AND all existing subdirs so we catch
	// both new top-level directory creation and automation.toml writes in existing dirs.
	if err := watcher.Add(automationsDir); err != nil {
		log.Printf("Codex automation watcher: failed to watch %s: %v", automationsDir, err)
		go codexAutomationsMtimeFallback(ctx, automationsDir, dataStore)
		return
	}
	entries, _ := os.ReadDir(automationsDir)
	for _, e := range entries {
		if e.IsDir() {
			_ = watcher.Add(filepath.Join(automationsDir, e.Name()))
		}
	}
	log.Printf("Codex automation watcher: watching %s for automation changes", automationsDir)

	// Also start mtime fallback in case watcher dies silently
	go codexAutomationsMtimeFallback(ctx, automationsDir, dataStore)

	var debounce *time.Timer

	for {
		select {
		case <-ctx.Done():
			return
		case event, ok := <-watcher.Events:
			if !ok {
				return
			}
			if event.Op&(fsnotify.Write|fsnotify.Create|fsnotify.Remove) == 0 {
				continue
			}
			// If a new subdirectory was created, watch it so we catch the
			// automation.toml write that follows shortly after.
			if event.Op&fsnotify.Create != 0 {
				if info, err := os.Stat(event.Name); err == nil && info.IsDir() {
					_ = watcher.Add(event.Name)
				}
			}
			if debounce != nil {
				debounce.Stop()
			}
			debounce = time.AfterFunc(2*time.Second, func() {
				log.Printf("Codex automation watcher: change detected, re-seeding automations...")
				seedCodexAutomations(dataStore)
			})
		case err, ok := <-watcher.Errors:
			if !ok {
				return
			}
			log.Printf("Codex automation watcher error: %v", err)
		}
	}
}

// codexAutomationsMtimeFallback scans all automation.toml files every 60s and
// re-seeds if any mtime has advanced. This catches changes if the fsnotify
// watcher dies silently.
func codexAutomationsMtimeFallback(ctx context.Context, automationsDir string, dataStore *store.Store) {
	// Compute the latest mtime across all automation.toml files.
	latestMtime := func() time.Time {
		var latest time.Time
		entries, err := os.ReadDir(automationsDir)
		if err != nil {
			return latest
		}
		for _, e := range entries {
			if !e.IsDir() {
				continue
			}
			p := filepath.Join(automationsDir, e.Name(), "automation.toml")
			if info, err := os.Stat(p); err == nil {
				if info.ModTime().After(latest) {
					latest = info.ModTime()
				}
			}
		}
		return latest
	}

	lastMtime := latestMtime()

	ticker := time.NewTicker(60 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			current := latestMtime()
			if current.After(lastMtime) {
				lastMtime = current
				log.Printf("Codex automation mtime fallback: change detected, re-seeding automations...")
				seedCodexAutomations(dataStore)
			}
		case <-ctx.Done():
			return
		}
	}
}
