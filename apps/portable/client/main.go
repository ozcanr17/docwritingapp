package main

import (
	"archive/zip"
	"fmt"
	"io"
	"log"
	"mime"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"syscall"
	"time"
	"unsafe"
)

const version = "0.2.0-client.1"

const createNoWindow = 0x08000000

var clientLogger *log.Logger

func main() {
	if runtime.GOOS != "windows" || runtime.GOARCH != "amd64" {
		messageBox("DocSys - DS-CLI-100", "This package requires 64-bit Windows.\n\nNext action: Use the Windows x64 portable release.", 0x10)
		return
	}
	selection, err := chooseRoot()
	if err != nil {
		messageBox("DocSys - DS-CLI-110", clientFailure("DS-CLI-110", "Storage selection failed", "Move both DocSys EXE files to a writable folder and try again.", err, "").Error(), 0x10)
		return
	}
	logDirectory := filepath.Join(selection.Path, "logs")
	if err = os.MkdirAll(logDirectory, 0700); err != nil {
		messageBox("DocSys - DS-CLI-120", clientFailure("DS-CLI-120", "Log directory creation failed", "Move both DocSys EXE files to a writable folder and try again.", err, "").Error(), 0x10)
		return
	}
	logPath := filepath.Join(logDirectory, "client.log")
	logFile, err := os.OpenFile(logPath, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0600)
	if err != nil {
		messageBox("DocSys - DS-CLI-120", clientFailure("DS-CLI-120", "Diagnostic log creation failed", "Grant write access to the portable folder or move both EXE files to another writable folder.", err, logPath).Error(), 0x10)
		return
	}
	defer logFile.Close()
	clientLogger = log.New(logFile, "", log.Ldate|log.Ltime|log.Lmicroseconds)
	clientLogger.Printf("DocSys client %s starting", version)
	clientLogger.Printf("storage root: %s", selection.Path)
	clientLogger.Printf("storage mode: %s", selection.Mode)
	for _, attempt := range selection.Attempts {
		clientLogger.Printf("storage candidate rejected: %s", attempt)
	}
	address := "http://127.0.0.1:5173"
	if clientHealthy(300 * time.Millisecond) {
		if err = openBrowser(address); err != nil {
			showClientError(clientFailure("DS-CLI-500", "Browser launch failed", "Open http://127.0.0.1:5173 manually in an allowed browser.", err, logPath))
		}
		return
	}
	clientRoot, err := prepare(selection.Path)
	if err != nil {
		showClientError(clientFailure("DS-CLI-200", "Embedded user interface extraction failed", "Check free disk space and antivirus restrictions. Move the release to a writable local folder and retry.", err, logPath))
		return
	}
	if !healthy("http://127.0.0.1:3001/health/ready", 500*time.Millisecond) {
		if err = startServerBesideClient(); err != nil {
			showClientError(clientFailure("DS-CLI-300", "DocSys Server launch failed", "Keep DocSys.exe and DocSys Server.exe in the same writable folder, then retry.", err, logPath))
			return
		}
		clientLogger.Printf("[DS-CLI-310] waiting for DocSys Server readiness")
		if !waitHealthy("http://127.0.0.1:3001/health/ready", 240*time.Second) {
			serverLog := filepath.Join(selection.Path, "logs", "launcher.log")
			showClientError(clientFailure("DS-CLI-310", "DocSys Server readiness timed out", "Open the server error message and launcher log. You can also run DocSys Server.exe directly to see its exact startup stage.", fmt.Errorf("the API did not become ready within 240 seconds"), serverLog))
			return
		}
	}
	if portOpen(5173) {
		showClientError(clientFailure("DS-CLI-400", "User interface port is already in use", "Stop the other process using local port 5173, then retry.", fmt.Errorf("127.0.0.1:5173 is occupied by a non-DocSys service"), logPath))
		return
	}
	server, serveErrors, err := serve(clientRoot)
	if err != nil {
		showClientError(clientFailure("DS-CLI-410", "User interface web server could not start", "Check endpoint-security rules and whether local port 5173 is allowed.", err, logPath))
		return
	}
	defer server.Close()
	if !waitHealthy(address, 10*time.Second) {
		select {
		case serveErr := <-serveErrors:
			err = serveErr
		default:
			err = fmt.Errorf("the user interface did not answer within 10 seconds")
		}
		showClientError(clientFailure("DS-CLI-420", "User interface readiness check failed", "Check client.log and verify that local HTTP connections to 127.0.0.1 are allowed.", err, logPath))
		return
	}
	if err = openBrowser(address); err != nil {
		showClientError(clientFailure("DS-CLI-500", "Browser launch failed", "Open http://127.0.0.1:5173 manually in an allowed browser.", err, logPath))
		return
	}
	clientLogger.Printf("[DS-CLI-000] DocSys user interface ready")
	keepAliveWhileServerRuns()
}

