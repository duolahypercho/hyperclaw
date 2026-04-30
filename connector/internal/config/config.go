package config

import (
	"bufio"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"net"
	"os"
	"path/filepath"
	"regexp"
	"runtime"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/joho/godotenv"
)

type Config struct {
	// Hub connection
	HubURL      string
	HubOrigin   string // optional Origin header for WebSocket upgrade
	HubProtocol string // optional Sec-WebSocket-Protocol
	DeviceToken string
	DeviceID    string

	// Local OpenClaw gateway (always localhost — connector runs on same machine)
	GatewayURL   string // full WebSocket URL (e.g. ws://127.0.0.1:18789/gateway)
	GatewayHost  string
	GatewayPort  int
	GatewayToken string

	// Login (auto-setup)
	Email          string
	Password       string
	JWTSecret      string
	UserManagerURL string

	// Mode flags
	EnrollMode bool
	Debug      bool

	// Paths
	DataDir string

	// Version (set by main, used by hub/gateway connections)
	Version string
}

func Parse() *Config {
	// Load .env file — try CWD, then next to the executable, then ~/.hyperclaw/config/
	if err := godotenv.Load(); err != nil {
		loaded := false
		if exe, exeErr := os.Executable(); exeErr == nil {
			if godotenv.Load(filepath.Join(filepath.Dir(exe), ".env")) == nil {
				loaded = true
			}
		}
		if !loaded {
			if home, homeErr := os.UserHomeDir(); homeErr == nil {
				// Try new location first, then legacy location
				if godotenv.Load(filepath.Join(home, ".hyperclaw", "config", ".env")) != nil {
					godotenv.Load(filepath.Join(home, ".hyperclaw", ".env"))
				}
			}
		}
	}

	cfg := &Config{}

	// Hub URL is intentionally empty by default in Community Edition. When
	// empty the connector runs in local-bridge-only mode (no hub reconnect
	// loop, no remote routing). Cloud builds bake HUB_URL into the daemon
	// configuration at install time.
	flag.StringVar(&cfg.HubURL, "hub-url", getEnv("HUB_URL", ""), "Hub WebSocket URL (leave empty for local-only mode)")
	flag.StringVar(&cfg.HubOrigin, "hub-origin", getEnv("HUB_ORIGIN", ""), "Origin header for hub WebSocket (if server requires it)")
	flag.StringVar(&cfg.HubProtocol, "hub-protocol", getEnv("HUB_PROTOCOL", ""), "Sec-WebSocket-Protocol for hub (if server requires it)")
	flag.StringVar(&cfg.DeviceToken, "token", getEnv("DEVICE_TOKEN", ""), "Device pairing token")
	flag.StringVar(&cfg.DeviceID, "device-id", getEnv("DEVICE_ID", ""), "Device ID (auto-generated if empty)")

	flag.StringVar(&cfg.GatewayURL, "gateway-url", getEnv("GATEWAY_URL", ""), "Full gateway WebSocket URL (e.g. ws://127.0.0.1:18789/gateway)")
	flag.StringVar(&cfg.GatewayHost, "gateway-host", getEnv("GATEWAY_HOST", "127.0.0.1"), "OpenClaw gateway host")
	flag.IntVar(&cfg.GatewayPort, "gateway-port", 0, "OpenClaw gateway port (auto-discover if 0)")
	flag.StringVar(&cfg.GatewayToken, "gateway-token", getEnv("GATEWAY_TOKEN", ""), "OpenClaw gateway auth token")

	flag.StringVar(&cfg.Email, "email", getEnv("EMAIL", ""), "Login email for auto-setup")
	flag.StringVar(&cfg.Password, "password", getEnv("PASSWORD", ""), "Login password for auto-setup")
	flag.StringVar(&cfg.JWTSecret, "jwt-secret", getEnv("JWT_SECRET", ""), "JWT secret (shared with hub)")
	flag.StringVar(&cfg.UserManagerURL, "user-manager-url", getEnv("USER_MANAGER_URL", "http://localhost:3000"), "UserManager URL")

	flag.BoolVar(&cfg.EnrollMode, "enroll", false, "Generate new device keypair and enroll")
	flag.BoolVar(&cfg.Debug, "debug", getEnv("DEBUG", "false") == "true", "Enable debug logging")

	flag.StringVar(&cfg.DataDir, "data-dir", getEnv("DATA_DIR", ""), "Data directory (default: ~/.hyperclaw)")

	flag.Parse()

	// Auto-discover data dir
	if cfg.DataDir == "" {
		home, _ := os.UserHomeDir()
		cfg.DataDir = filepath.Join(home, ".hyperclaw")
	}

	// Load saved gateway config (from previous interactive setup)
	loadGatewayConfig(cfg)

	// Auto-discover gateway config from OpenClaw (fallback)
	discoverOpenClawConfig(cfg)

	// Auto-discover device token from saved file
	credentialsDir := filepath.Join(cfg.DataDir, "credentials")
	if cfg.DeviceToken == "" {
		// Try new location first, then legacy location
		tokenPath := filepath.Join(credentialsDir, "device.token")
		if data, err := os.ReadFile(tokenPath); err == nil {
			cfg.DeviceToken = strings.TrimSpace(string(data))
		} else {
			// Fallback to legacy location
			legacyPath := filepath.Join(cfg.DataDir, "device.token")
			if data, err := os.ReadFile(legacyPath); err == nil {
				cfg.DeviceToken = strings.TrimSpace(string(data))
			}
		}
	}

	// Save device token for future use (in new location)
	if cfg.DeviceToken != "" {
		tokenPath := filepath.Join(credentialsDir, "device.token")
		if _, err := os.Stat(tokenPath); err != nil {
			os.MkdirAll(credentialsDir, 0700)
			os.WriteFile(tokenPath, []byte(cfg.DeviceToken), 0600)
		}
	}

	if cfg.Debug {
		fmt.Printf("Config: HubURL=%s UserManagerURL=%s Email=%s JWTSecret=%d chars\n",
			cfg.HubURL, cfg.UserManagerURL, cfg.Email, len(cfg.JWTSecret))
	}

	return cfg
}

