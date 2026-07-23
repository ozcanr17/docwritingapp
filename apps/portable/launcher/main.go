package main

import (
	"archive/zip"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"syscall"
	"time"
	"unsafe"
)

const version = "0.1.7-server.1"

const createNoWindow = 0x08000000

const (
	apiPort       = 3001
	collabPort    = 3002
	workerPort    = 3003
	managerPort   = 45174
	postgresPort  = 45432
	redisPort     = 46379
	minioPort     = 49000
	minioConsole  = 49001
	adminEmail    = "admin@docsys.local"
	adminPassword = "Admin1234!"
)

type secrets struct {
	Database string `json:"database"`
	JWT      string `json:"jwt"`
	Minio    string `json:"minio"`
	Metrics  string `json:"metrics"`
}

type processSet struct {
	commands []*exec.Cmd
	postgres string
	data     string
	env      []string
}

var logger *log.Logger

func main() {
	if runtime.GOOS != "windows" || runtime.GOARCH != "amd64" {
		messageBox("DocSys Server - DS-SRV-100", "This package requires 64-bit Windows.\n\nNext action: Use the Windows x64 portable release.", 0x10)
		return
	}
	selection, err := chooseRoot()
	if err != nil {
		messageBox("DocSys Server - DS-SRV-110", failure("DS-SRV-110", "Storage selection failed", "Move both DocSys EXE files to a writable folder and try again.", err, "").Error(), 0x10)
		return
	}
	logDirectory := filepath.Join(selection.Path, "logs")
	if err = os.MkdirAll(logDirectory, 0700); err != nil {
		messageBox("DocSys Server - DS-SRV-120", failure("DS-SRV-120", "Log directory creation failed", "Move both DocSys EXE files to a writable folder and try again.", err, "").Error(), 0x10)
		return
	}
	logPath := filepath.Join(logDirectory, "launcher.log")
	logFile, err := os.OpenFile(logPath, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0600)
	if err != nil {
		messageBox("DocSys Server - DS-SRV-120", failure("DS-SRV-120", "Diagnostic log creation failed", "Grant write access to the portable folder or move both EXE files to another writable folder.", err, logPath).Error(), 0x10)
		return
	}
	defer logFile.Close()
	logger = log.New(logFile, "", log.Ldate|log.Ltime|log.Lmicroseconds)
	logger.Printf("DocSys Server %s starting", version)
	logger.Printf("storage root: %s", selection.Path)
	logger.Printf("storage mode: %s", selection.Mode)
	for _, attempt := range selection.Attempts {
		logger.Printf("storage candidate rejected: %s", attempt)
	}
	if healthy(fmt.Sprintf("http://127.0.0.1:%d/api/status", managerPort), 500*time.Millisecond) {
		if err = openBrowser(fmt.Sprintf("http://127.0.0.1:%d", managerPort)); err != nil {
			messageBox("DocSys Server - DS-SRV-130", failure("DS-SRV-130", "Server manager is running but could not be opened", "Open http://127.0.0.1:45174 manually in a browser.", err, logPath).Error(), 0x10)
		}
		return
	}
	if err = run(selection); err != nil {
		logger.Printf("startup failed: %v", err)
		messageBox("DocSys Server could not start", err.Error()+"\n\nStartup status: "+filepath.Join(logDirectory, "startup-status.json")+"\nLauncher log: "+logPath, 0x10)
	}
}

