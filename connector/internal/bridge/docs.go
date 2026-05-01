package bridge

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"time"
)

func base64Decode(s string) ([]byte, error) {
	return base64.StdEncoding.DecodeString(s)
}

// parseSkillMd parses a SKILL.md file and extracts name and description.
// Supports YAML frontmatter (---\nname: ...\ndescription: ...\n---) and
// Markdown headers (# Title\n\nDescription paragraph).
func parseSkillMd(path string) (name, description string) {
	data, err := os.ReadFile(path)
	if err != nil {
		return "", ""
	}
	content := strings.TrimSpace(string(data))

	// Try YAML frontmatter
	if strings.HasPrefix(content, "---") {
		lines := strings.Split(content, "\n")
		inFrontmatter := false
		for i, line := range lines {
			trimmed := strings.TrimSpace(line)
			if i == 0 && trimmed == "---" {
				inFrontmatter = true
				continue
			}
			if inFrontmatter {
				if trimmed == "---" {
					break
				}
				if strings.HasPrefix(line, "name:") {
					v := strings.TrimSpace(strings.TrimPrefix(line, "name:"))
					v = strings.Trim(v, `"'`)
					if v != "" {
						name = v
					}
				} else if strings.HasPrefix(line, "description:") {
					v := strings.TrimSpace(strings.TrimPrefix(line, "description:"))
					v = strings.Trim(v, `"'`)
					if v != "" {
						description = v
					}
				}
			}
		}
		if name != "" {
			return name, description
		}
	}

	// Fallback: parse Markdown heading + first paragraph
	lines := strings.Split(content, "\n")
	titleFound := false
	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		if !titleFound && strings.HasPrefix(trimmed, "# ") {
			name = strings.TrimPrefix(trimmed, "# ")
			titleFound = true
			continue
		}
		if titleFound && trimmed != "" && !strings.HasPrefix(trimmed, "#") && trimmed != "---" {
			description = trimmed
			break
		}
	}
	return name, description
}

// openclawListSkills lists skills from all OpenClaw skill directories.
// Scans: managed (~/.openclaw/skills/), workspace skills, per-agent workspace,
// personal agents (~/.agents/skills/), and extra dirs.
// Params: agentId (string, optional) — resolves per-agent workspace.
func (b *BridgeHandler) openclawListSkills(params map[string]interface{}) actionResult {
	paths := ResolvePaths()
	agentID, _ := params["agentId"].(string)

	// Collect all skill directories with their source tags
	type skillDir struct {
		dir    string
		source string
	}
	var dirs []skillDir

	// 1. Managed skills: ~/.openclaw/skills/
	dirs = append(dirs, skillDir{filepath.Join(paths.OpenClaw, "skills"), "openclaw-managed"})

	// 2. Default workspace skills: ~/.openclaw/workspace/skills/
	dirs = append(dirs, skillDir{filepath.Join(paths.OpenClaw, "workspace", "skills"), "openclaw-workspace"})

	// 3. Per-agent workspace skills: ~/.openclaw/workspace-<agentId>/skills/
	if agentID != "" {
		dirs = append(dirs, skillDir{
			filepath.Join(paths.OpenClaw, "workspace-"+agentID, "skills"),
			"openclaw-workspace",
		})
	} else {
		// Scan all workspace-* directories
		ocEntries, _ := os.ReadDir(paths.OpenClaw)
		for _, e := range ocEntries {
			if e.IsDir() && strings.HasPrefix(e.Name(), "workspace-") {
				dirs = append(dirs, skillDir{
					filepath.Join(paths.OpenClaw, e.Name(), "skills"),
					"openclaw-workspace",
				})
			}
		}
	}

	// 4. Personal agents skills: ~/.agents/skills/
	dirs = append(dirs, skillDir{filepath.Join(paths.Home, ".agents", "skills"), "agents-skills-personal"})

	// Deduplicate by skill name (later sources win, matching OpenClaw precedence)
	seen := map[string]map[string]interface{}{}
	for _, sd := range dirs {
		entries, err := os.ReadDir(sd.dir)
		if err != nil {
			continue // directory doesn't exist or unreadable — skip
		}
		for _, e := range entries {
			if !e.IsDir() {
				continue
			}
			skillKey := e.Name()
			skillMdPath := filepath.Join(sd.dir, skillKey, "SKILL.md")
			name, description := parseSkillMd(skillMdPath)
			if name == "" {
				name = skillKey
			}
			seen[name] = map[string]interface{}{
				"name":        name,
				"skillKey":    skillKey,
				"description": description,
				"source":      sd.source,
			}
		}
	}

	skills := make([]map[string]interface{}, 0, len(seen))
	for _, s := range seen {
		skills = append(skills, s)
	}
	return okResult(map[string]interface{}{"skills": skills})
}