func hasUsableGatewayURL(url string) bool {
	url = strings.TrimSpace(url)
	if url == "" {
		return false
	}
	return !strings.Contains(url, ":0/")
}

func getEnv(key, defaultValue string) string {
	if value, ok := os.LookupEnv(key); ok {
		return value
	}
	return defaultValue
}

// openclawConfigPaths returns candidate paths for openclaw.json across platforms.
func openclawConfigPaths() []string {
	var paths []string
	home, err := os.UserHomeDir()
	if err != nil {
		return paths
	}

	// All platforms: ~/.openclaw/openclaw.json
	paths = append(paths, filepath.Join(home, ".openclaw", "openclaw.json"))

	// Windows: %APPDATA%\openclaw\openclaw.json
	if runtime.GOOS == "windows" {
		if appdata := os.Getenv("APPDATA"); appdata != "" {
			paths = append(paths, filepath.Join(appdata, "openclaw", "openclaw.json"))
		}
		if localAppdata := os.Getenv("LOCALAPPDATA"); localAppdata != "" {
			paths = append(paths, filepath.Join(localAppdata, "openclaw", "openclaw.json"))
		}
	}

	// Linux: XDG_CONFIG_HOME or ~/.config/openclaw
	if runtime.GOOS == "linux" {
		if xdg := os.Getenv("XDG_CONFIG_HOME"); xdg != "" {
			paths = append(paths, filepath.Join(xdg, "openclaw", "openclaw.json"))
		} else {
			paths = append(paths, filepath.Join(home, ".config", "openclaw", "openclaw.json"))
		}
	}

	return paths
}

