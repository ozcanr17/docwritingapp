package main

import (
	"archive/zip"
	"errors"
	"fmt"
	"io"
	"mime"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"syscall"
	"time"
	"unsafe"
)

const version = "0.1.6-client.1"

const createNoWindow = 0x08000000

func main() {
	address := "http://127.0.0.1:5173"
	if healthy(address, 300*time.Millisecond) {
		openBrowser(address)
		return
	}
	root, err := prepare()
	if err != nil {
		messageBox("DocSys", err.Error(), 0x10)
		return
	}
	if !healthy("http://127.0.0.1:3001/health/ready", 500*time.Millisecond) {
		startServerBesideClient()
		if !waitHealthy("http://127.0.0.1:3001/health/ready", 120*time.Second) {
			messageBox("DocSys", "DocSys Server is not running. Start DocSys Server.exe first.", 0x10)
			return
		}
	}
	server := serve(root)
	defer server.Close()
	if !waitHealthy(address, 10*time.Second) {
		messageBox("DocSys", "The user interface could not be started.", 0x10)
		return
	}
	openBrowser(address)
	keepAliveWhileServerRuns()
}

func prepare() (string, error) {
	base := os.Getenv("LOCALAPPDATA")
	if base == "" {
		return "", errors.New("LOCALAPPDATA is not available")
	}
	target := filepath.Join(base, "DocSys", "client", version)
	marker := filepath.Join(target, ".ready")
	if content, err := os.ReadFile(marker); err == nil && string(content) == version {
		return target, nil
	}
	executable, err := os.Executable()
	if err != nil {
		return "", err
	}
	reader, err := zip.OpenReader(executable)
	if err != nil {
		return "", err
	}
	defer reader.Close()
	temporary := target + ".extracting"
	os.RemoveAll(temporary)
	if err = os.MkdirAll(temporary, 0700); err != nil {
		return "", err
	}
	for _, entry := range reader.File {
		clean := filepath.Clean(filepath.FromSlash(entry.Name))
		if clean == "." {
			continue
		}
		if strings.HasPrefix(clean, "..") || filepath.IsAbs(clean) {
			return "", fmt.Errorf("unsafe package path: %s", entry.Name)
		}
		destination := filepath.Join(temporary, clean)
		if entry.FileInfo().IsDir() {
			if err = os.MkdirAll(destination, 0700); err != nil {
				return "", err
			}
			continue
		}
		if err = os.MkdirAll(filepath.Dir(destination), 0700); err != nil {
			return "", err
		}
		source, openErr := entry.Open()
		if openErr != nil {
			return "", openErr
		}
		output, createErr := os.OpenFile(destination, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0700)
		if createErr != nil {
			source.Close()
			return "", createErr
		}
		_, copyErr := io.Copy(output, source)
		output.Close()
		source.Close()
		if copyErr != nil {
			return "", copyErr
		}
	}
	os.RemoveAll(target)
	if err = os.Rename(temporary, target); err != nil {
		return "", err
	}
	if err = os.WriteFile(marker, []byte(version), 0600); err != nil {
		return "", err
	}
	return target, nil
}

func serve(root string) *http.Server {
	server := &http.Server{Addr: "127.0.0.1:5173", Handler: http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		path := filepath.Clean(filepath.FromSlash(strings.TrimPrefix(request.URL.Path, "/")))
		if path == "." {
			path = "index.html"
		}
		candidate := filepath.Join(root, path)
		if !strings.HasPrefix(candidate, root+string(os.PathSeparator)) && candidate != root {
			http.NotFound(response, request)
			return
		}
		info, err := os.Stat(candidate)
		if err != nil || info.IsDir() {
			candidate = filepath.Join(root, "index.html")
		}
		if contentType := mime.TypeByExtension(filepath.Ext(candidate)); contentType != "" {
			response.Header().Set("Content-Type", contentType)
		}
		if filepath.Base(candidate) == "index.html" {
			response.Header().Set("Cache-Control", "no-store, max-age=0")
			response.Header().Set("Pragma", "no-cache")
		} else if strings.Contains(filepath.ToSlash(candidate), "/assets/") {
			response.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
		}
		response.Header().Set("X-Content-Type-Options", "nosniff")
		http.ServeFile(response, request, candidate)
	})}
	go server.ListenAndServe()
	return server
}

func startServerBesideClient() {
	executable, err := os.Executable()
	if err != nil {
		return
	}
	server := filepath.Join(filepath.Dir(executable), "DocSys Server.exe")
	if _, err = os.Stat(server); err == nil {
		command := exec.Command(server)
		hideWindow(command)
		command.Start()
	}
}

func keepAliveWhileServerRuns() {
	failures := 0
	for {
		time.Sleep(2 * time.Second)
		if healthy("http://127.0.0.1:3001/health/ready", time.Second) {
			failures = 0
			continue
		}
		failures++
		if failures >= 5 {
			return
		}
	}
}

func healthy(address string, timeout time.Duration) bool {
	client := http.Client{Timeout: timeout}
	response, err := client.Get(address)
	if err != nil {
		return false
	}
	response.Body.Close()
	return response.StatusCode >= 200 && response.StatusCode < 500
}

func waitHealthy(address string, timeout time.Duration) bool {
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		if healthy(address, time.Second) {
			return true
		}
		time.Sleep(500 * time.Millisecond)
	}
	return false
}

func openBrowser(address string) {
	command := exec.Command("rundll32", "url.dll,FileProtocolHandler", address)
	hideWindow(command)
	command.Start()
}

func hideWindow(command *exec.Cmd) {
	command.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: createNoWindow}
}

func messageBox(title string, text string, style uintptr) {
	user32 := syscall.NewLazyDLL("user32.dll")
	procedure := user32.NewProc("MessageBoxW")
	titlePointer, _ := syscall.UTF16PtrFromString(title)
	textPointer, _ := syscall.UTF16PtrFromString(text)
	procedure.Call(0, uintptr(unsafe.Pointer(textPointer)), uintptr(unsafe.Pointer(titlePointer)), style)
}