// codexListSkills lists skills installed in ~/.codex/skills/.
// Includes both user skills (top-level directories) and system skills (.system/*).
// Each skill is a directory containing SKILL.md.
// Params: projectPath (string, optional) — also scan .agents/skills/ in project
func (b *BridgeHandler) codexListSkills(params map[string]interface{}) actionResult {
	home, err := os.UserHomeDir()
	if err != nil {
		return errResult("cannot determine home dir")
	}

	var skills []map[string]interface{}
	seen := make(map[string]bool)

	// Helper to scan a skills directory
	scanSkillsDir := func(baseDir, source string, skipHidden bool) {
		entries, err := os.ReadDir(baseDir)
		if err != nil {
			return
		}
		for _, e := range entries {
			if !e.IsDir() {
				continue
			}
			dirName := e.Name()

			// Handle .system directory specially
			if dirName == ".system" && !skipHidden {
				systemDir := filepath.Join(baseDir, ".system")
				sysEntries, _ := os.ReadDir(systemDir)
				for _, se := range sysEntries {
					if !se.IsDir() {
						continue
					}
					skillKey := se.Name()
					if seen[skillKey] {
						continue
					}
					skillMdPath := filepath.Join(systemDir, skillKey, "SKILL.md")
					name, description := parseSkillMd(skillMdPath)
					if name == "" {
						name = skillKey
					}
					skills = append(skills, map[string]interface{}{
						"name":        name,
						"skillKey":    skillKey,
						"description": description,
						"path":        skillMdPath,
						"source":      "system",
					})
					seen[skillKey] = true
				}
				continue
			}

			// Skip hidden directories (except .system which we already handled)
			if skipHidden && strings.HasPrefix(dirName, ".") {
				continue
			}

			skillKey := dirName
			if seen[skillKey] {
				continue
			}
			skillMdPath := filepath.Join(baseDir, skillKey, "SKILL.md")
			name, description := parseSkillMd(skillMdPath)
			if name == "" {
				name = skillKey
			}
			skills = append(skills, map[string]interface{}{
				"name":        name,
				"skillKey":    skillKey,
				"description": description,
				"path":        skillMdPath,
				"source":      source,
			})
			seen[skillKey] = true
		}
	}

	// 1. Scan global user skills from ~/.codex/skills/
	codexSkillsDir := filepath.Join(home, ".codex", "skills")
	scanSkillsDir(codexSkillsDir, "global", false)

	// 2. Scan project-specific skills from .agents/skills/ if projectPath given
	projectPath, _ := params["projectPath"].(string)
	if projectPath != "" {
		projectSkillsDir := filepath.Join(projectPath, ".agents", "skills")
		scanSkillsDir(projectSkillsDir, "project", true)
	}

	if skills == nil {
		skills = []map[string]interface{}{}
	}
	return okResult(map[string]interface{}{"skills": skills})
}

// Files/dirs to ignore when listing agent-config vs general docs
var ignoreFiles = map[string]bool{
	"memory.md": true, "agents.md": true, "soul.md": true,
	"tools.md": true, "heartbeat.md": true, "boostrap.md": true,
	"identity.md": true, "user.md": true,
}

var ignoreDirs = map[string]bool{
	"browser": true, "node_modules": true, "skills": true, "memory": true,
}

// ── helpers ─────────────────────────────────────────────────────────────────

// isOnlySessionHeader returns true if content is only a session header block.
var sessionHeaderRegex = regexp.MustCompile(`(?ms)^\s*#\s*Session:[\s\S]*?\*\*Source\*\*:\s*.+$`)

func isOnlySessionHeader(content string) bool {
	trimmed := strings.TrimSpace(content)
	if trimmed == "" {
		return true
	}
	without := strings.TrimSpace(sessionHeaderRegex.ReplaceAllString(trimmed, ""))
	return without == ""
}

var identityNameRegex = regexp.MustCompile(`(?im)\bName:\s*\**\s*:?\s*(.+?)\s*\**\s*$`)

func readIdentityName(parentDir string) string {
	for _, name := range []string{"identity.md", "IDENTITY.md"} {
		p := filepath.Join(parentDir, name)
		info, err := os.Stat(p)
		if err != nil || info.IsDir() {
			continue
		}
		data, err := os.ReadFile(p)
		if err != nil {
			continue
		}
		if m := identityNameRegex.FindSubmatch(data); m != nil {
			return strings.TrimSpace(string(m[1]))
		}
	}
	return ""
}

type memoryFile struct {
	Name      string `json:"name"`
	Path      string `json:"path"`
	UpdatedAt string `json:"updatedAt"`
	SizeBytes int64  `json:"sizeBytes"`
}

type memorySource struct {
	Tag      string       `json:"tag"`
	BasePath string       `json:"basePath"`
	Files    []memoryFile `json:"files"`
	RootDir  string       `json:"-"` // absolute root for resolving BasePath (internal)
}