func run(selection rootSelection) error {
	root := selection.Path
	logRoot := filepath.Join(root, "logs")
	runtimeRoot := filepath.Join(root, "runtime", version)
	if err := runStage(selection, "DS-SRV-140", "Port availability check", "Stop the process using the reported port, or restart Windows if a previous DocSys process is stuck.", filepath.Join(logRoot, "launcher.log"), checkRequiredPorts); err != nil {
		return err
	}
	if err := runStage(selection, "DS-SRV-200", "Embedded runtime extraction", "Check free disk space and antivirus restrictions. Move the release to a writable local folder and retry.", filepath.Join(logRoot, "launcher.log"), func() error {
		return extractRuntime(runtimeRoot)
	}); err != nil {
		return err
	}
	dataRoot := filepath.Join(root, "data")
	if err := runStage(selection, "DS-SRV-210", "Data directory preparation", "Verify that the selected data path is writable and has enough free space.", filepath.Join(logRoot, "launcher.log"), func() error {
		for _, path := range []string{
			dataRoot,
			filepath.Join(dataRoot, "redis"),
			filepath.Join(dataRoot, "minio"),
			filepath.Join(dataRoot, "minio-config"),
			filepath.Join(dataRoot, "tmp"),
			filepath.Join(dataRoot, "profile", "AppData", "Local"),
			filepath.Join(dataRoot, "profile", "AppData", "Roaming"),
		} {
			if err := os.MkdirAll(path, 0700); err != nil {
				return fmt.Errorf("%s: %w", path, err)
			}
		}
		return nil
	}); err != nil {
		return err
	}
	var secretValues secrets
	if err := runStage(selection, "DS-SRV-220", "Local secret preparation", "Check write permission for the data folder. Do not delete an existing secrets.json when preserving an existing database.", filepath.Join(logRoot, "launcher.log"), func() error {
		var secretErr error
		secretValues, secretErr = loadSecrets(filepath.Join(dataRoot, "secrets.json"))
		return secretErr
	}); err != nil {
		return err
	}
	processes := &processSet{postgres: filepath.Join(runtimeRoot, "postgres", "bin", "pg_ctl.exe"), data: filepath.Join(dataRoot, "postgres")}
	defer processes.stop()
	if err := runStage(selection, "DS-SRV-300", "PostgreSQL initialization and startup", "Open postgres-init.log and postgres.log. Check folder permissions, free disk space, security software blocks and port 45432.", filepath.Join(logRoot, "postgres.log"), func() error {
		return startPostgres(runtimeRoot, processes, secretValues)
	}); err != nil {
		return err
	}
	if err := runStage(selection, "DS-SRV-310", "DocSys database preparation", "Open createdb.log and postgres.log. Verify that PostgreSQL remained running.", filepath.Join(logRoot, "createdb.log"), func() error {
		return prepareDatabase(runtimeRoot, processes, secretValues)
	}); err != nil {
		return err
	}
	if err := runStage(selection, "DS-SRV-320", "Redis startup", "Open redis.log. Check folder permissions, security software blocks and port 46379.", filepath.Join(logRoot, "redis.log"), func() error {
		return startRedis(runtimeRoot, dataRoot, processes)
	}); err != nil {
		return err
	}
	if err := runStage(selection, "DS-SRV-330", "Object storage startup", "Open minio.log. Check folder permissions, security software blocks and ports 49000-49001.", filepath.Join(logRoot, "minio.log"), func() error {
		return startMinio(runtimeRoot, dataRoot, processes, secretValues)
	}); err != nil {
		return err
	}
	appEnv := applicationEnv(dataRoot, secretValues)
	processes.env = appEnv
	if err := runStage(selection, "DS-SRV-400", "Database migration", "Open migrate.log. Keep the data folder intact and use the matching server version.", filepath.Join(logRoot, "migrate.log"), func() error {
		return migrate(runtimeRoot, appEnv)
	}); err != nil {
		return err
	}
	if err := runStage(selection, "DS-SRV-410", "API, collaboration and worker startup", "Open api.log, collaboration.log and worker.log. Check security software blocks and ports 3001-3003.", filepath.Join(logRoot, "api.log"), func() error {
		return startApplications(runtimeRoot, root, processes, appEnv)
	}); err != nil {
		return err
	}
	if err := runStage(selection, "DS-SRV-420", "API readiness check", "Open api.log and verify that PostgreSQL, Redis and object storage are still running.", filepath.Join(logRoot, "api.log"), func() error {
		return waitHTTP(fmt.Sprintf("http://127.0.0.1:%d/health/ready", apiPort), 90*time.Second)
	}); err != nil {
		return err
	}
	if err := runStage(selection, "DS-SRV-430", "Initial account and demo data preparation", "Open seed.log. The database is running; retrying the same server EXE is safe.", filepath.Join(logRoot, "seed.log"), func() error {
		return seed(runtimeRoot, appEnv, root)
	}); err != nil {
		return err
	}
	stop := make(chan struct{}, 1)
	var manager *http.Server
	if err := runStage(selection, "DS-SRV-500", "Server manager startup", "Check whether port 45174 is blocked by another process or endpoint-security policy.", filepath.Join(logRoot, "launcher.log"), func() error {
		var managerErr error
		manager, managerErr = startManager(selection, runtimeRoot, processes, secretValues, stop)
		return managerErr
	}); err != nil {
		return err
	}
	defer manager.Close()
	if err := runStage(selection, "DS-SRV-510", "Server manager browser launch", "Open http://127.0.0.1:45174 manually in an allowed browser.", filepath.Join(logRoot, "launcher.log"), func() error {
		return openBrowser(fmt.Sprintf("http://127.0.0.1:%d", managerPort))
	}); err != nil {
		return err
	}
	recordStatus(selection, "DS-SRV-000", "DocSys Server ready", "ready", "")
	<-stop
	return nil
}

