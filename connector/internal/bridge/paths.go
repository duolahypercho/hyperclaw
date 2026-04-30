package bridge

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
)

// Paths holds resolved filesystem paths used by bridge actions.
// The HyperClaw directory is organized into subdirectories:
//
//	~/.hyperclaw/
//	├── config/         # Configuration files (gateway.json, .env)
//	├── credentials/    # Device identity (device.id, device.key, device.token)
//	├── data/           # Databases (connector.db, intel.db)
//	│   └── backups/    # Database backups
//	├── state/          # Runtime state (todo.json, usage.json, etc.)
//	│   └── office/     # Office layout files
//	├── logs/           # Log files
//	│   └── archive/    # Rotated logs
//	├── events/         # Append-only event streams (events.jsonl, commands.jsonl)
//	├── agents/         # Agent workspaces
//	├── plugins/        # Plugin files
//	└── bin/            # Binaries and backups
//	    └── backups/    # Binary backups
type Paths struct {
	Home           string // ~
	OpenClaw       string // ~/.openclaw
	OpenClawAlt    string // ~/openclaw
	HyperClaw      string // ~/.hyperclaw
	Hermes         string // ~/.hermes
	ClaudeProjects string // ~/.claude/projects
	HermesStateDB  string // ~/.hermes/state.db
}

var (
	globalPaths     Paths
	globalPathsOnce sync.Once
)

// ResolvePaths returns the singleton Paths, resolved once.
func ResolvePaths() Paths {
	globalPathsOnce.Do(func() {
		home, err := os.UserHomeDir()
		if err != nil {
			home = "/root"
		}
		globalPaths = Paths{
			Home:           home,
			OpenClaw:       filepath.Join(home, ".openclaw"),
			OpenClawAlt:    filepath.Join(home, "openclaw"),
			HyperClaw:      filepath.Join(home, ".hyperclaw"),
			Hermes:         filepath.Join(home, ".hermes"),
			ClaudeProjects: filepath.Join(home, ".claude", "projects"),
			HermesStateDB:  filepath.Join(home, ".hermes", "state.db"),
		}
	})
	return globalPaths
}

// =============================================================================
// Subdirectory paths
// =============================================================================

// ConfigDir returns ~/.hyperclaw/config/
func (p Paths) ConfigDir() string {
	return filepath.Join(p.HyperClaw, "config")
}

// CredentialsDir returns ~/.hyperclaw/credentials/
func (p Paths) CredentialsDir() string {
	return filepath.Join(p.HyperClaw, "credentials")
}

// DataDir returns ~/.hyperclaw/data/
func (p Paths) DataDir() string {
	return filepath.Join(p.HyperClaw, "data")
}

// DataBackupsDir returns ~/.hyperclaw/data/backups/
func (p Paths) DataBackupsDir() string {
	return filepath.Join(p.HyperClaw, "data", "backups")
}

// StateDir returns ~/.hyperclaw/state/
func (p Paths) StateDir() string {
	return filepath.Join(p.HyperClaw, "state")
}

// LogsDir returns ~/.hyperclaw/logs/
func (p Paths) LogsDir() string {
	return filepath.Join(p.HyperClaw, "logs")
}

// LogsArchiveDir returns ~/.hyperclaw/logs/archive/
func (p Paths) LogsArchiveDir() string {
	return filepath.Join(p.HyperClaw, "logs", "archive")
}

// EventsDir returns ~/.hyperclaw/events/
func (p Paths) EventsDir() string {
	return filepath.Join(p.HyperClaw, "events")
}

// PluginsDir returns ~/.hyperclaw/plugins/
func (p Paths) PluginsDir() string {
	return filepath.Join(p.HyperClaw, "plugins")
}

// BinDir returns ~/.hyperclaw/bin/
func (p Paths) BinDir() string {
	return filepath.Join(p.HyperClaw, "bin")
}

// BinBackupsDir returns ~/.hyperclaw/bin/backups/
func (p Paths) BinBackupsDir() string {
	return filepath.Join(p.HyperClaw, "bin", "backups")
}

// =============================================================================
// Credential file paths
// =============================================================================

// DeviceIDPath returns ~/.hyperclaw/credentials/device.id
func (p Paths) DeviceIDPath() string {
	return filepath.Join(p.CredentialsDir(), "device.id")
}

// DeviceKeyPath returns ~/.hyperclaw/credentials/device.key
func (p Paths) DeviceKeyPath() string {
	return filepath.Join(p.CredentialsDir(), "device.key")
}

// DeviceTokenPath returns ~/.hyperclaw/credentials/device.token
func (p Paths) DeviceTokenPath() string {
	return filepath.Join(p.CredentialsDir(), "device.token")
}

