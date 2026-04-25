#!/usr/bin/env -S bun
import * as readline from "node:readline";
import { defineCommand, runMain } from "citty";
import packageJson from "../package.json" with { type: "json" };
import {
  createOwnerSession,
  resetOwner,
  resolveConfiguredWatchDir,
  showOwnerContext,
  showOwnerMnemonic,
  startFileSync,
} from "./file-sync/index.ts";
import { createAllFilesQuery } from "./file-sync/evolu-queries.ts";
import {
  createInstanceLock,
  formatDuplicateInstanceMessage,
} from "./file-sync/platform/index.ts";
import { createInteractiveLogger } from "./logger.ts";
import {
  bindShortcuts,
  computeStdinInteractive,
  type LoggerDep,
  type ReadlineDep,
  type SessionDep,
  type ShortcutOptionsDep,
  type TTYDep,
} from "./shortcuts.ts";

/** Returns an exit code when startup must stop; otherwise never resolves. */
const runStart = async (watchDir?: string): Promise<number | undefined> => {
  const startedAt = Date.now();

  const resolvedWatchDir = resolveConfiguredWatchDir(
    watchDir !== undefined ? { watchDir } : {},
  );
  const instanceLock = createInstanceLock(resolvedWatchDir);
  const lockResult = await instanceLock.acquire();
  if (!lockResult.ok) {
    console.error(
      formatDuplicateInstanceMessage(resolvedWatchDir, lockResult.error),
    );
    return 2;
  }

  const isInteractive = computeStdinInteractive();

  let clearConsoleRef: (() => void) | undefined;

  const result = await startFileSync({
    watchDir: resolvedWatchDir,
    clearConsole: () => {
      clearConsoleRef?.();
    },
    beforeQuit: async () => {
      await instanceLock.release();
    },
  });

  if (!result.ok) {
    await instanceLock.release();
    console.error("[txtatelier] Fatal error during startup:");
    console.error(result.error);
    return 1;
  }

  const session = result.value;
  const durationMs = Date.now() - startedAt;

  const rl = isInteractive
    ? readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        prompt: "",
      })
    : null;

  const ilog = createInteractiveLogger(rl);
  clearConsoleRef = () => {
    ilog.clearScreen();
  };

  ilog.printStartupBanner({
    clear: true,
    version: packageJson.version,
    durationMs,
  });

  const fileRows = await session.evolu.loadQuery(
    createAllFilesQuery(session.evolu),
  );
  const owner = await session.evolu.appOwner;

  if (isInteractive) {
    ilog.info("");
    ilog.info(`➜  Watching: ${resolvedWatchDir}`);
    ilog.info(`➜  ${fileRows.length} files`);
    ilog.info(`➜  Owner: ${owner.id}`);
  } else {
    ilog.info(`Watching: ${resolvedWatchDir}`);
  }

  const shortcutDeps: SessionDep &
    LoggerDep &
    TTYDep &
    ShortcutOptionsDep &
    ReadlineDep = {
    session,
    logger: ilog,
    isTTY: isInteractive,
    options: { print: true },
    readline: rl,
  };

  const unbindShortcuts = bindShortcuts(shortcutDeps);
  session.onStop(() => {
    unbindShortcuts();
  });

  const shutdown = async (signal: string) => {
    ilog.info(`[txtatelier] Received ${signal}, shutting down gracefully...`);
    await session.stop();
    await instanceLock.release();
    process.exit(0);
  };

  process.on("SIGTERM", () => {
    void shutdown("SIGTERM");
  });
  process.on("SIGINT", () => {
    void shutdown("SIGINT");
  });

  await new Promise(() => {});
  return undefined;
};

const watchDirArg = {
  "watch-dir": {
    type: "string" as const,
    description: "Override the default watched directory",
  },
};

const ownerCommand = defineCommand({
  meta: {
    name: "owner",
    description:
      "Manage owner identity (non-interactive). Prefer default start + s / p / d shortcuts in a TTY.",
  },
  args: {
    ...watchDirArg,
    show: { type: "boolean" as const, description: "Show owner mnemonic" },
    where: {
      type: "boolean" as const,
      description: "Show path of owner/mnemonic files",
    },
    reset: { type: "boolean" as const, description: "Reset owner (destructive)" },
    yes: {
      type: "boolean" as const,
      description: "Confirm destructive operation (for --reset)",
    },
  },
  async run({ args }) {
    const session = await createOwnerSession({
      ...(args["watch-dir"] ? { watchDir: args["watch-dir"] } : {}),
      subscribeFilesShard: false,
    });

    if (args.show) {
      await showOwnerMnemonic(session);
      process.exit(0);
    }

    if (args.where) {
      await showOwnerContext(session);
      process.exit(0);
    }

    if (args.reset) {
      if (!args.yes) {
        console.error(
          "Reset is destructive. Re-run with: txtatelier owner --reset --yes",
        );
        process.exit(1);
      }

      await resetOwner(session);
      process.exit(0);
    }

    console.error("No action specified. Use --help to see available options.");
    process.exit(1);
  },
});

const startCommand = defineCommand({
  meta: {
    name: "start",
    description:
      "Local-first file synchronization CLI. Runs file sync until interrupted.",
  },
  args: watchDirArg,
  async run({ args }) {
    const exitCode = await runStart(args["watch-dir"]);
    if (exitCode !== undefined) {
      process.exit(exitCode);
    }
  },
});

void runMain(
  defineCommand({
    meta: {
      name: packageJson.name,
      version: packageJson.version,
      description:
        "Local-first file synchronization CLI. Runs file sync until interrupted.",
    },
    args: watchDirArg,
    default: "start",
    subCommands: {
      start: startCommand,
      owner: ownerCommand,
    },
  }),
);
