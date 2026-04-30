package bridge

import (
	"encoding/base64"
	"mime"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"time"
)

// maxKnowledgeBinarySize caps the size of files returned via knowledge-get-binary
// to protect the WebSocket relay from oversized payloads. Base64 expansion
// further inflates the on-wire size by ~33%.
const maxKnowledgeBinarySize int64 = 25 * 1024 * 1024 // 25 MiB

var knowledgeSlugRe = regexp.MustCompile(`[^a-z0-9\-]`)

// slugifyKnowledgeID converts a name to a safe filesystem slug.
func slugifyKnowledgeID(s string) string {
	lower := strings.ToLower(strings.TrimSpace(s))
	slug := knowledgeSlugRe.ReplaceAllString(lower, "-")
	for strings.Contains(slug, "--") {
		slug = strings.ReplaceAll(slug, "--", "-")
	}
	return strings.Trim(slug, "-")
}

// knowledgeBase returns ~/.hyperclaw/knowledge/{companySlug}/
func (b *BridgeHandler) knowledgeBase(companyId string) string {
	slug := slugifyKnowledgeID(companyId)
	if slug == "" {
		slug = "default"
	}
	return filepath.Join(b.paths.HyperClaw, "knowledge", slug)
}

// listKnowledgeFiles scans colDir for .md files and returns them sorted newest-first.
func listKnowledgeFiles(colDir, colID string) []map[string]interface{} {
	entries, err := os.ReadDir(colDir)
	if err != nil {
		return []map[string]interface{}{}
	}
	var files []map[string]interface{}
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(strings.ToLower(e.Name()), ".md") {
			continue
		}
		info, err := e.Info()
		if err != nil {
			continue
		}
		ext := filepath.Ext(e.Name())
		name := strings.TrimSuffix(e.Name(), ext)
		files = append(files, map[string]interface{}{
			"relativePath": colID + "/" + e.Name(),
			"name":         name,
			"collection":   colID,
			"updatedAt":    info.ModTime().UTC().Format(time.RFC3339),
			"sizeBytes":    info.Size(),
			"fileType":     "markdown",
			"mimeType":     "text/markdown; charset=utf-8",
		})
	}
	sort.Slice(files, func(i, j int) bool {
		return files[i]["updatedAt"].(string) > files[j]["updatedAt"].(string)
	})
	return files
}

// knowledge-list returns all collections for a company.
func (b *BridgeHandler) knowledgeList(params map[string]interface{}) actionResult {
	companyId, _ := params["companyId"].(string)
	base := b.knowledgeBase(companyId)

	if _, err := os.Stat(base); os.IsNotExist(err) {
		return okResult(map[string]interface{}{"success": true, "collections": []interface{}{}})
	}

	entries, err := os.ReadDir(base)
	if err != nil {
		return okResult(map[string]interface{}{"success": false, "error": err.Error()})
	}

	var collections []map[string]interface{}
	for _, e := range entries {
		if !e.IsDir() || strings.HasPrefix(e.Name(), ".") {
			continue
		}
		colID := e.Name()
		files := listKnowledgeFiles(filepath.Join(base, colID), colID)

		lastMod := ""
		if len(files) > 0 {
			lastMod, _ = files[0]["updatedAt"].(string)
		} else {
			info, err := e.Info()
			if err == nil {
				lastMod = info.ModTime().UTC().Format(time.RFC3339)
			}
		}

		collections = append(collections, map[string]interface{}{
			"id":           colID,
			"name":         colID,
			"fileCount":    len(files),
			"lastModified": lastMod,
			"files":        files,
		})
	}
	if collections == nil {
		collections = []map[string]interface{}{}
	}
	return okResult(map[string]interface{}{"success": true, "collections": collections})
}

// knowledge-get-doc reads a document by relative path (e.g. "brand/voice.md").
func (b *BridgeHandler) knowledgeGetDoc(params map[string]interface{}) actionResult {
	companyId, _ := params["companyId"].(string)
	relPath, _ := params["relativePath"].(string)
	base := b.knowledgeBase(companyId)

	resolved, err := ValidateRelativePath(base, relPath)
	if err != nil {
		return okResult(map[string]interface{}{"success": false, "error": err.Error()})
	}
	info, err := os.Stat(resolved)
	if err != nil || info.IsDir() {
		return okResult(map[string]interface{}{"success": false, "error": "Document not found"})
	}
	content, err := os.ReadFile(resolved)
	if err != nil {
		return okResult(map[string]interface{}{"success": false, "error": err.Error()})
	}
	return okResult(map[string]interface{}{"success": true, "content": string(content)})
}