// =============================================================================
// Config file paths
// =============================================================================

// GatewayConfigPath returns ~/.hyperclaw/config/gateway.json
func (p Paths) GatewayConfigPath() string {
	return filepath.Join(p.ConfigDir(), "gateway.json")
}

// EnvPath returns ~/.hyperclaw/config/.env
func (p Paths) EnvPath() string {
	return filepath.Join(p.ConfigDir(), ".env")
}

// =============================================================================
// Database paths
// =============================================================================

// ConnectorDBPath returns ~/.hyperclaw/data/connector.db
func (p Paths) ConnectorDBPath() string {
	return filepath.Join(p.DataDir(), "connector.db")
}

// IntelDBPath returns ~/.hyperclaw/data/intel.db
func (p Paths) IntelDBPath() string {
	return filepath.Join(p.DataDir(), "intel.db")
}

// =============================================================================
// Log paths
// =============================================================================

// ConnectorLogPath returns ~/.hyperclaw/logs/connector.log
func (p Paths) ConnectorLogPath() string {
	return filepath.Join(p.LogsDir(), "connector.log")
}

// DebugLogPath returns ~/.hyperclaw/logs/debug.log
func (p Paths) DebugLogPath() string {
	return filepath.Join(p.LogsDir(), "debug.log")
}

// BridgeLogPath returns ~/.hyperclaw/logs/bridge.log
func (p Paths) BridgeLogPath() string {
	return filepath.Join(p.LogsDir(), "bridge.log")
}

// =============================================================================
// State file paths (runtime state that can be rebuilt)
// =============================================================================

// TodoDataPath returns ~/.hyperclaw/state/todo.json
func (p Paths) TodoDataPath() string {
	return filepath.Join(p.StateDir(), "todo.json")
}

// UsagePath returns ~/.hyperclaw/state/usage.json
func (p Paths) UsagePath() string {
	return filepath.Join(p.StateDir(), "usage.json")
}

// ChannelsPath returns ~/.hyperclaw/state/channels.json
func (p Paths) ChannelsPath() string {
	return filepath.Join(p.StateDir(), "channels.json")
}

// OrgChartPath returns ~/.hyperclaw/state/orgchart.json
func (p Paths) OrgChartPath() string {
	return filepath.Join(p.StateDir(), "orgchart.json")
}

// OfficeLayoutPath returns ~/.hyperclaw/state/office/layout.json
func (p Paths) OfficeLayoutPath() string {
	return filepath.Join(p.StateDir(), "office", "layout.json")
}

// OfficeSeatsPath returns ~/.hyperclaw/state/office/seats.json
func (p Paths) OfficeSeatsPath() string {
	return filepath.Join(p.StateDir(), "office", "seats.json")
}

// =============================================================================
// Event stream paths (append-only logs)
// =============================================================================

// EventsPath returns ~/.hyperclaw/events/events.jsonl
func (p Paths) EventsPath() string {
	return filepath.Join(p.EventsDir(), "events.jsonl")
}

// CommandsPath returns ~/.hyperclaw/events/commands.jsonl
func (p Paths) CommandsPath() string {
	return filepath.Join(p.EventsDir(), "commands.jsonl")
}

// CompanyDir returns ~/.hyperclaw/company/{slug}/ for a named company workspace.
// Deprecated: use KnowledgeDir for new code.
func (p Paths) CompanyDir(companySlug string) string {
	return filepath.Join(p.HyperClaw, "company", companySlug)
}

// KnowledgeDir returns ~/.hyperclaw/knowledge/{slug}/ — the shared knowledge
// base for a company. All agents read from this directory.
func (p Paths) KnowledgeDir(companySlug string) string {
	return filepath.Join(p.HyperClaw, "knowledge", companySlug)
}

// =============================================================================
// OpenClaw paths (external, not in ~/.hyperclaw)
// =============================================================================

// CronJobsPath returns ~/.openclaw/cron/jobs.json
func (p Paths) CronJobsPath() string {
	return filepath.Join(p.OpenClaw, "cron", "jobs.json")
}

// CronRunsDir returns ~/.openclaw/cron/runs/
func (p Paths) CronRunsDir() string {
	return filepath.Join(p.OpenClaw, "cron", "runs")
}

// OpenClawConfigPath returns ~/.openclaw/openclaw.json
func (p Paths) OpenClawConfigPath() string {
	return filepath.Join(p.OpenClaw, "openclaw.json")
}

// ConfigPath returns ~/.openclaw/openclaw.json (alias for backwards compat)
func (p Paths) ConfigPath() string {
	return p.OpenClawConfigPath()
}

