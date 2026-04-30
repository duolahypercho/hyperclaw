package bridge

import (
	"testing"
	"time"
)

func TestTrySendOptionalToHubRecordsDroppedMessage(t *testing.T) {
	ResetHubSendStats()
	toHub := make(chan []byte)

	trySendOptionalToHub("test", toHub, []byte("stream-event"))

	stats := SnapshotHubSendStats()
	if stats.OptionalDropped != 1 {
		t.Fatalf("OptionalDropped = %d, want 1", stats.OptionalDropped)
	}
	if stats.OptionalSent != 0 {
		t.Fatalf("OptionalSent = %d, want 0", stats.OptionalSent)
	}
}

func TestTrySendRequiredToHubRecordsTimeout(t *testing.T) {
	ResetHubSendStats()
	oldTimeout := requiredHubSendTimeout
	requiredHubSendTimeout = 5 * time.Millisecond
	t.Cleanup(func() {
		requiredHubSendTimeout = oldTimeout
	})
	toHub := make(chan []byte)

	trySendRequiredToHub("test", "req-1", toHub, []byte("response"))

	stats := SnapshotHubSendStats()
	if stats.RequiredTimedOut != 1 {
		t.Fatalf("RequiredTimedOut = %d, want 1", stats.RequiredTimedOut)
	}
	if stats.RequiredSent != 0 {
		t.Fatalf("RequiredSent = %d, want 0", stats.RequiredSent)
	}
}

func TestTrySendRequiredToHubRecordsSentMessage(t *testing.T) {
	ResetHubSendStats()
	toHub := make(chan []byte, 1)

	trySendRequiredToHub("test", "req-1", toHub, []byte("response"))

	stats := SnapshotHubSendStats()
	if stats.RequiredSent != 1 {
		t.Fatalf("RequiredSent = %d, want 1", stats.RequiredSent)
	}
	if stats.RequiredTimedOut != 0 {
		t.Fatalf("RequiredTimedOut = %d, want 0", stats.RequiredTimedOut)
	}
}