func extractRuntime(target string) error {
	marker := filepath.Join(target, ".ready")
	if content, err := os.ReadFile(marker); err == nil && string(content) == version {
		return nil
	}
	executable, err := os.Executable()
	if err != nil {
		return err
	}
	reader, err := zip.OpenReader(executable)
	if err != nil {
		return err
	}
	defer reader.Close()
	temporary := target + ".extracting"
	if err = os.RemoveAll(temporary); err != nil {
		return fmt.Errorf("could not remove stale extraction directory %s: %w", temporary, err)
	}
	if err = os.MkdirAll(temporary, 0700); err != nil {
		return err
	}
	for _, entry := range reader.File {
		clean := filepath.Clean(filepath.FromSlash(entry.Name))
		if clean == "." {
			continue
		}
		if strings.HasPrefix(clean, "..") || filepath.IsAbs(clean) {
			return fmt.Errorf("unsafe package path: %s", entry.Name)
		}
		destination := filepath.Join(temporary, clean)
		if entry.FileInfo().IsDir() {
			if err = os.MkdirAll(destination, 0700); err != nil {
				return err
			}
			continue
		}
		if err = os.MkdirAll(filepath.Dir(destination), 0700); err != nil {
			return err
		}
		source, openErr := entry.Open()
		if openErr != nil {
			return openErr
		}
		output, createErr := os.OpenFile(destination, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0700)
		if createErr != nil {
			source.Close()
			return createErr
		}
		_, copyErr := io.Copy(output, source)
		output.Close()
		source.Close()
		if copyErr != nil {
			return copyErr
		}
	}
	if err = os.RemoveAll(target); err != nil {
		return fmt.Errorf("could not replace runtime directory %s: %w", target, err)
	}
	if err = os.Rename(temporary, target); err != nil {
		return err
	}
	return os.WriteFile(marker, []byte(version), 0600)
}

func loadSecrets(path string) (secrets, error) {
	var values secrets
	content, readErr := os.ReadFile(path)
	if readErr == nil {
		if err := json.Unmarshal(content, &values); err != nil {
			return values, fmt.Errorf("existing secrets file is invalid JSON: %w", err)
		}
		if values.Database == "" || values.JWT == "" || values.Minio == "" || values.Metrics == "" {
			return values, errors.New("existing secrets file is incomplete")
		}
		return values, nil
	}
	if !os.IsNotExist(readErr) {
		return values, readErr
	}
	database, err := randomHex(24)
	if err != nil {
		return values, err
	}
	jwt, err := randomHex(32)
	if err != nil {
		return values, err
	}
	minio, err := randomHex(24)
	if err != nil {
		return values, err
	}
	metrics, err := randomHex(32)
	if err != nil {
		return values, err
	}
	values = secrets{Database: database, JWT: jwt, Minio: minio, Metrics: metrics}
	content, err = json.Marshal(values)
	if err != nil {
		return values, err
	}
	return values, os.WriteFile(path, content, 0600)
}

func randomHex(size int) (string, error) {
	value := make([]byte, size)
	if _, err := rand.Read(value); err != nil {
		return "", err
	}
	return hex.EncodeToString(value), nil
}

func startPostgres(runtimeRoot string, processes *processSet, values secrets) error {
	bin := filepath.Join(runtimeRoot, "postgres", "bin")
	dataRoot := filepath.Dir(processes.data)
	processEnv := portableEnvironment(dataRoot, "PGPASSWORD="+values.Database)
	if _, err := os.Stat(filepath.Join(processes.data, "PG_VERSION")); err != nil {
		if !os.IsNotExist(err) {
			return err
		}
		if err = os.MkdirAll(processes.data, 0700); err != nil {
			return err
		}
		os.Remove(filepath.Join(processes.data, ".init-password"))
		passwordFile := filepath.Join(filepath.Dir(processes.data), ".init-password")
		if err = os.WriteFile(passwordFile, []byte(values.Database), 0600); err != nil {
			return err
		}
		defer os.Remove(passwordFile)
		if err = runCommand(filepath.Join(bin, "initdb.exe"), []string{"-D", processes.data, "-U", "docsys", "--pwfile=" + passwordFile, "--encoding=UTF8", "--locale=C", "--auth-host=scram-sha-256", "--auth-local=trust"}, processEnv, runtimeRoot, filepath.Join(filepath.Dir(processes.data), "..", "logs", "postgres-init.log")); err != nil {
			return fmt.Errorf("PostgreSQL initialization failed: %w", err)
		}
	}
	command := exec.Command(filepath.Join(bin, "postgres.exe"), "-D", processes.data, "-p", fmt.Sprint(postgresPort), "-h", "127.0.0.1")
	hideWindow(command)
	command.Dir = runtimeRoot
	command.Env = processEnv
	if err := attachLog(command, filepath.Join(filepath.Dir(filepath.Dir(processes.data)), "logs", "postgres.log")); err != nil {
		return err
	}
	if err := command.Start(); err != nil {
		return err
	}
	processes.commands = append(processes.commands, command)
	return waitPostgresReady(bin, values.Database, 60*time.Second)
}