// discoverOpenClawConfig reads from the local openclaw.json config.
// This is a fallback — users should prefer setting GATEWAY_URL and GATEWAY_TOKEN directly.
func discoverOpenClawConfig(cfg *Config) {
	// Skip auto-discovery if user already provided the full URL and token
	if hasUsableGatewayURL(cfg.GatewayURL) && cfg.GatewayToken != "" {
		return
	}

	var data []byte
	for _, path := range openclawConfigPaths() {
		var err error
		data, err = os.ReadFile(path)
		if err == nil {
			break
		}
	}
	if data == nil {
		return
	}

	var config map[string]interface{}
	if err := json.Unmarshal(data, &config); err != nil {
		return
	}

	gateway, ok := config["gateway"].(map[string]interface{})
	if !ok {
		return
	}

	// Get port (only if not already set via URL or flag)
	if !hasUsableGatewayURL(cfg.GatewayURL) && cfg.GatewayPort == 0 {
		if port, ok := gateway["port"].(float64); ok {
			cfg.GatewayPort = int(port)
		}
	}

	// Get token
	if cfg.GatewayToken == "" {
		if auth, ok := gateway["auth"].(map[string]interface{}); ok {
			// Direct token (e.g. auth.token)
			if token, ok := auth["token"].(string); ok {
				cfg.GatewayToken = token
			}
			// Fallback: profiles (legacy format)
			if cfg.GatewayToken == "" {
				if profiles, ok := auth["profiles"].(map[string]interface{}); ok {
					for _, profile := range profiles {
						if p, ok := profile.(map[string]interface{}); ok {
							if token, ok := p["token"].(string); ok {
								cfg.GatewayToken = token
								break
							}
						}
					}
				}
			}
		}
	}
}

// refreshGatewayToken re-reads the gateway auth token from disk on every call.
// A gateway restart can regenerate gateway.auth.token in openclaw.json, leaving
// the connector with a stale in-memory token. This method keeps it fresh so the
// next reconnect attempt uses the current credential.
func (c *Config) refreshGatewayToken() {
	// Read from openclaw.json (source of truth — the gateway writes it).
	if home, err := os.UserHomeDir(); err == nil {
		cfgPath := filepath.Join(home, ".openclaw", "openclaw.json")
		if data, err := os.ReadFile(cfgPath); err == nil {
			var raw map[string]interface{}
			if json.Unmarshal(data, &raw) == nil {
				if gw, ok := raw["gateway"].(map[string]interface{}); ok {
					if auth, ok := gw["auth"].(map[string]interface{}); ok {
						if tok, ok := auth["token"].(string); ok && tok != "" {
							c.GatewayToken = tok
							return
						}
					}
				}
			}
		}
	}
	// Fallback: read from gateway.json (written by syncConnectorGatewayConfigFromOpenClaw).
	configDir := filepath.Join(c.DataDir, "config")
	if data, err := os.ReadFile(filepath.Join(configDir, "gateway.json")); err == nil {
		var saved savedGatewayConfig
		if json.Unmarshal(data, &saved) == nil && saved.Token != "" {
			c.GatewayToken = saved.Token
		}
	}
}

// RefreshGatewayConfig retries local gateway discovery and repairs stale :0 URLs.
// This is important during onboarding because the connector may start before
// OpenClaw has written its final gateway port to disk. It also always refreshes
// the gateway token from disk so a gateway restart that regenerates the token
// doesn't leave the connector stuck with a stale credential.
func (c *Config) RefreshGatewayConfig() bool {
	// Always reload the token from gateway.json and openclaw.json — a gateway
	// restart (SIGUSR1 or stop+start) can regenerate the admin token.
	// Without this the connector loops with token_missing for minutes until
	// it eventually falls back to the device-auth token.
	c.refreshGatewayToken()

	if hasUsableGatewayURL(c.GatewayURL) {
		return true
	}

	if c.GatewayPort > 0 {
		c.GatewayURL = fmt.Sprintf("ws://%s:%d/gateway", c.GatewayHost, c.GatewayPort)
		return true
	}

	discoverOpenClawConfig(c)
	if hasUsableGatewayURL(c.GatewayURL) {
		return true
	}

	if port, token := c.tryConfigDiscovery(); port > 0 {
		c.GatewayPort = port
		c.GatewayURL = fmt.Sprintf("ws://%s:%d/gateway", c.GatewayHost, port)
		if c.GatewayToken == "" && token != "" {
			c.GatewayToken = token
		}
		_ = c.SaveGatewayConfig()
		return true
	}

	if ports := probeGatewayPorts(); len(ports) > 0 {
		c.GatewayPort = ports[0]
		c.GatewayURL = fmt.Sprintf("ws://%s:%d/gateway", c.GatewayHost, c.GatewayPort)
		if c.GatewayToken == "" {
			if _, token := c.tryConfigDiscovery(); token != "" {
				c.GatewayToken = token
			}
		}
		_ = c.SaveGatewayConfig()
		return true
	}

	return false
}

