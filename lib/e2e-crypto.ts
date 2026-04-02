/**
 * E2E encryption for credential storage.
 *
 * Dashboard encrypts API keys with the connector's X25519 public key
 * using NaCl sealed box. The Hub only sees ciphertext.
 * The connector decrypts with its private key.
 *
 * Uses tweetnacl-sealedbox-js which implements the standard libsodium
 * crypto_box_seal format: nonce = blake2b(ephPub || recipPub)[:24].
 * This matches the Go side's DecryptSealedBox() in credentials.go.
 */
// @ts-ignore — no types for tweetnacl-sealedbox-js
import { seal } from "tweetnacl-sealedbox-js";

/**
 * Encrypt a plaintext string using NaCl sealed box with the recipient's
 * X25519 public key. Returns base64-encoded ciphertext.
 *
 * Format: [32-byte ephemeral pubkey][NaCl box ciphertext]
 * The connector's DecryptSealedBox() expects this exact format.
 */
export function encryptForDevice(
  plaintext: string,
  recipientPubkeyBase64: string
): string {
  const pubkey = base64ToUint8(recipientPubkeyBase64);
  if (pubkey.length !== 32) {
    throw new Error(
      `Invalid X25519 public key length: ${pubkey.length}, expected 32`
    );
  }

  const message = new TextEncoder().encode(plaintext);
  const encrypted = seal(message, pubkey);
  return uint8ToBase64(encrypted);
}

/**
 * Check if a base64-encoded public key looks valid (32 bytes, non-zero).
 */
export function isValidPubkey(pubkeyBase64: string): boolean {
  try {
    const bytes = base64ToUint8(pubkeyBase64);
    if (bytes.length !== 32) return false;
    return bytes.some((b) => b !== 0);
  } catch {
    return false;
  }
}

// --- Base64 helpers ---

function base64ToUint8(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}
