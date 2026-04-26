// Bidirectional filesystem sync with Evolu
// Phase 0: Change Capture (Filesystem → Evolu)
// Phase 1: State Materialization (Evolu → Filesystem)

import { createHash } from "node:crypto";
import { access } from "node:fs/promises";
import { homedir } from "node:os";
import path, { join, resolve } from "node:path";
import {
  createFormatTypeError,
  type Evolu,
  err,
  Mnemonic,
  ok,
  type Result,
} from "@evolu/common";
import { deriveShardOwner } from "@evolu/common/local-first";
import { FILES_SHARD } from "@txtatelier/sync-invariants";
import envPaths from "env-paths";
import untildify from "untildify";
import { env } from "../env.ts";
import { logger } from "../logger.ts";
import type { FlushError } from "./errors.ts";
import { createEvoluClient } from "./evolu.ts";
import type { Schema } from "./evolu-schema.ts";
import {
  captureChange,
  type FileSyncContext,
  type ReconcileFatalError,
  type ReconcileStats,
  reconcileStartupEvoluState,
  reconcileStartupFilesystemState,
  startStateMaterialization,
} from "./sync/index.ts";
import { startWatching } from "./watch.ts";

const paths = envPaths("txtatelier");

const formatTypeError = createFormatTypeError();

const hashWatchDir = (dir: string) =>
  createHash("sha256").update(resolve(dir)).digest("hex").slice(0, 8);

export const defaultDbPath = (watchDir: string) =>
  join(paths.data, `txtatelier-${hashWatchDir(watchDir)}.db`);
export const defaultRelayUrl = "wss://free.evoluhq.com";
export const defaultWatchDir = join(homedir(), "Documents", "Txtatelier");

/**
 * Resolve the watch directory for CLI and file-sync startup (same rules as {@link createOwnerSession}).
 */
export const resolveConfiguredWatchDir = (
  config?: Partial<Pick<FileSyncConfig, "watchDir">>,
): string =>
  path.resolve(untildify(config?.watchDir ?? env.watchDir ?? defaultWatchDir));

export interface FileSyncConfig {
  readonly dbPath: string;
  readonly watchDir: string;
  readonly relayUrl: string;
}

/**
 * Fatal error during file sync startup.
 * Wraps reconciliation fatal errors.
 */
export type StartupFatalError = {
  readonly type: "StartupFailed";
  readonly cause: ReconcileFatalError;
};

export interface OwnerSession {
  readonly evolu: Evolu<typeof Schema>;
  readonly flush: () => Promise<Result<void, FlushError>>;
  readonly config: FileSyncConfig;
}

export type ReadLineFn = (question: string) => Promise<string>;

export interface FileSyncSession extends OwnerSession {
  readonly showMnemonic: () => Promise<string>;
  readonly showStatus: () => Promise<string>;
  readonly restoreMnemonic: (mnemonicInput: string) => Promise<string>;
  readonly resetOwner: () => Promise<string>;
  readonly clearScreen: () => void;
  readonly quit: () => Promise<void>;
  readonly onStop: (handler: () => void | Promise<void>) => () => void;
  readonly stop: () => Promise<void>;
  readonly startupReconciliation: {
    readonly filesystem: ReconcileStats;
    readonly evolu: ReconcileStats;
  };
}

type SyncLoopHandles = {
  stopWatching: (() => void) | null;
  stopSyncing: (() => void) | null;
};

const detachSyncLoop = (handles: SyncLoopHandles): void => {
  if (handles.stopSyncing) {
    handles.stopSyncing();
    handles.stopSyncing = null;
  }
  if (handles.stopWatching) {
    handles.stopWatching();
    handles.stopWatching = null;
  }
};

/**
 * Create a lightweight session for owner queries without starting sync.
 * Use this for commands that only need to read/modify owner information.
 *
 * @param config.subscribeFilesShard - When `false`, skips registering the files shard with
 *   Evolu sync (no relay WebSocket). Default `true` for {@link startFileSync}.
 */
export const createOwnerSession = async (
  config?: Partial<FileSyncConfig> & { readonly subscribeFilesShard?: boolean },
): Promise<OwnerSession> => {
  const resolvedWatchDir = resolveConfiguredWatchDir(config);
  const resolvedDbPath =
    config?.dbPath ?? env.dbPath ?? defaultDbPath(resolvedWatchDir);
  const resolvedRelayUrl = config?.relayUrl ?? env.relayUrl ?? defaultRelayUrl;
  const subscribeFilesShard = config?.subscribeFilesShard ?? true;

  // Create Evolu client (handles owner persistence internally)
  const client = await createEvoluClient({
    dbPath: resolvedDbPath,
    relayUrl: resolvedRelayUrl,
    subscribeFilesShard,
  });

  return {
    evolu: client.evolu,
    flush: client.flush,
    config: {
      dbPath: resolvedDbPath,
      watchDir: resolvedWatchDir,
      relayUrl: resolvedRelayUrl,
    },
  };
};