// Validate checks required fields
func (c *Config) Validate() error {
	if !hasUsableGatewayURL(c.GatewayURL) && c.GatewayPort == 0 {
		return fmt.Errorf("gateway connection required: set GATEWAY_URL (e.g. ws://host:port/gateway) or ensure OpenClaw is installed locally")
	}
	return nil
}

// GatewayNeedsSetup returns true if no gateway connection is configured.
func (c *Config) GatewayNeedsSetup() bool {
	return !hasUsableGatewayURL(c.GatewayURL) && c.GatewayPort == 0
}

// savedGatewayConfig is persisted at ~/.hyperclaw/config/gateway.json
type savedGatewayConfig struct {
	URL   string `json:"url"`
	Token string `json:"token"`
}

// loadGatewayConfig loads previously saved gateway config.
func loadGatewayConfig(cfg *Config) {
	if cfg.GatewayURL != "" && cfg.GatewayToken != "" {
		return // already configured via env/flags
	}

	// Try new location first, then legacy location
	configDir := filepath.Join(cfg.DataDir, "config")
	path := filepath.Join(configDir, "gateway.json")
	data, err := os.ReadFile(path)
	if err != nil {
		// Fallback to legacy location
		legacyPath := filepath.Join(cfg.DataDir, "gateway.json")
		data, err = os.ReadFile(legacyPath)
		if err != nil {
			return
		}
	}

	var saved savedGatewayConfig
	if err := json.Unmarshal(data, &saved); err != nil {
		return
	}

	if cfg.GatewayURL == "" && saved.URL != "" {
		cfg.GatewayURL = saved.URL
	}
	if cfg.GatewayToken == "" && saved.Token != "" {
		cfg.GatewayToken = saved.Token
	}
}

// SaveGatewayConfig saves gateway URL and token for future runs.
func (c *Config) SaveGatewayConfig() error {
	saved := savedGatewayConfig{
		URL:   c.GatewayURL,
		Token: c.GatewayToken,
	}
	data, err := json.MarshalIndent(saved, "", "  ")
	if err != nil {
		return err
	}
	configDir := filepath.Join(c.DataDir, "config")
	os.MkdirAll(configDir, 0755)
	return os.WriteFile(filepath.Join(configDir, "gateway.json"), data, 0600)
}

// tryExtractGateway reads an openclaw.json file and extracts gateway port + token.
// Returns (port, token, ok).
func tryExtractGateway(path string) (int, string, bool) {
	data, err := os.ReadFile(path)
	if err != nil {
		return 0, "", false
	}
	var config map[string]interface{}
	if json.Unmarshal(data, &config) != nil {
		return 0, "", false
	}
	gateway, ok := config["gateway"].(map[string]interface{})
	if !ok {
		return 0, "", false
	}

	port := 0
	if p, ok := gateway["port"].(float64); ok {
		port = int(p)
	}

	token := ""
	if auth, ok := gateway["auth"].(map[string]interface{}); ok {
		if t, ok := auth["token"].(string); ok {
			token = t
		}
		if token == "" {
			if profiles, ok := auth["profiles"].(map[string]interface{}); ok {
				for _, profile := range profiles {
					if p, ok := profile.(map[string]interface{}); ok {
						if t, ok := p["token"].(string); ok {
							token = t
							break
						}
					}
				}
			}
		}
	}

	return port, token, port > 0
}

// isInteractive returns true only if stdin, stdout, and stderr are all terminals.
// Checking all three prevents the daemon (run under launchd/systemd with
// /dev/null redirections) from printing the interactive setup banner into its
// log file.
func isInteractive() bool {
	in, err := os.Stdin.Stat()
	if err != nil || in.Mode()&os.ModeCharDevice == 0 {
		return false
	}
	out, err := os.Stdout.Stat()
	if err != nil || out.Mode()&os.ModeCharDevice == 0 {
		return false
	}
	errOut, err := os.Stderr.Stat()
	if err != nil || errOut.Mode()&os.ModeCharDevice == 0 {
		return false
	}
	return true
}

