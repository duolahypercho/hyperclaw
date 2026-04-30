package bridge

import (
	"encoding/base64"
	"fmt"
	"log"
	"mime"
	"net/http"
	"os"
	"path/filepath"
	"strings"
)

const maxMediaBytes = 10 * 1024 * 1024 // 10 MB

// MediaAttachment is the wire format for a file inlined into a message.
type MediaAttachment struct {
	Filename string `json:"filename"`
	MimeType string `json:"mimeType"`
	Data     string `json:"data"` // base64, no data: prefix
	Size     int64  `json:"size"`
}

// readFileAsAttachment reads a local file and returns it base64-encoded.
// Returns an error if the file is missing or exceeds 10 MB.
func readFileAsAttachment(path string) (*MediaAttachment, error) {
	// Expand leading ~/
	if strings.HasPrefix(path, "~/") {
		home, _ := os.UserHomeDir()
		path = filepath.Join(home, path[2:])
	}

	info, err := os.Stat(path)
	if err != nil {
		return nil, fmt.Errorf("file not found: %s", path)
	}
	if info.Size() > maxMediaBytes {
		return nil, fmt.Errorf("file too large (%d bytes, max 10 MB)", info.Size())
	}

	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("cannot read %s: %v", path, err)
	}

	return &MediaAttachment{
		Filename: filepath.Base(path),
		MimeType: detectMimeType(path, raw),
		Data:     base64.StdEncoding.EncodeToString(raw),
		Size:     info.Size(),
	}, nil
}

// detectMimeType returns the MIME type for a file, using extension first then sniffing.
func detectMimeType(path string, data []byte) string {
	ext := strings.ToLower(filepath.Ext(path))
	if t := mime.TypeByExtension(ext); t != "" {
		// Strip charset parameters (e.g. "text/plain; charset=utf-8" → "text/plain")
		if idx := strings.Index(t, ";"); idx != -1 {
			t = strings.TrimSpace(t[:idx])
		}
		return t
	}
	sniff := data
	if len(sniff) > 512 {
		sniff = sniff[:512]
	}
	return http.DetectContentType(sniff)
}

// parseMediaTags extracts MEDIA:/path references from text.
// Returns the cleaned text (tags removed) and a slice of file paths.
func parseMediaTags(text string) (cleanText string, paths []string) {
	var kept []string
	for _, line := range strings.Split(text, "\n") {
		// Strip surrounding whitespace and quotes/backticks
		candidate := strings.TrimSpace(line)
		candidate = strings.Trim(candidate, "`\"'")
		if strings.HasPrefix(candidate, "MEDIA:") {
			p := strings.TrimSpace(strings.TrimPrefix(candidate, "MEDIA:"))
			if p != "" {
				paths = append(paths, p)
			}
			continue // drop this line from output
		}
		kept = append(kept, line)
	}
	cleanText = strings.TrimSpace(strings.Join(kept, "\n"))
	return
}

// readAttachmentsFromPaths converts a list of file paths into MediaAttachments,
// silently skipping files that are missing or too large.
func readAttachmentsFromPaths(paths []string) []MediaAttachment {
	var out []MediaAttachment
	for _, p := range paths {
		att, err := readFileAsAttachment(p)
		if err != nil {
			log.Printf("[media] skipping %q: %v", p, err)
			continue
		}
		out = append(out, *att)
	}
	return out
}
