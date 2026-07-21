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

const version = "0.1.6-server.2"

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
		messageBox("DocSys", "This package requires 64-bit Windows.", 0x10)
		return
	}
	root, err := localRoot()
	if err != nil {
		messageBox("DocSys", err.Error(), 0x10)
		return
	}
	if err = os.MkdirAll(filepath.Join(root, "logs"), 0700); err != nil {
		messageBox("DocSys", err.Error(), 0x10)
		return
	}
	logFile, err := os.OpenFile(filepath.Join(root, "logs", "launcher.log"), os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0600)
	if err != nil {
		messageBox("DocSys", err.Error(), 0x10)
		return
	}
	defer logFile.Close()
	logger = log.New(logFile, time.Now().Format("2006-01-02 15:04:05 "), log.LstdFlags)
	if healthy(fmt.Sprintf("http://127.0.0.1:%d/api/status", managerPort), 500*time.Millisecond) {
		openBrowser(fmt.Sprintf("http://127.0.0.1:%d", managerPort))
		return
	}
	if err = run(root); err != nil {
		logger.Printf("startup failed: %v", err)
		messageBox("DocSys baslatilamadi", err.Error()+"\n\nLog: "+filepath.Join(root, "logs", "launcher.log"), 0x10)
	}
}

func run(root string) error {
	runtimeRoot := filepath.Join(root, "runtime", version)
	if err := extractRuntime(runtimeRoot); err != nil {
		return fmt.Errorf("application files could not be prepared: %w", err)
	}
	dataRoot := filepath.Join(root, "data")
	for _, path := range []string{dataRoot, filepath.Join(dataRoot, "redis"), filepath.Join(dataRoot, "minio")} {
		if err := os.MkdirAll(path, 0700); err != nil {
			return err
		}
	}
	secretValues, err := loadSecrets(filepath.Join(dataRoot, "secrets.json"))
	if err != nil {
		return err
	}
	processes := &processSet{postgres: filepath.Join(runtimeRoot, "postgres", "bin", "pg_ctl.exe"), data: filepath.Join(dataRoot, "postgres")}
	defer processes.stop()
	if err = startPostgres(runtimeRoot, processes, secretValues); err != nil {
		return err
	}
	if err = prepareDatabase(runtimeRoot, processes, secretValues); err != nil {
		return err
	}
	if err = startInfrastructure(runtimeRoot, dataRoot, processes, secretValues); err != nil {
		return err
	}
	appEnv := applicationEnv(dataRoot, secretValues)
	processes.env = appEnv
	if err = migrate(runtimeRoot, appEnv); err != nil {
		return fmt.Errorf("database migration failed: %w", err)
	}
	if err = startApplications(runtimeRoot, root, processes, appEnv); err != nil {
		return err
	}
	if err = waitHTTP(fmt.Sprintf("http://127.0.0.1:%d/health/ready", apiPort), 90*time.Second); err != nil {
		return fmt.Errorf("API did not become ready: %w", err)
	}
	if err = seed(runtimeRoot, appEnv, root); err != nil {
		return fmt.Errorf("initial account could not be prepared: %w", err)
	}
	stop := make(chan struct{}, 1)
	manager := startManager(root, runtimeRoot, processes, secretValues, stop)
	defer manager.Close()
	openBrowser(fmt.Sprintf("http://127.0.0.1:%d", managerPort))
	<-stop
	return nil
}

func localRoot() (string, error) {
	base := os.Getenv("LOCALAPPDATA")
	if base == "" {
		return "", errors.New("LOCALAPPDATA is not available")
	}
	return filepath.Join(base, "DocSys"), nil
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
	os.RemoveAll(temporary)
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
	os.RemoveAll(target)
	if err = os.Rename(temporary, target); err != nil {
		return err
	}
	return os.WriteFile(marker, []byte(version), 0600)
}

func loadSecrets(path string) (secrets, error) {
	var values secrets
	if content, err := os.ReadFile(path); err == nil {
		if json.Unmarshal(content, &values) == nil && values.Database != "" && values.JWT != "" && values.Minio != "" && values.Metrics != "" {
			return values, nil
		}
	}
	values = secrets{Database: randomHex(24), JWT: randomHex(32), Minio: randomHex(24), Metrics: randomHex(32)}
	content, err := json.Marshal(values)
	if err != nil {
		return values, err
	}
	return values, os.WriteFile(path, content, 0600)
}

