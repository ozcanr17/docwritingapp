package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestSelectWritableRootUsesLocalAppData(t *testing.T) {
	base := t.TempDir()
	executableDirectory := t.TempDir()
	selection, err := selectWritableRoot(base, executableDirectory, "")
	if err != nil {
		t.Fatal(err)
	}
	expected := filepath.Join(base, "DocSys")
	if selection.Path != expected || selection.Mode != "user profile" {
		t.Fatalf("got %#v, expected %s in user profile mode", selection, expected)
	}
}

func TestSelectWritableRootFallsBackBesideExecutable(t *testing.T) {
	base := t.TempDir()
	blocked := filepath.Join(base, "blocked")
	if err := os.WriteFile(blocked, []byte("not a directory"), 0600); err != nil {
		t.Fatal(err)
	}
	executableDirectory := t.TempDir()
	selection, err := selectWritableRoot(blocked, executableDirectory, "")
	if err != nil {
		t.Fatal(err)
	}
	expected := filepath.Join(executableDirectory, "DocSysData")
	if selection.Path != expected || selection.Mode != "portable folder fallback" {
		t.Fatalf("got %#v, expected %s in fallback mode", selection, expected)
	}
	if len(selection.Attempts) != 1 || !strings.Contains(selection.Attempts[0], filepath.Join(blocked, "DocSys")) {
		t.Fatalf("expected rejected user-profile attempt, got %#v", selection.Attempts)
	}
}

func TestSelectWritableRootReportsEveryFailure(t *testing.T) {
	base := t.TempDir()
	blockedLocal := filepath.Join(base, "local")
	blockedExecutable := filepath.Join(base, "executable")
	if err := os.WriteFile(blockedLocal, []byte("blocked"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(blockedExecutable, []byte("blocked"), 0600); err != nil {
		t.Fatal(err)
	}
	_, err := selectWritableRoot(blockedLocal, blockedExecutable, "")
	if err == nil {
		t.Fatal("expected failure")
	}
	if !strings.Contains(err.Error(), "No writable DocSys storage location") {
		t.Fatalf("unexpected error: %v", err)
	}
}
