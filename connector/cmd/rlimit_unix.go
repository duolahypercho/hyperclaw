//go:build !windows

package main

import (
	"log"
	"syscall"
)

// raiseOpenFileLimit raises the process's soft open-file-descriptor limit to
// the system hard limit. The default macOS soft limit is 256 which is exhausted
// quickly by fsnotify watchers and concurrent file reads during cold-sync.
func raiseOpenFileLimit() {
	var rl syscall.Rlimit
	if err := syscall.Getrlimit(syscall.RLIMIT_NOFILE, &rl); err != nil {
		return
	}
	want := uint64(10240)
	if rl.Max > 0 && want > rl.Max {
		want = rl.Max
	}
	if rl.Cur >= want {
		return
	}
	rl.Cur = want
	if err := syscall.Setrlimit(syscall.RLIMIT_NOFILE, &rl); err != nil {
		log.Printf("WARNING: could not raise open-file limit: %v", err)
	} else {
		log.Printf("Open-file limit raised to %d", want)
	}
}
