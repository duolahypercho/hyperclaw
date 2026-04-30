package credentials

import (
	"crypto/ed25519"
	"crypto/rand"
	"crypto/sha256"
	"crypto/sha512"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sync"
	"time"

	"golang.org/x/crypto/blake2b"
	"golang.org/x/crypto/chacha20poly1305"
	"golang.org/x/crypto/curve25519"
	"golang.org/x/crypto/hkdf"
	"golang.org/x/crypto/nacl/box"
)

// fingerprintSize is the SHA-256 hash length used as the pubkey fingerprint.
const fingerprintSize = 32

// Credential represents a single stored credential.
type Credential struct {
	Type  string `json:"type"`
	Key   string `json:"key"`
	Added string `json:"added"`
}

// MaskedCred is the public view of a credential (key masked).
type MaskedCred struct {
	Provider string `json:"provider"`
	Type     string `json:"type"`
	Masked   string `json:"masked"`
	Added    string `json:"added"`
}

// CredentialStore holds the in-memory credential data.
type CredentialStore struct {
	Version   int                   `json:"version"`
	Providers map[string]Credential `json:"providers"`
	mu        sync.Mutex
}

// NewCredentialStore creates an empty store.
func NewCredentialStore() *CredentialStore {
	return &CredentialStore{
		Version:   1,
		Providers: make(map[string]Credential),
	}
}

// Set adds or updates a credential for the given provider.
func (s *CredentialStore) Set(provider string, cred Credential) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.Providers[provider] = cred
}

// Delete removes a credential by provider name.
func (s *CredentialStore) Delete(provider string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.Providers, provider)
}

// List returns a masked view of all credentials.
func (s *CredentialStore) List() []MaskedCred {
	s.mu.Lock()
	defer s.mu.Unlock()
	result := make([]MaskedCred, 0, len(s.Providers))
	for name, cred := range s.Providers {
		result = append(result, MaskedCred{
			Provider: name,
			Type:     cred.Type,
			Masked:   maskKey(cred.Key),
			Added:    cred.Added,
		})
	}
	return result
}

// GetAll returns a copy of all credentials (including plaintext keys).
func (s *CredentialStore) GetAll() map[string]Credential {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := make(map[string]Credential, len(s.Providers))
	for k, v := range s.Providers {
		out[k] = v
	}
	return out
}

// maskKey returns a masked version of a key, showing only the last 4 chars.
func maskKey(key string) string {
	if len(key) <= 4 {
		return "****"
	}
	return fmt.Sprintf("••••%s", key[len(key)-4:])
}

// ── Key conversion ──────────────────────────────────────────────────────────

// GetX25519Pubkey converts an Ed25519 private key to its X25519 public key.
func GetX25519Pubkey(edPriv ed25519.PrivateKey) []byte {
	privScalar := Ed25519ToX25519Private(edPriv)
	pub, err := curve25519.X25519(privScalar, curve25519.Basepoint)
	if err != nil {
		// Should never happen with a valid clamped scalar.
		panic("curve25519.X25519 failed: " + err.Error())
	}
	return pub
}

// GetPubkeyFingerprint returns the SHA-256 fingerprint of an X25519 public key.
func GetPubkeyFingerprint(x25519Pub []byte) [fingerprintSize]byte {
	return sha256.Sum256(x25519Pub)
}

// Ed25519ToX25519Private derives the X25519 private scalar from an Ed25519
// private key using the standard SHA-512 + clamping approach.
func Ed25519ToX25519Private(edPriv ed25519.PrivateKey) []byte {
	h := sha512.Sum512(edPriv.Seed())
	// Clamp per RFC 7748
	h[0] &= 248
	h[31] &= 127
	h[31] |= 64
	return h[:32]
}

// ── NaCl sealed box ─────────────────────────────────────────────────────────

// DecryptSealedBox opens a NaCl sealed box encrypted to the given recipient.
//
// Format: [32-byte ephemeral pubkey][NaCl box ciphertext]
// Nonce:  blake2b(ephPub || recipPub) truncated to 24 bytes.
func DecryptSealedBox(recipientPrivKey, recipientPubKey *[32]byte, encrypted []byte) ([]byte, error) {
	if len(encrypted) < 32+box.Overhead {
		return nil, errors.New("ciphertext too short for sealed box")
	}

	var ephPub [32]byte
	copy(ephPub[:], encrypted[:32])

	// Compute nonce: blake2b with 24-byte digest of (ephPub || recipPub).
	h, err := blake2b.New(24, nil)
	if err != nil {
		return nil, fmt.Errorf("blake2b init: %w", err)
	}
	h.Write(ephPub[:])
	h.Write(recipientPubKey[:])
	var nonce [24]byte
	copy(nonce[:], h.Sum(nil))

	decrypted, ok := box.Open(nil, encrypted[32:], &nonce, &ephPub, recipientPrivKey)
	if !ok {
		return nil, errors.New("sealed box decryption failed")
	}
	return decrypted, nil
}

// ── At-rest encryption (XChaCha20-Poly1305) ─────────────────────────────────