func listMemorySources(openclawDir string) []memorySource {
	var sources []memorySource
	if _, err := os.Stat(openclawDir); err != nil {
		return sources
	}

	// Directories to skip when searching for memory folders
	skipDirs := map[string]bool{
		"node_modules": true, ".next": true, ".git": true, "browser": true,
		"skills": true, "sessions": true, ".cache": true, "dist": true,
		"build": true, "vendor": true, "__pycache__": true,
	}

	var collectMemoryFolders func(dir, relFromRoot string, depth int)
	collectMemoryFolders = func(dir, relFromRoot string, depth int) {
		if depth > 3 {
			return // Don't recurse too deep — workspaces are at most 2 levels from root
		}
		entries, err := os.ReadDir(dir)
		if err != nil {
			return
		}
		for _, entry := range entries {
			if !entry.IsDir() {
				continue
			}
			if skipDirs[entry.Name()] || strings.HasPrefix(entry.Name(), ".") {
				continue
			}
			fullPath := filepath.Join(dir, entry.Name())
			rel := entry.Name()
			if relFromRoot != "" {
				rel = relFromRoot + "/" + entry.Name()
			}

			if strings.EqualFold(entry.Name(), "memory") {
				parentDir := dir
				parentRel := relFromRoot
				if parentRel == "" {
					parentRel = "."
				}
				tag := readIdentityName(parentDir)
				if tag == "" {
					if parentRel == "." {
						tag = "Main"
					} else {
						tag = filepath.Base(parentDir)
					}
				}

				basePath := "memory"
				if relFromRoot != "" {
					basePath = relFromRoot + "/memory"
				}

				var files []memoryFile
				var walkMemory func(curDir string)
				walkMemory = func(curDir string) {
					list, err := os.ReadDir(curDir)
					if err != nil {
						return
					}
					for _, e := range list {
						fp := filepath.Join(curDir, e.Name())
						subRel, _ := filepath.Rel(fullPath, fp)
						subRel = filepath.ToSlash(subRel)
						fileRelPath := basePath
						if subRel != "" && subRel != "." {
							fileRelPath = basePath + "/" + subRel
						}

						if e.IsDir() {
							walkMemory(fp)
						} else if e.Type().IsRegular() {
							lower := strings.ToLower(e.Name())
							if !strings.HasSuffix(lower, ".md") && !strings.HasSuffix(lower, ".txt") {
								continue
							}
							info, err := e.Info()
							if err != nil {
								continue
							}
							raw, err := os.ReadFile(fp)
							if err != nil {
								continue
							}
							if isOnlySessionHeader(string(raw)) {
								continue
							}
							files = append(files, memoryFile{
								Name:      e.Name(),
								Path:      fileRelPath,
								UpdatedAt: info.ModTime().UTC().Format("2006-01-02T15:04:05.000Z"),
								SizeBytes: info.Size(),
							})
						}
					}
				}
				walkMemory(fullPath)

				// Sort newest first
				sort.Slice(files, func(i, j int) bool {
					return files[i].UpdatedAt > files[j].UpdatedAt
				})
				sources = append(sources, memorySource{Tag: tag, BasePath: basePath, Files: files, RootDir: openclawDir})
				continue
			}
			collectMemoryFolders(fullPath, rel, depth+1)
		}
	}

	collectMemoryFolders(openclawDir, "", 0)
	return sources
}

// ── list-openclaw-memory ────────────────────────────────────────────────────

func (b *BridgeHandler) listOpenClawMemory() actionResult {
	sources := listMemorySources(b.paths.OpenClaw)
	sources = append(sources, listMemorySources(b.paths.AgentsDir())...)
	return okResult(map[string]interface{}{"success": true, "data": sources})
}

// ── list-openclaw-docs ──────────────────────────────────────────────────────

type docFile struct {
	RelativePath string `json:"relativePath"`
	Name         string `json:"name"`
	UpdatedAt    string `json:"updatedAt"`
	SizeBytes    int64  `json:"sizeBytes"`
}

func listMarkdownFiles(openclawDir string, agentFilesOnly bool) []docFile {
	var result []docFile
	if _, err := os.Stat(openclawDir); err != nil {
		return result
	}

	var walk func(dir, baseDir string)
	walk = func(dir, baseDir string) {
		entries, err := os.ReadDir(dir)
		if err != nil {
			return
		}
		for _, entry := range entries {
			fullPath := filepath.Join(dir, entry.Name())
			relPath, _ := filepath.Rel(baseDir, fullPath)
			relPath = filepath.ToSlash(relPath)

			if entry.IsDir() {
				if ignoreDirs[entry.Name()] {
					continue
				}
				walk(fullPath, baseDir)
			} else if entry.Type().IsRegular() && strings.HasSuffix(strings.ToLower(entry.Name()), ".md") {
				isAgentFile := ignoreFiles[strings.ToLower(entry.Name())]
				if agentFilesOnly && !isAgentFile {
					continue
				}
				if !agentFilesOnly && isAgentFile {
					continue
				}
				info, err := entry.Info()
				if err != nil {
					continue
				}
				result = append(result, docFile{
					RelativePath: relPath,
					Name:         entry.Name(),
					UpdatedAt:    info.ModTime().UTC().Format("2006-01-02T15:04:05.000Z"),
					SizeBytes:    info.Size(),
				})
			}
		}
	}

	walk(openclawDir, openclawDir)
	sort.Slice(result, func(i, j int) bool {
		return result[i].RelativePath < result[j].RelativePath
	})
	return result
}

func getWorkspaceLabels(openclawDir string) map[string]string {
	labels := make(map[string]string)
	if _, err := os.Stat(openclawDir); err != nil {
		return labels
	}
	entries, err := os.ReadDir(openclawDir)
	if err != nil {
		return labels
	}
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		name := readIdentityName(filepath.Join(openclawDir, entry.Name()))
		if name != "" {
			labels[entry.Name()] = name
		}
	}
	return labels
}