// GatewayLogPath returns the first existing gateway log path, or default.
func (p Paths) GatewayLogPath() string {
	primary := filepath.Join(p.OpenClaw, "logs", "gateway.log")
	if _, err := os.Stat(primary); err == nil {
		return primary
	}
	alt := filepath.Join(p.OpenClawAlt, "logs", "gateway.log")
	if _, err := os.Stat(alt); err == nil {
		return alt
	}
	return primary
}

// GatewayErrLogPath returns the first existing gateway error log path, or empty string.
func (p Paths) GatewayErrLogPath() string {
	primary := filepath.Join(p.OpenClaw, "logs", "gateway.err.log")
	if _, err := os.Stat(primary); err == nil {
		return primary
	}
	alt := filepath.Join(p.OpenClawAlt, "logs", "gateway.err.log")
	if _, err := os.Stat(alt); err == nil {
		return alt
	}
	return ""
}

// ValidateRelativePath checks that rel is a safe relative path within base.
// Returns the resolved absolute path or an error.
func ValidateRelativePath(base, rel string) (string, error) {
	if rel == "" {
		return "", fmt.Errorf("empty path")
	}
	if filepath.IsAbs(rel) {
		return "", fmt.Errorf("absolute path not allowed")
	}
	if strings.Contains(rel, "..") {
		return "", fmt.Errorf("path traversal not allowed")
	}

	// Clean the relative path and re-check for ".." components that may have
	// been disguised (e.g. "foo/../../bar" cleans to "../bar").
	cleaned := filepath.Clean(rel)
	if cleaned == ".." || strings.HasPrefix(cleaned, ".."+string(filepath.Separator)) ||
		strings.Contains(cleaned, string(filepath.Separator)+".."+string(filepath.Separator)) ||
		strings.HasSuffix(cleaned, string(filepath.Separator)+"..") {
		return "", fmt.Errorf("path traversal not allowed")
	}

	resolved := filepath.Join(base, cleaned)
	absBase, _ := filepath.Abs(base)
	absResolved, _ := filepath.Abs(resolved)
	if !strings.HasPrefix(absResolved, absBase+string(filepath.Separator)) && absResolved != absBase {
		return "", fmt.Errorf("path escapes workspace")
	}

	// Resolve symlinks to prevent symlink-based escapes.
	// Only check if the path actually exists on disk; new files won't have
	// symlinks to resolve. Walk up to the deepest existing ancestor.
	if realResolved, err := filepath.EvalSymlinks(absResolved); err == nil {
		realBase, err2 := filepath.EvalSymlinks(absBase)
		if err2 != nil {
			realBase = absBase
		}
		if !strings.HasPrefix(realResolved, realBase+string(filepath.Separator)) && realResolved != realBase {
			return "", fmt.Errorf("symlink escapes workspace")
		}
	} else {
		// Path doesn't fully exist yet — resolve the parent directory to catch
		// symlinks in intermediate directories.
		parent := filepath.Dir(absResolved)
		if realParent, err := filepath.EvalSymlinks(parent); err == nil {
			realBase, err2 := filepath.EvalSymlinks(absBase)
			if err2 != nil {
				realBase = absBase
			}
			if !strings.HasPrefix(realParent, realBase+string(filepath.Separator)) && realParent != realBase {
				return "", fmt.Errorf("symlink escapes workspace")
			}
		}
	}

	return resolved, nil
}

// EnsureDir creates a directory and all parents if needed.
func EnsureDir(dir string) error {
	return os.MkdirAll(dir, 0755)
}

// EnsureDirectories creates all HyperClaw subdirectories on first run.
// This should be called once during connector startup.
func (p Paths) EnsureDirectories() error {
	// Directories with standard permissions (0755)
	dirs := []string{
		p.HyperClaw,
		p.ConfigDir(),
		p.DataDir(),
		p.DataBackupsDir(),
		p.StateDir(),
		filepath.Join(p.StateDir(), "office"),
		p.LogsDir(),
		p.LogsArchiveDir(),
		p.EventsDir(),
		p.AgentsDir(),
		p.PluginsDir(),
		p.BinDir(),
		p.BinBackupsDir(),
	}

	for _, dir := range dirs {
		if err := os.MkdirAll(dir, 0755); err != nil {
			return fmt.Errorf("create directory %s: %w", dir, err)
		}
	}

	// Credentials directory with restricted permissions (0700)
	if err := os.MkdirAll(p.CredentialsDir(), 0700); err != nil {
		return fmt.Errorf("create credentials directory: %w", err)
	}

	return nil
}
