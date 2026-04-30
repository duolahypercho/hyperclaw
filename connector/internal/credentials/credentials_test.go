package credentials

import (
	"crypto/ed25519"
	"crypto/rand"
	"encoding/base64"
	"testing"

	"golang.org/x/crypto/blake2b"
	"golang.org/x/crypto/curve25519"
	"golang.org/x/crypto/nacl/box"
)

// sealedBoxSeal encrypts a message using NaCl sealed box (sender side).
// This mimics what tweetnacl-sealed-box does in JavaScript.
func sealedBoxSeal(message []byte, recipientPubKey *[32]byte) []byte {
	// Generate ephemeral keypair
	ephPub, ephPriv, err := box.GenerateKey(rand.Reader)
	if err != nil {
		panic(err)
	}

	// Nonce = blake2b(ephPub || recipPub)[:24]
	h, _ := blake2b.New(24, nil)
	h.Write(ephPub[:])
	h.Write(recipientPubKey[:])
	var nonce [24]byte
	copy(nonce[:], h.Sum(nil))

	// Encrypt
	encrypted := box.Seal(nil, message, &nonce, recipientPubKey, ephPriv)

	// Format: [ephPub][box ciphertext]
	out := make([]byte, 0, 32+len(encrypted))
	out = append(out, ephPub[:]...)
	out = append(out, encrypted...)
	return out
}

func TestKeyConversion(t *testing.T) {
	// Generate Ed25519 keypair
	_, priv, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}

	// Convert to X25519
	x25519Pub := GetX25519Pubkey(priv)
	if len(x25519Pub) != 32 {
		t.Fatalf("X25519 pubkey length: got %d, want 32", len(x25519Pub))
	}

	// Verify consistency: same key produces same pubkey
	x25519Pub2 := GetX25519Pubkey(priv)
	if string(x25519Pub) != string(x25519Pub2) {
		t.Fatal("X25519 conversion not deterministic")
	}

	// Verify X25519 private derivation is consistent
	x25519Priv := Ed25519ToX25519Private(priv)
	derivedPub, err := curve25519.X25519(x25519Priv, curve25519.Basepoint)
	if err != nil {
		t.Fatal(err)
	}
	if string(derivedPub) != string(x25519Pub) {
		t.Fatal("derived pub doesn't match GetX25519Pubkey")
	}
}

func TestKeyConversionDifferentKeys(t *testing.T) {
	_, priv1, _ := ed25519.GenerateKey(rand.Reader)
	_, priv2, _ := ed25519.GenerateKey(rand.Reader)

	pub1 := GetX25519Pubkey(priv1)
	pub2 := GetX25519Pubkey(priv2)

	if string(pub1) == string(pub2) {
		t.Fatal("different Ed25519 keys produced same X25519 pubkey")
	}
}

func TestSealedBoxRoundTrip(t *testing.T) {
	// Generate Ed25519 keypair (as connector would)
	_, edPriv, _ := ed25519.GenerateKey(rand.Reader)

	// Derive X25519 keys
	x25519Priv := Ed25519ToX25519Private(edPriv)
	x25519Pub := GetX25519Pubkey(edPriv)

	var privKey, pubKey [32]byte
	copy(privKey[:], x25519Priv)
	copy(pubKey[:], x25519Pub)

	// Encrypt (simulates dashboard / JS side)
	plaintext := []byte("sk-ant-" + "api03-test-key-1234567890")
	encrypted := sealedBoxSeal(plaintext, &pubKey)

	// Decrypt (connector side)
	decrypted, err := DecryptSealedBox(&privKey, &pubKey, encrypted)
	if err != nil {
		t.Fatalf("DecryptSealedBox failed: %v", err)
	}

	if string(decrypted) != string(plaintext) {
		t.Fatalf("round trip mismatch: got %q, want %q", decrypted, plaintext)
	}
}

func TestSealedBoxWrongKey(t *testing.T) {
	_, edPriv1, _ := ed25519.GenerateKey(rand.Reader)
	_, edPriv2, _ := ed25519.GenerateKey(rand.Reader)

	// Encrypt for key 1
	x25519Pub1 := GetX25519Pubkey(edPriv1)
	var pubKey1 [32]byte
	copy(pubKey1[:], x25519Pub1)
	encrypted := sealedBoxSeal([]byte("secret"), &pubKey1)

	// Try to decrypt with key 2
	x25519Priv2 := Ed25519ToX25519Private(edPriv2)
	x25519Pub2 := GetX25519Pubkey(edPriv2)
	var privKey2, pubKey2 [32]byte
	copy(privKey2[:], x25519Priv2)
	copy(pubKey2[:], x25519Pub2)

	_, err := DecryptSealedBox(&privKey2, &pubKey2, encrypted)
	if err == nil {
		t.Fatal("expected decryption to fail with wrong key")
	}
}

