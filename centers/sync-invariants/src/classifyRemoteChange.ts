import { detectConflict } from "./detectConflict.ts";

export type RemoteChangeClass =
  | "no_change"
  | "self_echo"
  | "remote_behind"
  | "true_divergence";

export type ClassifyRemoteChangeInput = {
  readonly diskHash: string | null;
  readonly lastAppliedHash: string | null;
  readonly remoteHash: string;
  readonly lastPersistedHash: string | null;
};

/**
 * Layer 2 — causality over replication observations.
 * Order matches openspec/changes/archive/2026-04-01-pwa-editor-fsm-zag-unify/CONFLICT_RULES.md.
 */
export const classifyRemoteChange = (
  input: ClassifyRemoteChangeInput,
): RemoteChangeClass => {
  const { diskHash, lastAppliedHash, remoteHash, lastPersistedHash } = input;

  // Rule 1
  if (diskHash === null || lastAppliedHash === null) {
    return "no_change";
  }

  // Rule 2
  if (remoteHash === diskHash) {
    return "no_change";
  }

  // Rule 3
  if (lastPersistedHash !== null && remoteHash === lastPersistedHash) {
    return "self_echo";
  }

  // Rule 4
  if (remoteHash === lastAppliedHash) {
    return "remote_behind";
  }

  // Rule 5
  if (detectConflict(diskHash, lastAppliedHash, remoteHash)) {
    return "true_divergence";
  }

  // Rule 6
  return "no_change";
};
