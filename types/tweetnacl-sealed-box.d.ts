declare module "tweetnacl-sealedbox-js" {
  /** Encrypt using NaCl sealed box (crypto_box_seal). */
  export function seal(message: Uint8Array, recipientPublicKey: Uint8Array): Uint8Array;
  /** Decrypt using NaCl sealed box (crypto_box_seal_open). */
  export function open(ciphertext: Uint8Array, recipientPublicKey: Uint8Array, recipientSecretKey: Uint8Array): Uint8Array | null;
  export const overheadLength: number;
}
