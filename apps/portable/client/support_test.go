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