// sanitizeInput strips surrounding quotes, whitespace, and trailing newlines from user input.
func sanitizeInput(s string) string {
	s = strings.TrimSpace(s)
	// Strip surrounding single or double quotes (common copy-paste artifact)
	if len(s) >= 2 && ((s[0] == '"' && s[len(s)-1] == '"') || (s[0] == '\'' && s[len(s)-1] == '\'')) {
		s = s[1 : len(s)-1]
	}
	return strings.TrimSpace(s)
}

// maskToken returns a masked version of a token for display.
// Shows first 4 and last 4 chars if long enough, otherwise just shows length.
func maskToken(token string) string {
	if len(token) == 0 {
		return "(none)"
	}
	if len(token) < 8 {
		return fmt.Sprintf("(%d chars)", len(token))
	}
	return token[:4] + "..." + token[len(token)-4:]
}

// readLine reads a line from the reader, returning empty string on EOF/error.
func readLine(reader *bufio.Reader) string {
	line, err := reader.ReadString('\n')
	if err != nil && err != io.EOF {
		return ""
	}
	return sanitizeInput(line)
}

// barePortRegex matches input that is just a port number (e.g. "18789").
var barePortRegex = regexp.MustCompile(`^\d{1,5}$`)

// probeGatewayPorts tries to find running OpenClaw gateway(s) on localhost
// by attempting TCP connections to common ports. Returns all responsive ports
// sorted by the standard port (18789) first, then ascending.
func probeGatewayPorts() []int {
	// Common OpenClaw gateway ports.
	// NOTE: 18790 is the Hyperclaw connector's own bridge port. If we probe
	// it we'll happily "find" ourselves and save a self-pointing gateway
	// URL, which causes a WebSocket bad-handshake loop. Keep it out.
	candidatePorts := []int{18789, 18791, 18792, 18800, 8789, 8790}

	var mu sync.Mutex
	var hits []int
	var wg sync.WaitGroup

	for _, port := range candidatePorts {
		wg.Add(1)
		go func(p int) {
			defer wg.Done()
			addr := fmt.Sprintf("127.0.0.1:%d", p)
			conn, err := net.DialTimeout("tcp", addr, 500*time.Millisecond)
			if err == nil {
				conn.Close()
				mu.Lock()
				hits = append(hits, p)
				mu.Unlock()
			}
		}(port)
	}

	wg.Wait()

	// Sort: prefer 18789 first, then ascending
	sort.Slice(hits, func(i, j int) bool {
		if hits[i] == 18789 {
			return true
		}
		if hits[j] == 18789 {
			return false
		}
		return hits[i] < hits[j]
	})

	return hits
}

// PromptGatewaySetup interactively helps the user connect to their local OpenClaw gateway.
// The connector must run on the same machine as OpenClaw.
func (c *Config) PromptGatewaySetup() error {
	if !isInteractive() {
		return fmt.Errorf("OpenClaw gateway not found. The connector must run on the same machine as OpenClaw.\n\n" +
			"If OpenClaw is installed, set these in your .env:\n" +
			"  GATEWAY_URL=ws://127.0.0.1:18789/gateway\n" +
			"  GATEWAY_TOKEN=your_token_here\n\n" +
			"Or run the connector manually once to complete interactive setup.")
	}

	reader := bufio.NewReader(os.Stdin)

	fmt.Println()
	fmt.Println("╔══════════════════════════════════════════════════════════╗")
	fmt.Println("║            OpenClaw Gateway Setup                       ║")
	fmt.Println("╚══════════════════════════════════════════════════════════╝")
	fmt.Println()

	// Step 1: Probe localhost for a running gateway
	fmt.Print("  Scanning for OpenClaw on this machine... ")
	if ports := probeGatewayPorts(); len(ports) > 0 {
		return c.handleProbeHits(reader, ports)
	}
	fmt.Println("not running.")

	// Step 2: Try to find openclaw.json even if gateway isn't running yet
	fmt.Print("  Looking for openclaw.json... ")
	if port, token := c.tryConfigDiscovery(); port > 0 {
		fmt.Println("found!")
		c.GatewayURL = fmt.Sprintf("ws://127.0.0.1:%d/gateway", port)
		c.GatewayToken = token
		fmt.Printf("  Port: %d | Token: %s\n", port, maskToken(token))
		fmt.Println()
		fmt.Println("  OpenClaw doesn't seem to be running yet, but we have the config.")
		fmt.Println("  The connector will keep retrying until OpenClaw starts.")
		return c.saveAndConfirm()
	}
	fmt.Println("not found.")

	// Step 3: Nothing found — help the user
	fmt.Println()
	fmt.Println("  OpenClaw doesn't appear to be installed on this machine.")
	fmt.Println()
	fmt.Println("  The connector must run on the same machine as OpenClaw.")
	fmt.Println("  If OpenClaw is on a VPS, install the connector there too.")
	fmt.Println()
	fmt.Println("  Options:")
	fmt.Println("    [1] I have OpenClaw — let me point to its config file")
	fmt.Println("    [2] I know the port and token")
	fmt.Println("    [3] Exit (I need to install OpenClaw first)")
	fmt.Println()
	fmt.Print("  Choose [1/2/3]: ")

	choice := readLine(reader)

	switch choice {
	case "1", "":
		return c.promptLocateConfig(reader)
	case "2":
		return c.promptPortAndToken(reader)
	case "3":
		return fmt.Errorf("OpenClaw not installed. Install OpenClaw first, then re-run the connector.")
	default:
		return c.promptLocateConfig(reader)
	}
}

