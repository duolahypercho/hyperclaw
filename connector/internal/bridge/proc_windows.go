//go:build windows

package bridge

import (
	"os/exec"
	"syscall"
)

func setProcGroup(cmd *exec.Cmd) {
	// CREATE_NEW_PROCESS_GROUP so we can signal the whole group
	cmd.SysProcAttr = &syscall.SysProcAttr{CreationFlags: syscall.CREATE_NEW_PROCESS_GROUP}
}

func killProcessGroup(cmd *exec.Cmd) {
	// On Windows, Process.Kill() terminates the process tree when using job objects.
	// As a simpler approach, just kill the main process.
	cmd.Process.Kill()
}

func forceKillProcessGroup(cmd *exec.Cmd) {
	cmd.Process.Kill()
}
