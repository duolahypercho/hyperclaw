export type InputSubmitAttachmentLike = {
  id?: string;
  name?: string;
  size?: number;
  url?: string;
  file?: {
    name?: string;
    size?: number;
  };
};

export function createInputSubmitFingerprint(
  message: string,
  attachments: InputSubmitAttachmentLike[]
): string {
  return JSON.stringify({
    message,
    attachments: attachments.map((attachment) => ({
      id: attachment.id,
      name: attachment.file?.name ?? attachment.name,
      size: attachment.file?.size ?? attachment.size,
      url: attachment.url || "",
    })),
  });
}

export function createDuplicateSubmitGuard() {
  const pendingFingerprints = new Set<string>();

  return {
    claim(fingerprint: string): boolean {
      if (pendingFingerprints.has(fingerprint)) return false;
      pendingFingerprints.add(fingerprint);
      return true;
    },
    release(fingerprint: string): void {
      pendingFingerprints.delete(fingerprint);
    },
  };
}