// deriveStorageKey derives a 32-byte encryption key from the Ed25519 private
// key using HKDF-SHA256 with a fixed salt.
func deriveStorageKey(edPriv ed25519.PrivateKey) [32]byte {
	salt := []byte("hyperclaw-credentials-v1")
	info := []byte("at-rest-encryption")
	reader := hkdf.New(sha256.New, edPriv.Seed(), salt, info)
	var key [32]byte
	if _, err := io.ReadFull(reader, key[:]); err != nil {
		panic("hkdf read failed: " + err.Error())
	}
	return key
}

// credentialsFilePath returns the path to credentials.enc.
// Stored in credentials/ subdirectory for security isolation.
func credentialsFilePath(dataDir string) string {
	return filepath.Join(dataDir, "credentials", "credentials.enc")
}

// LoadCredentials loads and decrypts the credential store from disk.
// Returns a new empty store if the file does not exist.
func LoadCredentials(dataDir string, edPriv ed25519.PrivateKey) (*CredentialStore, error) {
	path := credentialsFilePath(dataDir)

	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return NewCredentialStore(), nil
		}
		return nil, fmt.Errorf("read credentials: %w", err)
	}

	// File format: [32-byte fingerprint][24-byte nonce][ciphertext+tag]
	minSize := fingerprintSize + chacha20poly1305.NonceSizeX + chacha20poly1305.Overhead
	if len(data) < minSize {
		return nil, errors.New("credentials file too short")
	}

	// Verify pubkey fingerprint
	x25519Pub := GetX25519Pubkey(edPriv)
	expectedFP := GetPubkeyFingerprint(x25519Pub)
	var storedFP [fingerprintSize]byte
	copy(storedFP[:], data[:fingerprintSize])
	if storedFP != expectedFP {
		return nil, errors.New("credential file fingerprint mismatch: key has changed")
	}

	nonce := data[fingerprintSize : fingerprintSize+chacha20poly1305.NonceSizeX]
	ciphertext := data[fingerprintSize+chacha20poly1305.NonceSizeX:]

	storageKey := deriveStorageKey(edPriv)
	aead, err := chacha20poly1305.NewX(storageKey[:])
	if err != nil {
		return nil, fmt.Errorf("init xchacha20: %w", err)
	}

	plaintext, err := aead.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		return nil, fmt.Errorf("decrypt credentials: %w", err)
	}

	var store CredentialStore
	if err := json.Unmarshal(plaintext, &store); err != nil {
		return nil, fmt.Errorf("unmarshal credentials: %w", err)
	}
	if store.Providers == nil {
		store.Providers = make(map[string]Credential)
	}
	return &store, nil
}

// SaveCredentials encrypts and atomically writes the credential store to disk.
// Uses flock for concurrent write safety.
func SaveCredentials(dataDir string, edPriv ed25519.PrivateKey, store *CredentialStore) error {
	credentialsDir := filepath.Join(dataDir, "credentials")
	if err := os.MkdirAll(credentialsDir, 0700); err != nil {
		return fmt.Errorf("ensure credentials dir: %w", err)
	}

	path := credentialsFilePath(dataDir)
	lockPath := path + ".lock"

	// Acquire file lock
	lf, err := os.OpenFile(lockPath, os.O_CREATE|os.O_WRONLY, 0600)
	if err != nil {
		return fmt.Errorf("open lock file: %w", err)
	}
	defer func() {
		unlockFile(lf)
		lf.Close()
		os.Remove(lockPath)
	}()

	if err := lockFile(lf); err != nil {
		return fmt.Errorf("acquire flock: %w", err)
	}

	// Serialize
	plaintext, err := json.Marshal(store)
	if err != nil {
		return fmt.Errorf("marshal credentials: %w", err)
	}

	// Encrypt with XChaCha20-Poly1305
	storageKey := deriveStorageKey(edPriv)
	aead, err := chacha20poly1305.NewX(storageKey[:])
	if err != nil {
		return fmt.Errorf("init xchacha20: %w", err)
	}

	nonce := make([]byte, chacha20poly1305.NonceSizeX)
	if _, err := rand.Read(nonce); err != nil {
		return fmt.Errorf("generate nonce: %w", err)
	}

	ciphertext := aead.Seal(nil, nonce, plaintext, nil)

	// Build file: [fingerprint][nonce][ciphertext+mac]
	x25519Pub := GetX25519Pubkey(edPriv)
	fp := GetPubkeyFingerprint(x25519Pub)

	var buf []byte
	buf = append(buf, fp[:]...)
	buf = append(buf, nonce...)
	buf = append(buf, ciphertext...)

	// Atomic write via temp file + rename
	tmpPath := path + ".tmp"
	if err := os.WriteFile(tmpPath, buf, 0600); err != nil {
		return fmt.Errorf("write temp credentials: %w", err)
	}
	if err := os.Rename(tmpPath, path); err != nil {
		os.Remove(tmpPath)
		return fmt.Errorf("rename credentials: %w", err)
	}

	return nil
}

// CredentialsFileExists reports whether the credentials.enc file exists.
func CredentialsFileExists(dataDir string) bool {
	_, err := os.Stat(credentialsFilePath(dataDir))
	return err == nil
}

// RemoveCredentials deletes the credentials.enc file.
func RemoveCredentials(dataDir string) error {
	path := credentialsFilePath(dataDir)
	if err := os.Remove(path); err != nil && !os.IsNotExist(err) {
		return err
	}
	return nil
}

// Now returns an ISO 8601 timestamp for credential "added" fields.
func Now() string {
	return time.Now().UTC().Format(time.RFC3339)
}