func prepare(root string) (string, error) {
	target := filepath.Join(root, "client", version)
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
	if err = os.RemoveAll(temporary); err != nil {
		return "", fmt.Errorf("could not remove stale extraction directory %s: %w", temporary, err)
	}
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
	if err = os.RemoveAll(target); err != nil {
		return "", fmt.Errorf("could not replace user interface directory %s: %w", target, err)
	}
	if err = os.Rename(temporary, target); err != nil {
		return "", err
	}
	if err = os.WriteFile(marker, []byte(version), 0600); err != nil {
		return "", err
	}
	return target, nil
}

func serve(root string) (*http.Server, <-chan error, error) {
	server := &http.Server{Addr: "127.0.0.1:5173", Handler: http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		if request.URL.Path == "/__docsys_client_health" {
			response.Header().Set("Content-Type", "text/plain; charset=utf-8")
			response.Header().Set("Cache-Control", "no-store")
			response.Write([]byte(version))
			return
		}
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
	listener, err := net.Listen("tcp", server.Addr)
	if err != nil {
		return nil, nil, err
	}
	errors := make(chan error, 1)
	go func() {
		errors <- server.Serve(listener)
	}()
	return server, errors, nil
}

func startServerBesideClient() error {
	executable, err := os.Executable()
	if err != nil {
		return err
	}
	directory := filepath.Dir(executable)
	candidates := []string{
		filepath.Join(directory, "DocSys Server.exe"),
		filepath.Join(directory, "DocSys.Server.exe"),
	}
	for _, server := range candidates {
		if _, statErr := os.Stat(server); statErr == nil {
			command := exec.Command(server)
			hideWindow(command)
			if err = command.Start(); err != nil {
				return fmt.Errorf("%s: %w", server, err)
			}
			clientLogger.Printf("[DS-CLI-300] started server: %s", server)
			return command.Process.Release()
		} else if !os.IsNotExist(statErr) {
			return fmt.Errorf("%s: %w", server, statErr)
		}
	}
	return fmt.Errorf("neither DocSys Server.exe nor DocSys.Server.exe was found in %s", directory)
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
	return response.StatusCode >= 200 && response.StatusCode < 400
}

func clientHealthy(timeout time.Duration) bool {
	client := http.Client{Timeout: timeout}
	response, err := client.Get("http://127.0.0.1:5173/__docsys_client_health")
	if err != nil {
		return false
	}
	defer response.Body.Close()
	content, err := io.ReadAll(io.LimitReader(response.Body, 128))
	return err == nil && response.StatusCode == http.StatusOK && strings.TrimSpace(string(content)) == version
}

func portOpen(port int) bool {
	connection, err := net.DialTimeout("tcp", fmt.Sprintf("127.0.0.1:%d", port), 150*time.Millisecond)
	if err != nil {
		return false
	}
	connection.Close()
	return true
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

func openBrowser(address string) error {
	command := exec.Command("rundll32", "url.dll,FileProtocolHandler", address)
	hideWindow(command)
	if err := command.Start(); err != nil {
		return err
	}
	return command.Process.Release()
}

func showClientError(err error) {
	if clientLogger != nil {
		clientLogger.Printf("client failed: %v", err)
	}
	messageBox("DocSys could not start", err.Error(), 0x10)
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