const resetOwnerData = async (session: OwnerSession): Promise<void> => {
  await session.evolu.resetAppOwner({ reload: false });

  const flushResult = await session.flush();
  if (!flushResult.ok) {
    throw new Error("Failed to flush reset owner", {
      cause: flushResult.error,
    });
  }

  logger.info("Owner reset.");
};

export type FileSyncStartOptions = Partial<FileSyncConfig> & {
  readonly beforeQuit?: () => Promise<void>;
  readonly clearScreen?: () => void;
};

export const startFileSync = async (
  config?: FileSyncStartOptions,
): Promise<Result<FileSyncSession, StartupFatalError>> => {
  logger.info("[lifecycle] Initializing...");

  const ownerSession = await createOwnerSession(config);
  const {
    evolu,
    flush: closeDb,
    config: { watchDir, dbPath, relayUrl },
  } = ownerSession;

  const owner = await evolu.appOwner;
  const filesShardOwner = deriveShardOwner(owner, FILES_SHARD);

  const syncCtx: FileSyncContext = {
    evolu,
    watchDir,
    filesOwnerId: filesShardOwner.id,
  };

  const isFirstRun = !(await access(dbPath).then(
    () => true,
    () => false,
  ));

  if (isFirstRun) {
    logger.info("[lifecycle]");
    logger.info("[lifecycle] First run detected!");
    logger.info("[lifecycle]");
    logger.info("[lifecycle] Your mnemonic (save this securely!):");
    logger.info(`[lifecycle]   ${owner.mnemonic}`);
    logger.info("[lifecycle]");
    logger.info("[lifecycle] ⚠️  IMPORTANT: Save this mnemonic!");
    logger.info(
      "[lifecycle] ⚠️  You'll need it to access your data on other devices.",
    );
    logger.info(
      "[lifecycle] ⚠️  Press s + Enter in interactive mode to show it again.",
    );
    logger.info("[lifecycle]");
  }

  logger.info(`[lifecycle] Owner ID: ${owner.id}`);

  let unsubscribeError: (() => void) | null = evolu.subscribeError(() => {
    const error = evolu.getError();
    if (error) {
      logger.error("[error] Evolu error:", error);
    }
  });

  const runStartupReconciliation = async (): Promise<
    Result<
      { readonly filesystem: ReconcileStats; readonly evolu: ReconcileStats },
      StartupFatalError
    >
  > => {
    const evolResult = await reconcileStartupEvoluState(syncCtx);

    if (!evolResult.ok) {
      logger.error(
        "[error] Fatal error during Evolu reconciliation:",
        evolResult.error,
      );
      return err({ type: "StartupFailed", cause: evolResult.error });
    }

    if (evolResult.value.failedCount > 0) {
      logger.warn(
        `[lifecycle] Evolu reconciliation completed with ${evolResult.value.failedCount} partial failures`,
      );
    }

    const fsResult = await reconcileStartupFilesystemState(syncCtx);

    if (!fsResult.ok) {
      logger.error(
        "[error] Fatal error during filesystem reconciliation:",
        fsResult.error,
      );
      return err({ type: "StartupFailed", cause: fsResult.error });
    }

    if (fsResult.value.failedCount > 0) {
      logger.warn(
        `[lifecycle] Filesystem reconciliation completed with ${fsResult.value.failedCount} partial failures`,
      );
    }

    return ok({
      filesystem: fsResult.value,
      evolu: evolResult.value,
    });
  };

  const startupOnce = await runStartupReconciliation();

  if (!startupOnce.ok) {
    if (unsubscribeError) {
      unsubscribeError();
      unsubscribeError = null;
    }
    return startupOnce;
  }

  const loopHandles: SyncLoopHandles = {
    stopWatching: null,
    stopSyncing: null,
  };

  const attachSyncLoop = async (): Promise<Result<void, StartupFatalError>> => {
    logger.info(`[lifecycle] Watching directory: ${watchDir}`);
    const stopWatching = await startWatching(watchDir, async (filePath) => {
      const result = await captureChange(syncCtx, filePath);
      if (!result.ok) {
        logger.error(
          `[capture:fs→evolu] Failed to capture ${filePath}:`,
          result.error,
        );
      }
    });

    const stopSyncing = startStateMaterialization(syncCtx, {
      onConflictArtifactCreated: async (conflictPath: string) => {
        const result = await captureChange(syncCtx, conflictPath);
        if (!result.ok) {
          logger.error(
            `[capture:fs→evolu] Failed to capture conflict file ${conflictPath}:`,
            result.error,
          );
        }
      },
    });

    loopHandles.stopWatching = stopWatching;
    loopHandles.stopSyncing = stopSyncing;
    return ok(undefined);
  };

  const attachOnce = await attachSyncLoop();
  if (!attachOnce.ok) {
    if (unsubscribeError) {
      unsubscribeError();
      unsubscribeError = null;
    }
    return attachOnce;
  }

  logger.info("[lifecycle] Ready");

  const stopHandlers: Array<() => void | Promise<void>> = [];
  let stopped = false;
  let quitting = false;

  const stopSyncOnly = (): void => {
    detachSyncLoop(loopHandles);
  };

  const clearScreen = config?.clearScreen ?? ((): void => {});

  const stop = async (): Promise<void> => {
    if (stopped) {
      return;
    }
    stopped = true;
    logger.info("[lifecycle] Shutting down...");
    for (const h of stopHandlers) {
      await Promise.resolve(h());
    }
    stopSyncOnly();
    if (unsubscribeError) {
      unsubscribeError();
      unsubscribeError = null;
    }
    if (closeDb) {
      const flushResult = await closeDb();
      if (!flushResult.ok) {
        logger.error("[error] Failed to flush database:", flushResult.error);
      }
    }
    logger.info("[lifecycle] Stopped");
  };

  const quit = async (): Promise<void> => {
    if (quitting) {
      return;
    }
    quitting = true;
    await stop();
    if (config?.beforeQuit) {
      await config.beforeQuit();
    }
    process.exit(0);
  };

  return ok({
    evolu,
    flush: closeDb,
    startupReconciliation: {
      filesystem: startupOnce.value.filesystem,
      evolu: startupOnce.value.evolu,
    },
    config: {
      dbPath,
      watchDir,
      relayUrl,
    },
    showMnemonic: async () => {
      const o = await evolu.appOwner;
      return ["", "  Mnemonic (copy manually):", `  ${o.mnemonic}`, ""].join(
        "\n",
      );
    },
    showStatus: async () => {
      const o = await evolu.appOwner;
      return [
        "Status:",
        `  DB path: ${dbPath}`,
        `  Watch dir: ${watchDir}`,
        `  Relay URL: ${relayUrl}`,
        `  Owner ID: ${o.id}`,
      ].join("\n");
    },
    restoreMnemonic: async (mnemonicInput: string) => {
      await restoreOwnerFromMnemonic(ownerSession, mnemonicInput);
      return [
        "",
        "  Owner restored. Stop this process (q) and start again to use the restored identity.",
        "",
      ].join("\n");
    },
    resetOwner: async () => {
      await resetOwnerData(ownerSession);
      return [
        "",
        "  Owner reset. Stop this process (q) and start again to use the new owner.",
        "",
      ].join("\n");
    },
    clearScreen,
    quit,
    onStop: (handler: () => void | Promise<void>): (() => void) => {
      stopHandlers.push(handler);
      return () => {
        const i = stopHandlers.indexOf(handler);
        if (i >= 0) {
          stopHandlers.splice(i, 1);
        }
      };
    },
    stop,
  });
};