func waitPostgresReady(bin string, password string, timeout time.Duration) error {
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		command := exec.Command(filepath.Join(bin, "pg_isready.exe"), "-h", "127.0.0.1", "-p", fmt.Sprint(postgresPort), "-U", "docsys", "-d", "postgres", "-q")
		command.Env = append(os.Environ(), "PGPASSWORD="+password)
		hideWindow(command)
		if command.Run() == nil {
			return nil
		}
		time.Sleep(300 * time.Millisecond)
	}
	return errors.New("PostgreSQL readiness timed out")
}

func prepareDatabase(runtimeRoot string, processes *processSet, values secrets) error {
	bin := filepath.Join(runtimeRoot, "postgres", "bin")
	env := portableEnvironment(filepath.Dir(processes.data), "PGPASSWORD="+values.Database)
	arguments := []string{"-h", "127.0.0.1", "-p", fmt.Sprint(postgresPort), "-U", "docsys", "-d", "postgres", "-tAc", "SELECT 1 FROM pg_database WHERE datname='docsys'"}
	command := exec.Command(filepath.Join(bin, "psql.exe"), arguments...)
	hideWindow(command)
	command.Env = env
	output, err := command.Output()
	if err != nil {
		return err
	}
	if strings.TrimSpace(string(output)) == "1" {
		return nil
	}
	return runCommand(filepath.Join(bin, "createdb.exe"), []string{"-h", "127.0.0.1", "-p", fmt.Sprint(postgresPort), "-U", "docsys", "docsys"}, env, runtimeRoot, filepath.Join(filepath.Dir(filepath.Dir(processes.data)), "logs", "createdb.log"))
}

func startRedis(runtimeRoot string, dataRoot string, processes *processSet) error {
	redisData := filepath.ToSlash(filepath.Join(dataRoot, "redis"))
	redis := exec.Command(filepath.Join(runtimeRoot, "redis", "redis-server.exe"), "--port", fmt.Sprint(redisPort), "--bind", "127.0.0.1", "--protected-mode", "yes", "--appendonly", "yes", "--dir", redisData)
	hideWindow(redis)
	redis.Dir = filepath.Join(runtimeRoot, "redis")
	redis.Env = portableEnvironment(dataRoot)
	if err := startLogged(redis, filepath.Join(filepath.Dir(dataRoot), "logs", "redis.log"), processes); err != nil {
		return err
	}
	if err := waitPort(redisPort, 30*time.Second); err != nil {
		return err
	}
	return nil
}

func startMinio(runtimeRoot string, dataRoot string, processes *processSet, values secrets) error {
	minio := exec.Command(filepath.Join(runtimeRoot, "minio", "minio.exe"), "server", filepath.Join(dataRoot, "minio"), "--address", fmt.Sprintf("127.0.0.1:%d", minioPort), "--console-address", fmt.Sprintf("127.0.0.1:%d", minioConsole))
	hideWindow(minio)
	minio.Env = portableEnvironment(dataRoot, "MINIO_ROOT_USER=docsys", "MINIO_ROOT_PASSWORD="+values.Minio, "MINIO_BROWSER=off", "MINIO_CONFIG_DIR="+filepath.Join(dataRoot, "minio-config"))
	if err := startLogged(minio, filepath.Join(filepath.Dir(dataRoot), "logs", "minio.log"), processes); err != nil {
		return err
	}
	return waitHTTP(fmt.Sprintf("http://127.0.0.1:%d/minio/health/ready", minioPort), 45*time.Second)
}

