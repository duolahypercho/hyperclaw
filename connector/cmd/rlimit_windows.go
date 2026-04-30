//go:build windows

package main

// raiseOpenFileLimit is a no-op on Windows — file descriptor limits are
// managed differently and do not require manual adjustment.
func raiseOpenFileLimit() {}