export const showOwnerMnemonic = async (
  session: OwnerSession,
): Promise<void> => {
  const owner = await session.evolu.appOwner;
  console.log(owner.mnemonic);
};

export const showOwnerContext = async (
  session: OwnerSession,
): Promise<void> => {
  const owner = await session.evolu.appOwner;
  console.log("Active context:");
  console.log(`  DB path: ${session.config.dbPath}`);
  console.log(`  Watch dir: ${session.config.watchDir}`);
  console.log(`  Relay URL: ${session.config.relayUrl}`);
  console.log(`  Owner ID: ${owner.id}`);
};

export const restoreOwnerFromMnemonic = async (
  session: OwnerSession,
  mnemonicInput: string,
): Promise<void> => {
  const parsedMnemonic = Mnemonic.from(mnemonicInput.trim());

  if (!parsedMnemonic.ok) {
    throw new Error(
      `Invalid mnemonic: ${formatTypeError(parsedMnemonic.error)}`,
    );
  }

  await session.evolu.restoreAppOwner(parsedMnemonic.value, { reload: false });

  const flushResult = await session.flush();
  if (!flushResult.ok) {
    throw new Error("Failed to flush restored owner", {
      cause: flushResult.error,
    });
  }

  logger.info("Owner restored from mnemonic.");
};

export const resetOwner = async (session: OwnerSession): Promise<void> => {
  await resetOwnerData(session);
};