func applicationEnv(dataRoot string, values secrets) []string {
	return portableEnvironment(dataRoot,
		"NODE_ENV=development",
		"API_HOST=127.0.0.1",
		"API_PORT="+fmt.Sprint(apiPort),
		"COLLAB_HOST=127.0.0.1",
		"COLLAB_PORT="+fmt.Sprint(collabPort),
		"WORKER_HOST=127.0.0.1",
		"WORKER_HEALTH_PORT="+fmt.Sprint(workerPort),
		"DATABASE_URL=postgresql://docsys:"+values.Database+"@127.0.0.1:"+fmt.Sprint(postgresPort)+"/docsys",
		"REDIS_URL=redis://127.0.0.1:"+fmt.Sprint(redisPort),
		"JWT_SECRET="+values.JWT,
		"APP_BASE_URL=http://127.0.0.1:5173",
		"API_PUBLIC_URL=http://127.0.0.1:"+fmt.Sprint(apiPort),
		"COLLAB_PUBLIC_URL=ws://127.0.0.1:"+fmt.Sprint(collabPort),
		"CORS_ALLOWED_ORIGINS=http://127.0.0.1:5173",
		"COOKIE_SECURE=false",
		"ALLOW_PUBLIC_REGISTRATION=true",
		"S3_ENDPOINT=http://127.0.0.1:"+fmt.Sprint(minioPort),
		"S3_REGION=us-east-1",
		"S3_BUCKET=docsys",
		"S3_ACCESS_KEY=docsys",
		"S3_SECRET_KEY="+values.Minio,
		"METRICS_TOKEN="+values.Metrics,
		"LOG_LEVEL=info",
		"DOCSYS_DATA_ROOT="+dataRoot,
	)
}

func portableEnvironment(dataRoot string, additions ...string) []string {
	profile := filepath.Join(dataRoot, "profile")
	values := append([]string{
		"APPDATA=" + filepath.Join(profile, "AppData", "Roaming"),
		"LOCALAPPDATA=" + filepath.Join(profile, "AppData", "Local"),
		"USERPROFILE=" + profile,
		"HOME=" + profile,
		"TEMP=" + filepath.Join(dataRoot, "tmp"),
		"TMP=" + filepath.Join(dataRoot, "tmp"),
	}, additions...)
	overrides := map[string]bool{}
	for _, value := range values {
		key, _, found := strings.Cut(value, "=")
		if found {
			overrides[strings.ToUpper(key)] = true
		}
	}
	environment := make([]string, 0, len(os.Environ())+len(values))
	for _, value := range os.Environ() {
		key, _, found := strings.Cut(value, "=")
		if found && overrides[strings.ToUpper(key)] {
			continue
		}
		environment = append(environment, value)
	}
	return append(environment, values...)
}

func migrate(runtimeRoot string, env []string) error {
	node := filepath.Join(runtimeRoot, "node", "node.exe")
	prisma := filepath.Join(runtimeRoot, "app", "node_modules", "prisma", "build", "index.js")
	schema := filepath.Join(runtimeRoot, "database", "schema.prisma")
	return runCommand(node, []string{prisma, "migrate", "deploy", "--schema", schema}, env, filepath.Join(runtimeRoot, "app"), filepath.Join(filepath.Dir(filepath.Dir(runtimeRoot)), "logs", "migrate.log"))
}

func startApplications(runtimeRoot string, root string, processes *processSet, env []string) error {
	node := filepath.Join(runtimeRoot, "node", "node.exe")
	app := filepath.Join(runtimeRoot, "app")
	services := []struct {
		name string
		path string
	}{
		{"api", filepath.Join(app, "node_modules", "@docsys", "api", "dist", "main.js")},
		{"collaboration", filepath.Join(app, "node_modules", "@docsys", "collaboration", "dist", "main.js")},
		{"worker", filepath.Join(app, "node_modules", "@docsys", "worker", "dist", "main.js")},
	}
	for _, service := range services {
		command := exec.Command(node, service.path)
		hideWindow(command)
		command.Dir = app
		command.Env = env
		if err := startLogged(command, filepath.Join(root, "logs", service.name+".log"), processes); err != nil {
			return err
		}
	}
	if err := waitPort(collabPort, 45*time.Second); err != nil {
		return fmt.Errorf("collaboration service did not start: %w", err)
	}
	return waitPort(workerPort, 45*time.Second)
}