func TestSealedBoxTooShort(t *testing.T) {
	var priv, pub [32]byte
	_, err := DecryptSealedBox(&priv, &pub, []byte("short"))
	if err == nil {
		t.Fatal("expected error for short ciphertext")
	}
}

func TestPubkeyFingerprint(t *testing.T) {
	_, edPriv, _ := ed25519.GenerateKey(rand.Reader)
	pub := GetX25519Pubkey(edPriv)

	fp1 := GetPubkeyFingerprint(pub)
	fp2 := GetPubkeyFingerprint(pub)

	if fp1 != fp2 {
		t.Fatal("fingerprint not deterministic")
	}

	// Different key = different fingerprint
	_, edPriv2, _ := ed25519.GenerateKey(rand.Reader)
	pub2 := GetX25519Pubkey(edPriv2)
	fp3 := GetPubkeyFingerprint(pub2)

	if fp1 == fp3 {
		t.Fatal("different keys produced same fingerprint")
	}
}

func TestCredentialStoreRoundTrip(t *testing.T) {
	// Use temp dir
	dir := t.TempDir()

	_, edPriv, _ := ed25519.GenerateKey(rand.Reader)

	// Create and save credentials
	store := NewCredentialStore()
	store.Set("anthropic", Credential{Type: "api_key", Key: "sk-ant-test", Added: Now()})
	store.Set("openai", Credential{Type: "api_key", Key: "sk-openai-test", Added: Now()})

	if err := SaveCredentials(dir, edPriv, store); err != nil {
		t.Fatalf("SaveCredentials: %v", err)
	}

	// Load back
	loaded, err := LoadCredentials(dir, edPriv)
	if err != nil {
		t.Fatalf("LoadCredentials: %v", err)
	}

	if len(loaded.Providers) != 2 {
		t.Fatalf("expected 2 providers, got %d", len(loaded.Providers))
	}
	if loaded.Providers["anthropic"].Key != "sk-ant-test" {
		t.Fatalf("anthropic key mismatch: %q", loaded.Providers["anthropic"].Key)
	}
	if loaded.Providers["openai"].Key != "sk-openai-test" {
		t.Fatalf("openai key mismatch: %q", loaded.Providers["openai"].Key)
	}
}

func TestCredentialStoreWrongKey(t *testing.T) {
	dir := t.TempDir()

	_, edPriv1, _ := ed25519.GenerateKey(rand.Reader)
	_, edPriv2, _ := ed25519.GenerateKey(rand.Reader)

	store := NewCredentialStore()
	store.Set("test", Credential{Type: "api_key", Key: "secret", Added: Now()})

	// Save with key 1
	if err := SaveCredentials(dir, edPriv1, store); err != nil {
		t.Fatal(err)
	}

	// Try to load with key 2 — fingerprint mismatch
	_, err := LoadCredentials(dir, edPriv2)
	if err == nil {
		t.Fatal("expected fingerprint mismatch error")
	}
	if err.Error() != "credential file fingerprint mismatch: key has changed" {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestCredentialStoreEmpty(t *testing.T) {
	dir := t.TempDir()
	_, edPriv, _ := ed25519.GenerateKey(rand.Reader)

	// Load from empty dir — should return empty store
	store, err := LoadCredentials(dir, edPriv)
	if err != nil {
		t.Fatal(err)
	}
	if len(store.Providers) != 0 {
		t.Fatalf("expected empty store, got %d providers", len(store.Providers))
	}
}

func TestMaskedList(t *testing.T) {
	store := NewCredentialStore()
	store.Set("anthropic", Credential{Type: "api_key", Key: "sk-ant-api03-1234", Added: "2026-04-01"})
	store.Set("short", Credential{Type: "api_key", Key: "ab", Added: "2026-04-01"})

	list := store.List()
	if len(list) != 2 {
		t.Fatalf("expected 2, got %d", len(list))
	}

	for _, m := range list {
		if m.Provider == "anthropic" && m.Masked != "••••1234" {
			t.Fatalf("expected masked ••••1234, got %q", m.Masked)
		}
		if m.Provider == "short" && m.Masked != "****" {
			t.Fatalf("expected masked ****, got %q", m.Masked)
		}
		// Full key must never appear
		if m.Masked == "sk-ant-api03-1234" || m.Masked == "ab" {
			t.Fatalf("full key leaked in masked output: %q", m.Masked)
		}
	}
}

func TestBase64Interop(t *testing.T) {
	// Verify that base64 encoding matches what JS would produce
	_, edPriv, _ := ed25519.GenerateKey(rand.Reader)
	x25519Pub := GetX25519Pubkey(edPriv)

	b64 := base64.StdEncoding.EncodeToString(x25519Pub)
	decoded, err := base64.StdEncoding.DecodeString(b64)
	if err != nil {
		t.Fatal(err)
	}
	if string(decoded) != string(x25519Pub) {
		t.Fatal("base64 round-trip failed")
	}
}