func (b *BridgeHandler) listOpenClawDocs() actionResult {
	files := listMarkdownFiles(b.paths.OpenClaw, false)
	workspaceLabels := getWorkspaceLabels(b.paths.OpenClaw)
	return okResult(map[string]interface{}{
		"success": true,
		"data": map[string]interface{}{
			"files":           files,
			"workspaceLabels": workspaceLabels,
		},
	})
}

// ── list-openclaw-agent-files ───────────────────────────────────────────────

func (b *BridgeHandler) listOpenClawAgentFiles() actionResult {
	files := listMarkdownFiles(b.paths.OpenClaw, true)
	workspaceLabels := getWorkspaceLabels(b.paths.OpenClaw)
	return okResult(map[string]interface{}{
		"success": true,
		"data": map[string]interface{}{
			"files":           files,
			"workspaceLabels": workspaceLabels,
		},
	})
}

// ── get-openclaw-doc ────────────────────────────────────────────────────────

func (b *BridgeHandler) getOpenClawDoc(params map[string]interface{}) actionResult {
	relPath, _ := params["relativePath"].(string)
	resolved, err := ValidateRelativePath(b.paths.OpenClaw, relPath)
	if err != nil {
		return okResult(map[string]interface{}{"success": false, "error": err.Error()})
	}
	info, err := os.Stat(resolved)
	if err != nil || info.IsDir() {
		return okResult(map[string]interface{}{"success": false, "error": "File not found"})
	}
	content, err := os.ReadFile(resolved)
	if err != nil {
		return okResult(map[string]interface{}{"success": false, "error": err.Error()})
	}
	return okResult(map[string]interface{}{"success": true, "content": string(content)})
}

// ── get-agent-identity-doc ──────────────────────────────────────────────────
//
// Runtime-aware reader for an agent's IDENTITY.md. The OpenClaw doc reader is
// locked to ~/.openclaw/, which means hermes (and other runtime) agents whose
// IDENTITY.md lives under ~/.hermes/ are invisible to the dashboard. This
// action routes to the correct on-disk location based on runtime.
//
// Params: runtime (string), agentId (string), fileName (string, defaults to "IDENTITY.md")
func (b *BridgeHandler) getAgentIdentityDoc(params map[string]interface{}) actionResult {
	runtime, _ := params["runtime"].(string)
	agentId, _ := params["agentId"].(string)
	fileName, _ := params["fileName"].(string)
	if fileName == "" {
		fileName = "IDENTITY.md"
	}

	dir, err := resolveRuntimeAgentDir(b.paths, runtime, agentId)
	if err != nil {
		return okResult(map[string]interface{}{"success": false, "error": err.Error()})
	}
	// Guard against path traversal in fileName.
	resolved, err := ValidateRelativePath(dir, fileName)
	if err != nil {
		return okResult(map[string]interface{}{"success": false, "error": err.Error()})
	}
	info, err := os.Stat(resolved)
	if err != nil || info.IsDir() {
		return okResult(map[string]interface{}{"success": false, "error": "File not found"})
	}
	content, err := os.ReadFile(resolved)
	if err != nil {
		return okResult(map[string]interface{}{"success": false, "error": err.Error()})
	}
	return okResult(map[string]interface{}{"success": true, "content": string(content)})
}

// ── write-agent-identity-doc ────────────────────────────────────────────────
//
// Runtime-aware writer for an agent's IDENTITY.md (or sibling personality file).
//
// Params: runtime (string), agentId (string), fileName (string, defaults to "IDENTITY.md"), content (string)
func (b *BridgeHandler) writeAgentIdentityDoc(params map[string]interface{}) actionResult {
	runtime, _ := params["runtime"].(string)
	agentId, _ := params["agentId"].(string)
	fileName, _ := params["fileName"].(string)
	content, _ := params["content"].(string)
	if fileName == "" {
		fileName = "IDENTITY.md"
	}

	dir, err := resolveRuntimeAgentDir(b.paths, runtime, agentId)
	if err != nil {
		return okResult(map[string]interface{}{"success": false, "error": err.Error()})
	}
	if err := os.MkdirAll(dir, 0700); err != nil {
		return okResult(map[string]interface{}{"success": false, "error": err.Error()})
	}
	resolved, err := ValidateRelativePath(dir, fileName)
	if err != nil {
		return okResult(map[string]interface{}{"success": false, "error": err.Error()})
	}
	if err := os.WriteFile(resolved, []byte(content), 0600); err != nil {
		return okResult(map[string]interface{}{"success": false, "error": err.Error()})
	}
	return okResult(map[string]interface{}{"success": true})
}