func seed(runtimeRoot string, env []string, root string) error {
	marker := filepath.Join(root, "data", ".seed-version")
	if content, err := os.ReadFile(marker); err == nil && strings.TrimSpace(string(content)) == version {
		return nil
	}
	node := filepath.Join(runtimeRoot, "node", "node.exe")
	script := filepath.Join(runtimeRoot, "app", "seed-admin.mjs")
	seedEnv := append(env, "API_URL=http://127.0.0.1:"+fmt.Sprint(apiPort), "ADMIN_EMAIL="+adminEmail, "ADMIN_PASSWORD="+adminPassword)
	if err := runCommand(node, []string{script}, seedEnv, filepath.Join(runtimeRoot, "app"), filepath.Join(root, "logs", "seed.log")); err != nil {
		return err
	}
	return os.WriteFile(marker, []byte(version), 0600)
}

func startManager(selection rootSelection, runtimeRoot string, processes *processSet, values secrets, stop chan struct{}) (*http.Server, error) {
	root := selection.Path
	mux := http.NewServeMux()
	mux.HandleFunc("/", func(response http.ResponseWriter, request *http.Request) {
		if request.URL.Path != "/" {
			http.NotFound(response, request)
			return
		}
		response.Header().Set("Content-Type", "text/html; charset=utf-8")
		io.WriteString(response, managerHTML)
	})
	mux.HandleFunc("/api/status", func(response http.ResponseWriter, request *http.Request) {
		response.Header().Set("Content-Type", "application/json")
		json.NewEncoder(response).Encode(map[string]any{
			"api":           portOpen(apiPort),
			"collaboration": portOpen(collabPort),
			"worker":        portOpen(workerPort),
			"postgres":      portOpen(postgresPort),
			"redis":         portOpen(redisPort),
			"storage":       portOpen(minioPort),
			"client":        portOpen(5173),
			"dataPath":      filepath.Join(root, "data"),
			"storageMode":   selection.Mode,
			"storageNotice": selection.Mode == "portable folder fallback",
			"version":       version,
		})
	})
	mux.HandleFunc("/api/open", func(response http.ResponseWriter, request *http.Request) {
		if request.Method != http.MethodPost {
			http.Error(response, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		executable, _ := os.Executable()
		client := filepath.Join(filepath.Dir(executable), "DocSys.exe")
		if _, err := os.Stat(client); err != nil {
			http.Error(response, "DocSys.exe was not found next to the server manager", http.StatusNotFound)
			return
		}
		command := exec.Command(client)
		hideWindow(command)
		if err := command.Start(); err != nil {
			http.Error(response, err.Error(), http.StatusInternalServerError)
			return
		}
		response.WriteHeader(http.StatusNoContent)
	})
	mux.HandleFunc("/api/log", func(response http.ResponseWriter, request *http.Request) {
		allowed := map[string]string{"launcher": "launcher.log", "client": "client.log", "api": "api.log", "collaboration": "collaboration.log", "worker": "worker.log", "postgres": "postgres.log", "redis": "redis.log", "storage": "minio.log", "seed": "seed.log", "migration": "migrate.log"}
		name, valid := allowed[request.URL.Query().Get("name")]
		if !valid {
			http.Error(response, "unknown log", http.StatusBadRequest)
			return
		}
		content, err := os.ReadFile(filepath.Join(root, "logs", name))
		if err != nil && !os.IsNotExist(err) {
			http.Error(response, err.Error(), http.StatusInternalServerError)
			return
		}
		if len(content) > 200000 {
			content = content[len(content)-200000:]
		}
		response.Header().Set("Content-Type", "text/plain; charset=utf-8")
		response.Write(content)
	})
	mux.HandleFunc("/api/backup", func(response http.ResponseWriter, request *http.Request) {
		if request.Method != http.MethodPost {
			http.Error(response, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		backupRoot := filepath.Join(root, "backups")
		if err := os.MkdirAll(backupRoot, 0700); err != nil {
			http.Error(response, err.Error(), http.StatusInternalServerError)
			return
		}
		fileName := "docsys-" + time.Now().Format("20060102-150405") + ".dump"
		path := filepath.Join(backupRoot, fileName)
		pgDump := filepath.Join(runtimeRoot, "postgres", "bin", "pg_dump.exe")
		env := append(processes.env, "PGPASSWORD="+values.Database)
		err := runCommand(pgDump, []string{"-h", "127.0.0.1", "-p", fmt.Sprint(postgresPort), "-U", "docsys", "-d", "docsys", "-Fc", "-f", path}, env, runtimeRoot, filepath.Join(root, "logs", "backup.log"))
		if err != nil {
			http.Error(response, err.Error(), http.StatusInternalServerError)
			return
		}
		response.Header().Set("Content-Type", "application/json")
		json.NewEncoder(response).Encode(map[string]string{"path": path})
	})
	mux.HandleFunc("/api/stop", func(response http.ResponseWriter, request *http.Request) {
		if request.Method != http.MethodPost {
			http.Error(response, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		response.WriteHeader(http.StatusNoContent)
		select {
		case stop <- struct{}{}:
		default:
		}
	})
	server := &http.Server{Addr: fmt.Sprintf("127.0.0.1:%d", managerPort), Handler: mux}
	listener, err := net.Listen("tcp", server.Addr)
	if err != nil {
		return nil, err
	}
	go func() {
		if err := server.Serve(listener); err != nil && !errors.Is(err, http.ErrServerClosed) {
			logger.Printf("manager failed: %v", err)
		}
	}()
	return server, nil
}

func portOpen(port int) bool {
	connection, err := net.DialTimeout("tcp", fmt.Sprintf("127.0.0.1:%d", port), 150*time.Millisecond)
	if err != nil {
		return false
	}
	connection.Close()
	return true
}

func checkRequiredPorts() error {
	ports := []int{apiPort, collabPort, workerPort, managerPort, postgresPort, redisPort, minioPort, minioConsole}
	occupied := make([]string, 0)
	for _, port := range ports {
		if portOpen(port) {
			occupied = append(occupied, fmt.Sprint(port))
		}
	}
	if len(occupied) > 0 {
		return fmt.Errorf("required local ports are already in use: %s", strings.Join(occupied, ", "))
	}
	return nil
}

const managerHTML = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>DocSys Server</title><style>body{margin:0;background:#0b1120;color:#e5e7eb;font:15px system-ui}main{max-width:980px;margin:40px auto;padding:0 24px}h1{font-size:30px;margin-bottom:6px}.sub{color:#94a3b8}.card{background:#111827;border:1px solid #263244;border-radius:14px;padding:20px;margin-top:20px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px}.service{background:#172033;border-radius:10px;padding:13px}.dot{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:8px}.on{background:#22c55e}.off{background:#ef4444}.notice{display:none;background:#422006;border:1px solid #a16207;color:#fde68a;padding:12px;border-radius:10px;margin-top:14px}button,select{border:0;border-radius:9px;padding:10px 14px;margin:6px 8px 0 0;background:#2563eb;color:white;cursor:pointer}button.secondary{background:#334155}button.danger{background:#b91c1c}pre{white-space:pre-wrap;max-height:360px;overflow:auto;background:#050914;padding:14px;border-radius:10px;color:#cbd5e1}.path{word-break:break-all;color:#94a3b8}</style></head><body><main><h1>DocSys Server</h1><div class="sub">Portable backend and infrastructure manager</div><section class="card"><div id="services" class="grid"></div><p class="path" id="path"></p><div id="notice" class="notice">User profile storage is not writable. DocSys is safely using the DocSysData folder beside the EXE files. Keep this folder with the application when moving it.</div><button onclick="openApp()">Open DocSys</button><button class="secondary" onclick="backup()">Create backup</button><button class="danger" onclick="stopServer()">Stop server</button><p id="message"></p></section><section class="card"><select id="logName" onchange="loadLog()"><option value="launcher">Startup stages</option><option value="client">Client</option><option value="api">API</option><option value="collaboration">Collaboration</option><option value="worker">Worker</option><option value="postgres">PostgreSQL</option><option value="redis">Redis</option><option value="storage">Storage</option><option value="migration">Migration</option><option value="seed">Seed</option></select><button class="secondary" onclick="loadLog()">Refresh log</button><pre id="log"></pre></section></main><script>const labels={api:'API',collaboration:'Collaboration',worker:'Worker',postgres:'PostgreSQL',redis:'Redis',storage:'Object storage',client:'DocSys client'};async function refresh(){try{const r=await fetch('/api/status');if(!r.ok)throw new Error('Status request failed: HTTP '+r.status);const s=await r.json();document.getElementById('services').innerHTML=Object.keys(labels).map(k=>'<div class="service"><span class="dot '+(s[k]?'on':'off')+'"></span>'+labels[k]+'<br><small>'+(s[k]?'Running':'Stopped')+'</small></div>').join('');document.getElementById('path').textContent='Data: '+s.dataPath+' | Storage: '+s.storageMode+' | '+s.version;document.getElementById('notice').style.display=s.storageNotice?'block':'none'}catch(e){message('[DS-SRV-520] Status refresh failed: '+e.message)}}async function action(path){const r=await fetch(path,{method:'POST'});const text=await r.text();if(!r.ok)throw new Error('HTTP '+r.status+': '+text);return text}async function openApp(){try{await action('/api/open');message('DocSys started')}catch(e){message('[DS-SRV-530] Client launch failed: '+e.message)}}async function backup(){try{const r=JSON.parse(await action('/api/backup'));message('Backup: '+r.path)}catch(e){message('[DS-SRV-540] Backup failed: '+e.message)}}async function stopServer(){try{await action('/api/stop');message('Server is stopping');setTimeout(()=>window.close(),700)}catch(e){message('[DS-SRV-550] Stop request failed: '+e.message)}}async function loadLog(){try{const r=await fetch('/api/log?name='+encodeURIComponent(document.getElementById('logName').value));const text=await r.text();if(!r.ok)throw new Error('HTTP '+r.status+': '+text);document.getElementById('log').textContent=text}catch(e){message('[DS-SRV-560] Log read failed: '+e.message)}}function message(value){document.getElementById('message').textContent=value}refresh();loadLog();setInterval(refresh,3000)</script></body></html>`

func startLogged(command *exec.Cmd, logPath string, processes *processSet) error {
	if err := attachLog(command, logPath); err != nil {
		return fmt.Errorf("could not attach diagnostic log %s: %w", logPath, err)
	}
	if err := command.Start(); err != nil {
		return fmt.Errorf("%s could not start: %w (log: %s)", filepath.Base(command.Path), err, logPath)
	}
	processes.commands = append(processes.commands, command)
	return nil
}

func attachLog(command *exec.Cmd, path string) error {
	if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil {
		return err
	}
	file, err := os.OpenFile(path, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0600)
	if err != nil {
		return err
	}
	command.Stdout = file
	command.Stderr = file
	return nil
}

func runCommand(executable string, arguments []string, env []string, directory string, logPath string) error {
	command := exec.Command(executable, arguments...)
	hideWindow(command)
	command.Dir = directory
	if env != nil {
		command.Env = env
	}
	if err := attachLog(command, logPath); err != nil {
		return fmt.Errorf("could not attach diagnostic log %s: %w", logPath, err)
	}
	if err := command.Run(); err != nil {
		return fmt.Errorf("%s failed: %w (log: %s)", filepath.Base(executable), err, logPath)
	}
	return nil
}

func waitPort(port int, timeout time.Duration) error {
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		connection, err := net.DialTimeout("tcp", fmt.Sprintf("127.0.0.1:%d", port), 300*time.Millisecond)
		if err == nil {
			connection.Close()
			return nil
		}
		time.Sleep(250 * time.Millisecond)
	}
	return fmt.Errorf("service did not listen on 127.0.0.1:%d before the timeout", port)
}

func waitHTTP(address string, timeout time.Duration) error {
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		if healthy(address, time.Second) {
			return nil
		}
		time.Sleep(500 * time.Millisecond)
	}
	return fmt.Errorf("%s did not return a successful response before the timeout", address)
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

func openBrowser(address string) error {
	if _, err := url.Parse(address); err != nil {
		return err
	}
	command := exec.Command("rundll32", "url.dll,FileProtocolHandler", address)
	hideWindow(command)
	if err := command.Start(); err != nil {
		return err
	}
	return command.Process.Release()
}

func hideWindow(command *exec.Cmd) {
	command.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: createNoWindow}
}

func (processes *processSet) stop() {
	if processes.postgres != "" {
		runCommand(processes.postgres, []string{"stop", "-D", processes.data, "-m", "fast", "-w"}, processes.env, filepath.Dir(processes.postgres), filepath.Join(filepath.Dir(filepath.Dir(processes.data)), "logs", "postgres-stop.log"))
	}
	for index := len(processes.commands) - 1; index >= 0; index-- {
		if processes.commands[index].Process != nil {
			processes.commands[index].Process.Kill()
		}
	}
}

func messageBox(title string, text string, style uintptr) {
	user32 := syscall.NewLazyDLL("user32.dll")
	procedure := user32.NewProc("MessageBoxW")
	titlePointer, _ := syscall.UTF16PtrFromString(title)
	textPointer, _ := syscall.UTF16PtrFromString(text)
	procedure.Call(0, uintptr(unsafe.Pointer(textPointer)), uintptr(unsafe.Pointer(titlePointer)), style)
}
