export {
  createOwnerSession,
  defaultDbPath,
  defaultRelayUrl,
  defaultWatchDir,
  resetOwner,
  resolveConfiguredWatchDir,
  restoreOwnerFromMnemonic,
  showOwnerContext,
  showOwnerMnemonic,
  startFileSync,
} from "./file-sync/index.ts";
export type {
  FileSyncConfig,
  FileSyncSession,
  FileSyncStartOptions,
  OwnerSession,
  ReadLineFn,
  StartupFatalError,
} from "./file-sync/index.ts";