// resolveRuntimeAgentDir returns the on-disk directory for an agent's personality
// files based on runtime. v0.5.6+: all runtimes except Hermes live under
// ~/.hyperclaw/agents/{runtime}-{id}/.
func resolveRuntimeAgentDir(paths Paths, runtime, agentId string) (string, error) {
	runtime = strings.TrimSpace(runtime)
	switch runtime {
	case "hermes":
		id := strings.TrimSpace(agentId)
		if strings.HasPrefix(id, "hermes:") {
			id = id[len("hermes:"):]
		}
		if id == "" || id == "main" || id == "__main__" {
			return filepath.Join(paths.Home, ".hermes"), nil
		}
		if err := ValidateAgentID(id); err != nil {
			return "", err
		}
		return filepath.Join(paths.Home, ".hermes", "profiles", id), nil
	default:
		// Empty runtime defaults to "openclaw" for back-compat with the
		// historical default behavior of this helper.
		if runtime == "" {
			runtime = "openclaw"
		}
		return paths.SafeAgentDir(runtime, agentId)
	}
}

// ── write-openclaw-doc ──────────────────────────────────────────────────────

func (b *BridgeHandler) writeOpenClawDoc(params map[string]interface{}) actionResult {
	relPath, _ := params["relativePath"].(string)
	content, _ := params["content"].(string)
	resolved, err := ValidateRelativePath(b.paths.OpenClaw, relPath)
	if err != nil {
		return okResult(map[string]interface{}{"success": false, "error": err.Error()})
	}
	dir := filepath.Dir(resolved)
	if err := EnsureDir(dir); err != nil {
		return okResult(map[string]interface{}{"success": false, "error": err.Error()})
	}
	if err := os.WriteFile(resolved, []byte(content), 0644); err != nil {
		return okResult(map[string]interface{}{"success": false, "error": err.Error()})
	}
	return okResult(map[string]interface{}{"success": true})
}

// ── read-openclaw-binary ────────────────────────────────────────────────────

func (b *BridgeHandler) readOpenClawBinary(params map[string]interface{}) actionResult {
	relPath, _ := params["relativePath"].(string)
	resolved, err := ValidateRelativePath(b.paths.OpenClaw, relPath)
	if err != nil {
		return okResult(map[string]interface{}{"success": false, "error": err.Error()})
	}
	info, err := os.Stat(resolved)
	if err != nil || info.IsDir() {
		return okResult(map[string]interface{}{"success": false, "error": "File not found"})
	}
	data, err := os.ReadFile(resolved)
	if err != nil {
		return okResult(map[string]interface{}{"success": false, "error": err.Error()})
	}
	encoded := base64.StdEncoding.EncodeToString(data)
	// Guess MIME from extension
	ext := strings.ToLower(filepath.Ext(resolved))
	mime := "application/octet-stream"
	switch ext {
	case ".png":
		mime = "image/png"
	case ".jpg", ".jpeg":
		mime = "image/jpeg"
	case ".gif":
		mime = "image/gif"
	case ".webp":
		mime = "image/webp"
	case ".svg":
		mime = "image/svg+xml"
	}
	return okResult(map[string]interface{}{
		"success":  true,
		"data":     encoded,
		"mimeType": mime,
	})
}

// ── write-openclaw-binary ───────────────────────────────────────────────────

func (b *BridgeHandler) writeOpenClawBinary(params map[string]interface{}) actionResult {
	relPath, _ := params["relativePath"].(string)
	dataB64, _ := params["data"].(string)
	if relPath == "" || dataB64 == "" {
		return okResult(map[string]interface{}{"success": false, "error": "relativePath and data are required"})
	}
	resolved, err := ValidateRelativePath(b.paths.OpenClaw, relPath)
	if err != nil {
		return okResult(map[string]interface{}{"success": false, "error": err.Error()})
	}
	decoded, err := base64Decode(dataB64)
	if err != nil {
		return okResult(map[string]interface{}{"success": false, "error": "invalid base64: " + err.Error()})
	}
	dir := filepath.Dir(resolved)
	if err := EnsureDir(dir); err != nil {
		return okResult(map[string]interface{}{"success": false, "error": err.Error()})
	}
	if err := os.WriteFile(resolved, decoded, 0644); err != nil {
		return okResult(map[string]interface{}{"success": false, "error": err.Error()})
	}
	return okResult(map[string]interface{}{"success": true})
}

// ── delete-openclaw-doc ─────────────────────────────────────────────────────

func (b *BridgeHandler) deleteOpenClawDoc(params map[string]interface{}) actionResult {
	relPath, _ := params["relativePath"].(string)
	resolved, err := ValidateRelativePath(b.paths.OpenClaw, relPath)
	if err != nil {
		return okResult(map[string]interface{}{"success": false, "error": err.Error()})
	}
	absOC, _ := filepath.Abs(b.paths.OpenClaw)
	absResolved, _ := filepath.Abs(resolved)
	if absResolved == absOC {
		return okResult(map[string]interface{}{"success": false, "error": "Cannot delete workspace root"})
	}
	if _, err := os.Stat(resolved); err != nil {
		return okResult(map[string]interface{}{"success": false, "error": "Not found"})
	}
	if err := os.RemoveAll(resolved); err != nil {
		return okResult(map[string]interface{}{"success": false, "error": err.Error()})
	}
	return okResult(map[string]interface{}{"success": true})
}

// ── create-openclaw-folder ──────────────────────────────────────────────────

