// Content hashing: canonical algorithm in @teich/sync-invariants; disk I/O here.

import { readFile } from "node:fs/promises";
import { computeContentHash, computeHash } from "@teich/sync-invariants";

export { computeContentHash, computeHash };

/**
 * Read file and compute SHA-256 hex hash (same contract as `computeHash` on file bytes).
 */
export const computeFileHash = async (filePath: string): Promise<string> => {
  const bytes = await readFile(filePath);
  return computeHash(new Uint8Array(bytes));
};