// knowledge-get-binary reads a file by relative path and returns it as base64
// with a best-effort mime type. Used by the dashboard for previewing images,
// audio, video, and PDFs stored in the knowledge base.
func (b *BridgeHandler) knowledgeGetBinary(params map[string]interface{}) actionResult {
	companyId, _ := params["companyId"].(string)
	relPath, _ := params["relativePath"].(string)
	base := b.knowledgeBase(companyId)

	resolved, err := ValidateRelativePath(base, relPath)
	if err != nil {
		return okResult(map[string]interface{}{"success": false, "error": err.Error()})
	}
	info, err := os.Stat(resolved)
	if err != nil || info.IsDir() {
		return okResult(map[string]interface{}{"success": false, "error": "File not found"})
	}
	if info.Size() > maxKnowledgeBinarySize {
		return okResult(map[string]interface{}{"success": false, "error": "File too large to preview"})
	}
	content, err := os.ReadFile(resolved)
	if err != nil {
		return okResult(map[string]interface{}{"success": false, "error": err.Error()})
	}

	ext := strings.ToLower(filepath.Ext(resolved))
	mimeType := mime.TypeByExtension(ext)
	if ext == ".md" {
		mimeType = "text/markdown; charset=utf-8"
	}
	if mimeType == "" {
		mimeType = http.DetectContentType(content)
	}

	return okResult(map[string]interface{}{
		"success":  true,
		"content":  base64.StdEncoding.EncodeToString(content),
		"mimeType": mimeType,
	})
}

// knowledge-write-doc creates or overwrites a document.
func (b *BridgeHandler) knowledgeWriteDoc(params map[string]interface{}) actionResult {
	companyId, _ := params["companyId"].(string)
	relPath, _ := params["relativePath"].(string)
	content, _ := params["content"].(string)
	base := b.knowledgeBase(companyId)

	if err := EnsureDir(base); err != nil {
		return okResult(map[string]interface{}{"success": false, "error": err.Error()})
	}
	resolved, err := ValidateRelativePath(base, relPath)
	if err != nil {
		return okResult(map[string]interface{}{"success": false, "error": err.Error()})
	}
	if err := EnsureDir(filepath.Dir(resolved)); err != nil {
		return okResult(map[string]interface{}{"success": false, "error": err.Error()})
	}
	if err := os.WriteFile(resolved, []byte(content), 0644); err != nil {
		return okResult(map[string]interface{}{"success": false, "error": err.Error()})
	}
	return okResult(map[string]interface{}{"success": true})
}

// knowledge-delete-doc removes a single document.
func (b *BridgeHandler) knowledgeDeleteDoc(params map[string]interface{}) actionResult {
	companyId, _ := params["companyId"].(string)
	relPath, _ := params["relativePath"].(string)
	base := b.knowledgeBase(companyId)

	resolved, err := ValidateRelativePath(base, relPath)
	if err != nil {
		return okResult(map[string]interface{}{"success": false, "error": err.Error()})
	}
	info, err := os.Stat(resolved)
	if err != nil || info.IsDir() {
		return okResult(map[string]interface{}{"success": false, "error": "Document not found"})
	}
	if err := os.Remove(resolved); err != nil {
		return okResult(map[string]interface{}{"success": false, "error": err.Error()})
	}
	return okResult(map[string]interface{}{"success": true})
}

// knowledge-create-collection creates a new collection directory.
func (b *BridgeHandler) knowledgeCreateCollection(params map[string]interface{}) actionResult {
	companyId, _ := params["companyId"].(string)
	name, _ := params["name"].(string)
	if name == "" {
		return okResult(map[string]interface{}{"success": false, "error": "collection name is required"})
	}
	colID := slugifyKnowledgeID(name)
	if colID == "" {
		return okResult(map[string]interface{}{"success": false, "error": "invalid collection name"})
	}
	base := b.knowledgeBase(companyId)
	colDir := filepath.Join(base, colID)
	if _, err := os.Stat(colDir); err == nil {
		return okResult(map[string]interface{}{"success": false, "error": "Collection already exists"})
	}
	if err := os.MkdirAll(colDir, 0755); err != nil {
		return okResult(map[string]interface{}{"success": false, "error": err.Error()})
	}
	return okResult(map[string]interface{}{"success": true, "id": colID})
}

// knowledge-delete-collection removes a collection and all its documents.
func (b *BridgeHandler) knowledgeDeleteCollection(params map[string]interface{}) actionResult {
	companyId, _ := params["companyId"].(string)
	id, _ := params["id"].(string)
	if id == "" || strings.ContainsAny(id, "/\\..") {
		return okResult(map[string]interface{}{"success": false, "error": "invalid collection id"})
	}
	base := b.knowledgeBase(companyId)
	colDir := filepath.Join(base, id)

	// Confirm colDir is strictly inside base (prevent traversal)
	absBase, _ := filepath.Abs(base)
	absCol, _ := filepath.Abs(colDir)
	if absCol == absBase || !strings.HasPrefix(absCol, absBase+string(filepath.Separator)) {
		return okResult(map[string]interface{}{"success": false, "error": "invalid collection path"})
	}
	if _, err := os.Stat(colDir); os.IsNotExist(err) {
		return okResult(map[string]interface{}{"success": false, "error": "Collection not found"})
	}
	if err := os.RemoveAll(colDir); err != nil {
		return okResult(map[string]interface{}{"success": false, "error": err.Error()})
	}
	return okResult(map[string]interface{}{"success": true})
}