func (b *BridgeHandler) createOpenClawFolder(params map[string]interface{}) actionResult {
	relPath, _ := params["relativePath"].(string)
	resolved, err := ValidateRelativePath(b.paths.OpenClaw, relPath)
	if err != nil {
		return okResult(map[string]interface{}{"success": false, "error": err.Error()})
	}
	if _, err := os.Stat(resolved); err == nil {
		return okResult(map[string]interface{}{"success": false, "error": "Folder already exists"})
	}
	if err := os.MkdirAll(resolved, 0755); err != nil {
		return okResult(map[string]interface{}{"success": false, "error": err.Error()})
	}
	return okResult(map[string]interface{}{"success": true})
}

// ── search-openclaw-memory-content ──────────────────────────────────────────

func (b *BridgeHandler) searchOpenClawMemoryContent(params map[string]interface{}) actionResult {
	query, _ := params["query"].(string)
	query = strings.TrimSpace(query)
	if query == "" {
		return okResult(map[string]interface{}{"success": true, "paths": []string{}})
	}
	qLower := strings.ToLower(query)

	sources := listMemorySources(b.paths.OpenClaw)
	sources = append(sources, listMemorySources(b.paths.AgentsDir())...)
	var matchingPaths []string
	for _, source := range sources {
		root := source.RootDir
		if root == "" {
			root = b.paths.OpenClaw
		}
		for _, file := range source.Files {
			fullPath := filepath.Join(root, file.Path)
			info, err := os.Stat(fullPath)
			if err != nil || info.IsDir() {
				continue
			}
			content, err := os.ReadFile(fullPath)
			if err != nil {
				continue
			}
			if strings.Contains(strings.ToLower(string(content)), qLower) {
				matchingPaths = append(matchingPaths, file.Path)
			}
		}
	}
	if matchingPaths == nil {
		matchingPaths = []string{}
	}
	return okResult(map[string]interface{}{"success": true, "paths": matchingPaths})
}

// ── get-openclaw-usage ──────────────────────────────────────────────────────

func (b *BridgeHandler) getOpenClawUsage() actionResult {
	type tokenCounts struct {
		InputTokens  int64 `json:"inputTokens"`
		OutputTokens int64 `json:"outputTokens"`
		TotalTokens  int64 `json:"totalTokens"`
	}

	byDayMap := make(map[string]*tokenCounts)
	byAgentMap := make(map[string]*tokenCounts)
	var totalInput, totalOutput, totalTotal int64

	var sessionFiles []sessionFile

	collectSessions := func(root string) {
		walkAndCollect(root, "", &sessionFiles)
	}

	if _, err := os.Stat(b.paths.OpenClaw); err == nil {
		collectSessions(b.paths.OpenClaw)
	}
	if _, err := os.Stat(b.paths.OpenClawAlt); err == nil {
		before := len(sessionFiles)
		collectSessions(b.paths.OpenClawAlt)
		// Deduplicate by path
		seen := make(map[string]bool)
		for i := 0; i < before; i++ {
			seen[sessionFiles[i].Path] = true
		}
		deduped := sessionFiles[:before]
		for i := before; i < len(sessionFiles); i++ {
			if !seen[sessionFiles[i].Path] {
				deduped = append(deduped, sessionFiles[i])
			}
		}
		sessionFiles = deduped
	}

	if len(sessionFiles) == 0 {
		return okResult(map[string]interface{}{
			"success": true,
			"data": map[string]interface{}{
				"byDay":   []interface{}{},
				"totals":  tokenCounts{},
				"byAgent": []interface{}{},
				"hint":    "No session files found at " + b.paths.OpenClaw + " or " + b.paths.OpenClawAlt,
			},
		})
	}

	for _, sf := range sessionFiles {
		info, err := os.Stat(sf.Path)
		if err != nil {
			continue
		}
		fileDateKey := info.ModTime().UTC().Format("2006-01-02")

		data, err := os.ReadFile(sf.Path)
		if err != nil {
			continue
		}
		var raw interface{}
		if err := json.Unmarshal(data, &raw); err != nil {
			continue
		}

		records := extractTokenRecords(raw)
		agentTotals := tokenCounts{}

		for _, r := range records {
			input, output, total := getTokenCountsFromRecord(r)
			dateKey := getDateKey(r)
			if dateKey == "" {
				dateKey = fileDateKey
			}

			agentTotals.InputTokens += input
			agentTotals.OutputTokens += output
			agentTotals.TotalTokens += total
			totalInput += input
			totalOutput += output
			totalTotal += total

			if dateKey != "" {
				if byDayMap[dateKey] == nil {
					byDayMap[dateKey] = &tokenCounts{}
				}
				byDayMap[dateKey].InputTokens += input
				byDayMap[dateKey].OutputTokens += output
				byDayMap[dateKey].TotalTokens += total
			}
		}

		if agentTotals.InputTokens > 0 || agentTotals.OutputTokens > 0 || agentTotals.TotalTokens > 0 {
			if byAgentMap[sf.AgentID] == nil {
				byAgentMap[sf.AgentID] = &tokenCounts{}
			}
			byAgentMap[sf.AgentID].InputTokens += agentTotals.InputTokens
			byAgentMap[sf.AgentID].OutputTokens += agentTotals.OutputTokens
			byAgentMap[sf.AgentID].TotalTokens += agentTotals.TotalTokens
		}
	}

	// Build sorted byDay
	type dayEntry struct {
		Date string `json:"date"`
		tokenCounts
	}
	var byDay []dayEntry
	for date, tc := range byDayMap {
		byDay = append(byDay, dayEntry{Date: date, tokenCounts: *tc})
	}
	sort.Slice(byDay, func(i, j int) bool { return byDay[i].Date < byDay[j].Date })

	// Build byAgent
	type agentEntry struct {
		AgentID string `json:"agentId"`
		tokenCounts
	}
	var byAgent []agentEntry
	for id, tc := range byAgentMap {
		byAgent = append(byAgent, agentEntry{AgentID: id, tokenCounts: *tc})
	}

	result := map[string]interface{}{
		"byDay":   byDay,
		"totals":  tokenCounts{InputTokens: totalInput, OutputTokens: totalOutput, TotalTokens: totalTotal},
		"byAgent": byAgent,
	}

	if totalTotal == 0 && len(sessionFiles) > 0 {
		result["hint"] = "Session files were found but contained no token records."
	}

	return okResult(map[string]interface{}{"success": true, "data": result})
}