// handleProbeHits handles the case where we found running service(s) on probe ports.
func (c *Config) handleProbeHits(reader *bufio.Reader, ports []int) error {
	if len(ports) == 1 {
		fmt.Printf("found on port %d!\n", ports[0])
		c.GatewayURL = fmt.Sprintf("ws://127.0.0.1:%d/gateway", ports[0])
	} else {
		fmt.Printf("found %d candidates!\n", len(ports))
		fmt.Println()
		for i, p := range ports {
			label := ""
			if p == 18789 {
				label = " (default OpenClaw port)"
			}
			fmt.Printf("    [%d] port %d%s\n", i+1, p, label)
		}
		fmt.Println()
		fmt.Printf("  Which one? [1]: ")
		pick := readLine(reader)
		idx := 0
		if pick != "" && len(pick) == 1 && pick[0] >= '1' && pick[0] <= '9' {
			idx = int(pick[0]-'0') - 1
		}
		if idx < 0 || idx >= len(ports) {
			idx = 0
		}
		c.GatewayURL = fmt.Sprintf("ws://127.0.0.1:%d/gateway", ports[idx])
	}

	// Try to find the token from config files
	for _, path := range openclawConfigPaths() {
		_, token, ok := tryExtractGateway(path)
		if ok && token != "" {
			c.GatewayToken = token
			break
		}
	}

	if c.GatewayToken == "" {
		fmt.Println()
		fmt.Println("  Found the gateway but couldn't find the auth token.")
		fmt.Println("  Check your OpenClaw settings or openclaw.json → gateway.auth.token")
		fmt.Println()
		fmt.Print("  Gateway Token (press Enter if none): ")
		c.GatewayToken = readLine(reader)
	} else {
		fmt.Printf("  Token: %s\n", maskToken(c.GatewayToken))
	}

	return c.saveAndConfirm()
}

// tryConfigDiscovery searches all known config paths for gateway port + token.
func (c *Config) tryConfigDiscovery() (int, string) {
	home, _ := os.UserHomeDir()

	// Check standard paths + extras
	candidates := openclawConfigPaths()
	if home != "" {
		extras := []string{
			filepath.Join(home, "openclaw.json"),
			filepath.Join(home, "Desktop", "openclaw.json"),
			"/etc/openclaw/openclaw.json",
		}
		seen := map[string]bool{}
		for _, s := range candidates {
			seen[s] = true
		}
		for _, e := range extras {
			if !seen[e] {
				candidates = append(candidates, e)
			}
		}
	}

	for _, path := range candidates {
		if port, token, ok := tryExtractGateway(path); ok {
			return port, token
		}
	}
	return 0, ""
}