func randomHex(size int) string {
	value := make([]byte, size)
	if _, err := rand.Read(value); err != nil {
		panic(err)
	}
	return hex.EncodeToString(value)
}

func startPostgres(runtimeRoot string, processes *processSet, values secrets) error {
	bin := filepath.Join(runtimeRoot, "postgres", "bin")
	if _, err := os.Stat(filepath.Join(processes.data, "PG_VERSION")); os.IsNotExist(err) {
		if err = os.MkdirAll(processes.data, 0700); err != nil {
			return err
		}
		os.Remove(filepath.Join(processes.data, ".init-password"))
		passwordFile := filepath.Join(filepath.Dir(processes.data), ".init-password")
		if err = os.WriteFile(passwordFile, []byte(values.Database), 0600); err != nil {
			return err
		}
		defer os.Remove(passwordFile)
		if err = runCommand(filepath.Join(bin, "initdb.exe"), []string{"-D", processes.data, "-U", "docsys", "--pwfile=" + passwordFile, "--encoding=UTF8", "--locale=C", "--auth-host=scram-sha-256", "--auth-local=trust"}, nil, runtimeRoot, filepath.Join(filepath.Dir(processes.data), "..", "logs", "postgres-init.log")); err != nil {
			return fmt.Errorf("PostgreSQL initialization failed: %w", err)
		}
	}
	command := exec.Command(filepath.Join(bin, "postgres.exe"), "-D", processes.data, "-p", fmt.Sprint(postgresPort), "-h", "127.0.0.1")
	hideWindow(command)
	command.Dir = runtimeRoot
	command.Env = append(os.Environ(), "PGPASSWORD="+values.Database)
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
	env := append(os.Environ(), "PGPASSWORD="+values.Database)
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

func startInfrastructure(runtimeRoot string, dataRoot string, processes *processSet, values secrets) error {
	redisData := filepath.ToSlash(filepath.Join(dataRoot, "redis"))
	redis := exec.Command(filepath.Join(runtimeRoot, "redis", "redis-server.exe"), "--port", fmt.Sprint(redisPort), "--bind", "127.0.0.1", "--protected-mode", "yes", "--appendonly", "yes", "--dir", redisData)
	hideWindow(redis)
	redis.Dir = filepath.Join(runtimeRoot, "redis")
	if err := startLogged(redis, filepath.Join(filepath.Dir(dataRoot), "logs", "redis.log"), processes); err != nil {
		return err
	}
	if err := waitPort(redisPort, 30*time.Second); err != nil {
		return fmt.Errorf("Redis did not start: %w", err)
	}
	minio := exec.Command(filepath.Join(runtimeRoot, "minio", "minio.exe"), "server", filepath.Join(dataRoot, "minio"), "--address", fmt.Sprintf("127.0.0.1:%d", minioPort), "--console-address", fmt.Sprintf("127.0.0.1:%d", minioConsole))
	hideWindow(minio)
	minio.Env = append(os.Environ(), "MINIO_ROOT_USER=docsys", "MINIO_ROOT_PASSWORD="+values.Minio, "MINIO_BROWSER=off")
	if err := startLogged(minio, filepath.Join(filepath.Dir(dataRoot), "logs", "minio.log"), processes); err != nil {
		return err
	}
	return waitHTTP(fmt.Sprintf("http://127.0.0.1:%d/minio/health/ready", minioPort), 45*time.Second)
}

func applicationEnv(dataRoot string, values secrets) []string {
	return append(os.Environ(),
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

func startManager(root string, runtimeRoot string, processes *processSet, values secrets, stop chan struct{}) *http.Server {
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
		allowed := map[string]string{"api": "api.log", "collaboration": "collaboration.log", "worker": "worker.log", "postgres": "postgres.log", "redis": "redis.log", "storage": "minio.log", "seed": "seed.log", "migration": "migrate.log"}
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
	go func() {
		if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			logger.Printf("manager failed: %v", err)
		}
	}()
	return server
}

func portOpen(port int) bool {
	connection, err := net.DialTimeout("tcp", fmt.Sprintf("127.0.0.1:%d", port), 150*time.Millisecond)
	if err != nil {
		return false
	}
	connection.Close()
	return true
}

const managerHTML = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>DocSys Server</title><style>body{margin:0;background:#0b1120;color:#e5e7eb;font:15px system-ui}main{max-width:980px;margin:40px auto;padding:0 24px}h1{font-size:30px;margin-bottom:6px}.sub{color:#94a3b8}.card{background:#111827;border:1px solid #263244;border-radius:14px;padding:20px;margin-top:20px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px}.service{background:#172033;border-radius:10px;padding:13px}.dot{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:8px}.on{background:#22c55e}.off{background:#ef4444}button,select{border:0;border-radius:9px;padding:10px 14px;margin:6px 8px 0 0;background:#2563eb;color:white;cursor:pointer}button.secondary{background:#334155}button.danger{background:#b91c1c}pre{white-space:pre-wrap;max-height:360px;overflow:auto;background:#050914;padding:14px;border-radius:10px;color:#cbd5e1}.path{word-break:break-all;color:#94a3b8}</style></head><body><main><h1>DocSys Server</h1><div class="sub">Portable backend and infrastructure manager</div><section class="card"><div id="services" class="grid"></div><p class="path" id="path"></p><button onclick="openApp()">Open DocSys</button><button class="secondary" onclick="backup()">Create backup</button><button class="danger" onclick="stopServer()">Stop server</button><p id="message"></p></section><section class="card"><select id="logName" onchange="loadLog()"><option value="api">API</option><option value="collaboration">Collaboration</option><option value="worker">Worker</option><option value="postgres">PostgreSQL</option><option value="redis">Redis</option><option value="storage">Storage</option><option value="migration">Migration</option><option value="seed">Seed</option></select><button class="secondary" onclick="loadLog()">Refresh log</button><pre id="log"></pre></section></main><script>const labels={api:'API',collaboration:'Collaboration',worker:'Worker',postgres:'PostgreSQL',redis:'Redis',storage:'Object storage',client:'DocSys client'};async function refresh(){const s=await fetch('/api/status').then(r=>r.json());document.getElementById('services').innerHTML=Object.keys(labels).map(k=>'<div class="service"><span class="dot '+(s[k]?'on':'off')+'"></span>'+labels[k]+'<br><small>'+(s[k]?'Running':'Stopped')+'</small></div>').join('');document.getElementById('path').textContent='Data: '+s.dataPath+' | '+s.version}async function action(path){const r=await fetch(path,{method:'POST'});const text=await r.text();if(!r.ok)throw new Error(text);return text}async function openApp(){try{await action('/api/open');message('DocSys started')}catch(e){message(e.message)}}async function backup(){try{const r=JSON.parse(await action('/api/backup'));message('Backup: '+r.path)}catch(e){message(e.message)}}async function stopServer(){await action('/api/stop');message('Server is stopping');setTimeout(()=>window.close(),700)}async function loadLog(){const name=document.getElementById('logName').value;document.getElementById('log').textContent=await fetch('/api/log?name='+name).then(r=>r.text())}function message(value){document.getElementById('message').textContent=value}refresh();loadLog();setInterval(refresh,3000)</script></body></html>`

func startLogged(command *exec.Cmd, logPath string, processes *processSet) error {
	if err := attachLog(command, logPath); err != nil {
		return err
	}
	if err := command.Start(); err != nil {
		return err
	}
	processes.commands = append(processes.commands, command)
	return nil
}

func attachLog(command *exec.Cmd, path string) error {
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
		return err
	}
	return command.Run()
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
	return fmt.Errorf("port %d timed out", port)
}

func waitHTTP(address string, timeout time.Duration) error {
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		if healthy(address, time.Second) {
			return nil
		}
		time.Sleep(500 * time.Millisecond)
	}
	return fmt.Errorf("%s timed out", address)
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

func openBrowser(address string) {
	if _, err := url.Parse(address); err != nil {
		return
	}
	command := exec.Command("rundll32", "url.dll,FileProtocolHandler", address)
	hideWindow(command)
	command.Start()
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