// ── Usage helpers ───────────────────────────────────────────────────────────

type sessionFile struct {
	Path    string
	AgentID string
}

func walkAndCollect(root, relativePath string, out *[]sessionFile) {
	info, err := os.Stat(root)
	if err != nil || !info.IsDir() {
		return
	}

	// Check for sessions dir at this level
	sessionsDir := filepath.Join(root, "sessions")
	if si, err := os.Stat(sessionsDir); err == nil && si.IsDir() {
		agentID := relativePath
		if agentID == "" {
			agentID = filepath.Base(root)
		}
		if agentID == "" {
			agentID = "agent"
		}
		addSessionFiles(sessionsDir, agentID, out)
	}

	// Also check root-level global sessions
	if relativePath == "" {
		globalSessions := filepath.Join(root, "sessions")
		if si, err := os.Stat(globalSessions); err == nil && si.IsDir() {
			addSessionFiles(globalSessions, "_global", out)
		}
	}

	entries, err := os.ReadDir(root)
	if err != nil {
		return
	}
	for _, e := range entries {
		if !e.IsDir() || e.Name() == "sessions" {
			continue
		}
		childPath := filepath.Join(root, e.Name())
		nextRel := e.Name()
		if relativePath != "" {
			nextRel = relativePath + "/" + e.Name()
		}
		walkAndCollect(childPath, nextRel, out)
	}
}

func addSessionFiles(sessionsDir, agentID string, out *[]sessionFile) {
	entries, err := os.ReadDir(sessionsDir)
	if err != nil {
		return
	}
	for _, e := range entries {
		if !e.Type().IsRegular() || !strings.HasSuffix(strings.ToLower(e.Name()), ".json") {
			continue
		}
		*out = append(*out, sessionFile{
			Path:    filepath.Join(sessionsDir, e.Name()),
			AgentID: agentID,
		})
	}
}

func toNum(v interface{}) int64 {
	switch n := v.(type) {
	case float64:
		if n < 0 {
			return 0
		}
		return int64(n)
	case int64:
		if n < 0 {
			return 0
		}
		return n
	case string:
		var f float64
		if _, err := json.Number(n).Float64(); err == nil {
			f, _ = json.Number(n).Float64()
		}
		if f < 0 {
			return 0
		}
		return int64(f)
	default:
		return 0
	}
}

func hasTokenFields(obj map[string]interface{}) bool {
	for _, key := range []string{"inputTokens", "outputTokens", "totalTokens", "input_tokens", "output_tokens", "total_tokens"} {
		if _, ok := obj[key]; ok {
			return true
		}
	}
	if _, ok := obj["usage"]; ok {
		return true
	}
	return false
}

func getTokenCountsFromRecord(r map[string]interface{}) (input, output, total int64) {
	// Check nested usage first
	u := r
	if usage, ok := r["usage"].(map[string]interface{}); ok {
		u = usage
	}

	input = toNum(firstOf(u, "inputTokens", "input_tokens"))
	if input == 0 {
		input = toNum(firstOf(r, "inputTokens", "input_tokens"))
	}
	output = toNum(firstOf(u, "outputTokens", "output_tokens"))
	if output == 0 {
		output = toNum(firstOf(r, "outputTokens", "output_tokens"))
	}
	total = toNum(firstOf(u, "totalTokens", "total_tokens"))
	if total == 0 {
		total = toNum(firstOf(r, "totalTokens", "total_tokens"))
	}
	if total == 0 {
		total = input + output
	}
	return
}

func firstOf(m map[string]interface{}, keys ...string) interface{} {
	for _, k := range keys {
		if v, ok := m[k]; ok {
			return v
		}
	}
	return nil
}

func getDateKey(r map[string]interface{}) string {
	for _, key := range []string{"updatedAt", "createdAt", "date", "timestamp"} {
		v, ok := r[key]
		if !ok {
			continue
		}
		switch val := v.(type) {
		case string:
			if len(val) >= 10 {
				return val[:10]
			}
		case float64:
			if val > 0 {
				ts := int64(val)
				if val > 1e12 {
					ts = ts / 1000
				}
				t := time.Unix(ts, 0).UTC()
				return t.Format("2006-01-02")
			}
		}
	}
	return ""
}

