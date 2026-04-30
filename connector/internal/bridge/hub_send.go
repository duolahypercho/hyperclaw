package bridge

import (
	"log"
	"sync/atomic"
	"time"
)

var requiredHubSendTimeout = 30 * time.Second

var hubSendStats hubSendCounters

type hubSendCounters struct {
	optionalSent     atomic.Uint64
	optionalDropped  atomic.Uint64
	requiredSent     atomic.Uint64
	requiredTimedOut atomic.Uint64
}

type HubSendStats struct {
	OptionalSent     uint64
	OptionalDropped  uint64
	RequiredSent     uint64
	RequiredTimedOut uint64
}

func SnapshotHubSendStats() HubSendStats {
	return HubSendStats{
		OptionalSent:     hubSendStats.optionalSent.Load(),
		OptionalDropped:  hubSendStats.optionalDropped.Load(),
		RequiredSent:     hubSendStats.requiredSent.Load(),
		RequiredTimedOut: hubSendStats.requiredTimedOut.Load(),
	}
}

func ResetHubSendStats() {
	hubSendStats.optionalSent.Store(0)
	hubSendStats.optionalDropped.Store(0)
	hubSendStats.requiredSent.Store(0)
	hubSendStats.requiredTimedOut.Store(0)
}

func trySendOptionalToHub(label string, toHub chan<- []byte, data []byte) {
	defer func() {
		if recovered := recover(); recovered != nil {
			log.Printf("[%s] toHub channel closed while sending optional message: %v", label, recovered)
		}
	}()
	select {
	case toHub <- data:
		hubSendStats.optionalSent.Add(1)
	default:
		hubSendStats.optionalDropped.Add(1)
		log.Printf("[%s] toHub channel full, dropping optional message", label)
	}
}

func trySendRequiredToHub(label, requestID string, toHub chan<- []byte, data []byte) {
	defer func() {
		if recovered := recover(); recovered != nil {
			log.Printf("[%s] toHub channel closed while sending response %s: %v", label, requestID, recovered)
		}
	}()
	select {
	case toHub <- data:
		hubSendStats.requiredSent.Add(1)
	case <-time.After(requiredHubSendTimeout):
		hubSendStats.requiredTimedOut.Add(1)
		log.Printf("[%s] timed out sending required response %s to hub", label, requestID)
	}
}
