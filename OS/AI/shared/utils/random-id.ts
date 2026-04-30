import mongoose from "mongoose";

export function randomId() {
  return new mongoose.Types.ObjectId().toString();
}

export function generateMessageId(): string {
  return new mongoose.Types.ObjectId().toString();
}

export function randomUUID() {
  return new mongoose.Types.ObjectId().toString();
}

export function dataToUUID(input: string, namespace?: string): string {
  // For MongoDB ObjectId, we'll create a deterministic ID based on input
  // Using a hash of the input to create a consistent ObjectId
  const crypto = require("crypto");
  const hash = crypto
    .createHash("sha256")
    .update(input + (namespace || ""))
    .digest("hex");

  // Take first 24 characters and ensure it's a valid ObjectId format
  const objectIdString = hash.substring(0, 24);

  // Validate that it's a valid ObjectId format (24 hex characters)
  if (!/^[0-9a-fA-F]{24}$/.test(objectIdString)) {
    // Fallback to generating a new ObjectId if hash doesn't produce valid format
    return new mongoose.Types.ObjectId().toString();
  }

  return objectIdString;
}

export function isValidUUID(id: string) {
  // Check if it's a valid MongoDB ObjectId (24 hex characters)
  return mongoose.Types.ObjectId.isValid(id);
}