func extractTokenRecords(data interface{}) []map[string]interface{} {
	switch v := data.(type) {
	case []interface{}:
		return flattenToTokenRecords(v)
	case map[string]interface{}:
		if arr, ok := v["sessions"].([]interface{}); ok {
			return flattenToTokenRecords(arr)
		}
		if arr, ok := v["data"].([]interface{}); ok {
			return flattenToTokenRecords(arr)
		}
		if hasTokenFields(v) {
			return []map[string]interface{}{v}
		}
		// OpenClaw format: root object keyed by session id
		var out []map[string]interface{}
		for _, val := range v {
			if m, ok := val.(map[string]interface{}); ok {
				if hasTokenFields(m) {
					out = append(out, m)
				} else {
					out = append(out, extractTokenRecords(m)...)
				}
			}
		}
		return out
	}
	return nil
}

func flattenToTokenRecords(arr []interface{}) []map[string]interface{} {
	var out []map[string]interface{}
	for _, x := range arr {
		m, ok := x.(map[string]interface{})
		if !ok {
			continue
		}
		if hasTokenFields(m) {
			out = append(out, m)
		} else {
			out = append(out, extractTokenRecords(m)...)
		}
	}
	return out
}

// skillsShSearch searches the skills.sh public marketplace.
// Params: { query: string }
// Returns: { skills: [{ name, skillId, id, installs, source }] }
func (b *BridgeHandler) skillsShSearch(params map[string]interface{}) actionResult {
	query, _ := params["query"].(string)
	apiURL := fmt.Sprintf("https://skills.sh/api/search?q=%s&limit=30", url.QueryEscape(query))

	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Get(apiURL)
	if err != nil {
		return errResult("skills.sh request failed: " + err.Error())
	}
	defer resp.Body.Close()

	var result map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return errResult("failed to parse skills.sh response: " + err.Error())
	}
	return okResult(result)
}

// skillsShInstall downloads a skill from its source GitHub repo and installs it
// into the target runtime's skills directory.
// Params: { source: "github/owner/repo", slug: "skill-name", runtime: "openclaw|claude-code|codex|hermes" }
func (b *BridgeHandler) skillsShInstall(params map[string]interface{}) actionResult {
	source, _ := params["source"].(string)
	slug, _ := params["slug"].(string)
	runtime, _ := params["runtime"].(string)

	if source == "" || slug == "" || runtime == "" {
		return errResult("source, slug, and runtime are required")
	}

	paths := ResolvePaths()
	var targetBase string
	switch runtime {
	case "openclaw":
		targetBase = filepath.Join(paths.OpenClaw, "skills")
	case "claude-code":
		targetBase = filepath.Join(paths.Home, ".claude", "skills")
	case "codex":
		targetBase = filepath.Join(paths.Home, ".codex", "skills")
	case "hermes":
		targetBase = filepath.Join(paths.Hermes, "skills")
	default:
		return errResult("unsupported runtime: " + runtime)
	}

	targetDir := filepath.Join(targetBase, slug)
	skillMdPath := filepath.Join(targetDir, "SKILL.md")

	if _, err := os.Stat(skillMdPath); err == nil {
		return okResult(map[string]interface{}{"installed": true, "path": skillMdPath, "alreadyExisted": true})
	}

	// source is like "github/owner/repo" — strip "github/" prefix
	parts := strings.SplitN(strings.TrimPrefix(source, "github/"), "/", 2)
	if len(parts) < 2 {
		return errResult("cannot parse GitHub source: " + source)
	}
	owner, repo := parts[0], parts[1]

	// Fetch SKILL.md: first try skill as subdirectory, then as repo root
	client := &http.Client{Timeout: 15 * time.Second}
	rawURL := fmt.Sprintf("https://raw.githubusercontent.com/%s/%s/HEAD/%s/SKILL.md", owner, repo, slug)
	resp, err := client.Get(rawURL)
	if err != nil || resp.StatusCode != http.StatusOK {
		if resp != nil {
			resp.Body.Close()
		}
		rawURL = fmt.Sprintf("https://raw.githubusercontent.com/%s/%s/HEAD/SKILL.md", owner, repo)
		resp, err = client.Get(rawURL)
		if err != nil {
			return errResult("failed to fetch SKILL.md: " + err.Error())
		}
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return errResult(fmt.Sprintf("SKILL.md not found (HTTP %d): %s", resp.StatusCode, rawURL))
	}

	content, err := io.ReadAll(resp.Body)
	if err != nil {
		return errResult("failed to read SKILL.md: " + err.Error())
	}

	if err := os.MkdirAll(targetDir, 0755); err != nil {
		return errResult("failed to create skill directory: " + err.Error())
	}
	if err := os.WriteFile(skillMdPath, content, 0644); err != nil {
		return errResult("failed to write SKILL.md: " + err.Error())
	}

	return okResult(map[string]interface{}{"installed": true, "path": skillMdPath, "alreadyExisted": false})
}