// promptLocateConfig asks the user to point to their openclaw.json.
func (c *Config) promptLocateConfig(reader *bufio.Reader) error {
	fmt.Println()
	fmt.Println("  Paste the path to your openclaw.json:")
	fmt.Println()

	home, _ := os.UserHomeDir()

	// Check for any files we might have missed
	var existingPaths []string
	for _, p := range openclawConfigPaths() {
		if fi, err := os.Stat(p); err == nil && !fi.IsDir() {
			existingPaths = append(existingPaths, p)
		}
	}

	if len(existingPaths) > 0 {
		fmt.Println("  Wait — found config file(s) we missed earlier:")
		for i, p := range existingPaths {
			fmt.Printf("    [%d] %s\n", i+1, p)
		}
		fmt.Println()
		fmt.Print("  Pick a number, or paste a custom path: ")
	} else {
		fmt.Println("  Common locations:")
		fmt.Println("    macOS/Linux: ~/.openclaw/openclaw.json")
		fmt.Println("    Windows:     %%APPDATA%%\\openclaw\\openclaw.json")
		fmt.Println("    Linux:       ~/.config/openclaw/openclaw.json")
		fmt.Println()
		fmt.Print("  Path: ")
	}

	input := readLine(reader)

	if input == "" {
		if len(existingPaths) > 0 {
			input = existingPaths[0]
		} else {
			fmt.Println()
			return c.promptPortAndToken(reader)
		}
	}

	// Number selection from list
	if len(existingPaths) > 0 && len(input) == 1 && input[0] >= '1' && input[0] <= '9' {
		idx := int(input[0]-'0') - 1
		if idx >= 0 && idx < len(existingPaths) {
			input = existingPaths[idx]
		}
	}

	// Expand ~
	if strings.HasPrefix(input, "~/") && home != "" {
		input = filepath.Join(home, input[2:])
	}

	port, token, ok := tryExtractGateway(input)
	if !ok {
		fmt.Printf("\n  Could not read gateway config from: %s\n", input)
		fmt.Println("  Let's try entering the port directly.")
		return c.promptPortAndToken(reader)
	}

	c.GatewayURL = fmt.Sprintf("ws://127.0.0.1:%d/gateway", port)
	c.GatewayToken = token

	fmt.Println()
	fmt.Printf("  Found gateway at port %d\n", port)
	fmt.Printf("  Token: %s\n", maskToken(token))

	return c.saveAndConfirm()
}

// promptPortAndToken asks for just the port number and token.
// Since the connector always runs on the same machine as OpenClaw, host is always localhost.
func (c *Config) promptPortAndToken(reader *bufio.Reader) error {
	fmt.Println()
	fmt.Println("  Enter your OpenClaw gateway port and token.")
	fmt.Println("  (Find these in OpenClaw settings → Gateway)")
	fmt.Println()

	fmt.Print("  Gateway Port (e.g. 18789): ")
	portInput := readLine(reader)
	if portInput == "" {
		return fmt.Errorf("gateway port is required")
	}
	if !barePortRegex.MatchString(portInput) {
		return fmt.Errorf("invalid port: %s", portInput)
	}

	c.GatewayURL = fmt.Sprintf("ws://127.0.0.1:%s/gateway", portInput)

	fmt.Print("  Gateway Token (press Enter if none): ")
	c.GatewayToken = readLine(reader)

	return c.saveAndConfirm()
}

// saveAndConfirm saves the gateway config and prints confirmation.
func (c *Config) saveAndConfirm() error {
	if err := c.SaveGatewayConfig(); err != nil {
		fmt.Printf("\n  Warning: could not save config: %v\n", err)
	} else {
		fmt.Printf("  Saved to %s/config/gateway.json\n", c.DataDir)
	}
	fmt.Printf("  Gateway: %s\n", c.GatewayURL)
	fmt.Println()
	return nil
}

// ResetGatewayConfig removes the saved gateway.json so the next run re-prompts.
func (c *Config) ResetGatewayConfig() {
	// Remove from both new and legacy locations
	configPath := filepath.Join(c.DataDir, "config", "gateway.json")
	legacyPath := filepath.Join(c.DataDir, "gateway.json")
	os.Remove(configPath)
	os.Remove(legacyPath)
	c.GatewayURL = ""
	c.GatewayToken = ""
	c.GatewayPort = 0
}
