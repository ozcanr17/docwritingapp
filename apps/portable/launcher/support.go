package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"
)

type rootSelection struct {
	Path     string
	Mode     string
	Attempts []string
}

type startupError struct {
	Code     string
	Stage    string
	Guidance string
	LogPath  string
	Cause    error
}

type startupStatus struct {
	Version     string `json:"version"`
	Code        string `json:"code"`
	Stage       string `json:"stage"`
	State       string `json:"state"`
	Detail      string `json:"detail,omitempty"`
	DataRoot    string `json:"dataRoot"`
	StorageMode string `json:"storageMode"`
	UpdatedAt   string `json:"updatedAt"`
}

func (value *startupError) Error() string {
	parts := []string{
		fmt.Sprintf("[%s] %s", value.Code, value.Stage),
		"Details: " + value.Cause.Error(),
		"Next action: " + value.Guidance,
	}
	if value.LogPath != "" {
		parts = append(parts, "Diagnostic log: "+value.LogPath)
	}
	return strings.Join(parts, "\n\n")
}

func failure(code string, stage string, guidance string, cause error, logPath string) error {
	return &startupError{Code: code, Stage: stage, Guidance: guidance, Cause: cause, LogPath: logPath}
}

func chooseRoot() (rootSelection, error) {
	executable, err := os.Executable()
	if err != nil {
		return rootSelection{}, err
	}
	return selectWritableRoot(os.Getenv("LOCALAPPDATA"), filepath.Dir(executable), os.Getenv("DOCSYS_HOME"))
}

func selectWritableRoot(localAppData string, executableDirectory string, override string) (rootSelection, error) {
	type candidate struct {
		path string
		mode string
	}
	candidates := make([]candidate, 0, 3)
	if strings.TrimSpace(override) != "" {
		candidates = append(candidates, candidate{path: override, mode: "environment override"})
	}
	if strings.TrimSpace(localAppData) != "" {
		candidates = append(candidates, candidate{path: filepath.Join(localAppData, "DocSys"), mode: "user profile"})
	}
	if strings.TrimSpace(executableDirectory) != "" {
		candidates = append(candidates, candidate{path: filepath.Join(executableDirectory, "DocSysData"), mode: "portable folder fallback"})
	}
	seen := map[string]bool{}
	attempts := make([]string, 0, len(candidates))
	for _, item := range candidates {
		clean := filepath.Clean(item.path)
		key := strings.ToLower(clean)
		if seen[key] {
			continue
		}
		seen[key] = true
		if err := probeWritable(clean); err == nil {
			return rootSelection{Path: clean, Mode: item.mode, Attempts: attempts}, nil
		} else {
			attempts = append(attempts, clean+": "+err.Error())
		}
	}
	detail := "No writable DocSys storage location was found."
	if len(attempts) > 0 {
		detail += "\nTried:\n- " + strings.Join(attempts, "\n- ")
	}
	return rootSelection{Attempts: attempts}, fmt.Errorf("%s", detail)
}

func probeWritable(root string) error {
	if err := os.MkdirAll(root, 0700); err != nil {
		return err
	}
	name := fmt.Sprintf(".docsys-write-test-%d-%d", os.Getpid(), time.Now().UnixNano())
	first := filepath.Join(root, name)
	second := first + "-renamed"
	if err := os.Mkdir(first, 0700); err != nil {
		return err
	}
	defer os.RemoveAll(first)
	defer os.RemoveAll(second)
	path := filepath.Join(first, "probe")
	file, err := os.OpenFile(path, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
	if err != nil {
		return err
	}
	if _, err = file.WriteString("docsys"); err == nil {
		err = file.Sync()
	}
	closeErr := file.Close()
	if err != nil {
		return err
	}
	if closeErr != nil {
		return closeErr
	}
	if err = os.Rename(first, second); err != nil {
		return err
	}
	return os.RemoveAll(second)
}

func recordStatus(selection rootSelection, code string, stage string, state string, detail string) {
	status := startupStatus{
		Version:     version,
		Code:        code,
		Stage:       stage,
		State:       state,
		Detail:      detail,
		DataRoot:    selection.Path,
		StorageMode: selection.Mode,
		UpdatedAt:   time.Now().UTC().Format(time.RFC3339),
	}
	content, err := json.MarshalIndent(status, "", "  ")
	if err != nil {
		return
	}
	path := filepath.Join(selection.Path, "logs", "startup-status.json")
	os.WriteFile(path, append(content, '\n'), 0600)
}

func runStage(selection rootSelection, code string, stage string, guidance string, logPath string, action func() error) error {
	logger.Printf("[%s] started: %s", code, stage)
	recordStatus(selection, code, stage, "running", "")
	if err := action(); err != nil {
		logger.Printf("[%s] failed: %s: %v", code, stage, err)
		recordStatus(selection, code, stage, "failed", err.Error())
		return failure(code, stage, guidance, err, logPath)
	}
	logger.Printf("[%s] completed: %s", code, stage)
	recordStatus(selection, code, stage, "completed", "")
	return nil
}
