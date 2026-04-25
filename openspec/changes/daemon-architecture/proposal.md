## Why

txtatelier currently blocks the terminal and dies when that terminal closes, tying sync to a user session. Running as a managed background service would make sync persistent and addressable by other tools.

## What Changes

- **BREAKING** (semver-major): `txtatelier` default command changes from foreground start to showing help and exiting 0 — existing shell scripts or startup hooks invoking bare `txtatelier` will silently stop syncing
- New `txtatelier start [--watch-dir]` command launches a detached background daemon
- New `txtatelier stop [--watch-dir]` command stops one running instance (not all)
- New `txtatelier status` command lists all running instances with watch dir, PID, and last heartbeat time
- New `txtatelier attach [--watch-dir]` command connects an interactive session to a running daemon via Unix socket
- Daemon state file (`daemon-state.json`) written atomically per watch-dir instance; holds PID, socket path, watch dir, and `updatedAt` heartbeat
- State file supersedes `proper-lockfile` as the instance uniqueness mechanism; `proper-lockfile` dependency removed
- stdout/stderr patched at daemon startup to redirect output to the log file only (no tee to clients); `logger.ts` unchanged

## Capabilities

### New Capabilities

- `daemon-lifecycle`: Start (detached spawn), stop (SIGTERM + poll → SIGKILL), status (discovery via state files), state file schema, multi-instance scoping, stale instance cleanup
- `daemon-attach`: Attach command, Unix socket protocol (JSON lines — typed commands in, `{ ok, output }` responses out), detach-without-stop semantics, daemon crash detection; `bindShortcuts` lives in the attach client only

### Modified Capabilities

- `logger-coordination`: Logger must support writing output to a file in daemon mode, not only to the console. No tee to socket clients. Single module, no parallel logger.
- `instance-lock`: State file supersedes proper-lockfile entirely. The state file (PID + `kill(pid, 0)`) becomes the sole mechanism for duplicate prevention, discovery, and status. proper-lockfile is removed as a dependency.

## Impact

- `centers/cli/src/cli.ts` — new subcommands: `start`, `stop`, `ps`, `attach`; `default: "start"` removed
- `centers/cli/src/shortcuts.ts` — `SessionDep` replaced with `ShortcutCommands` (narrow async callbacks); `bindShortcuts` updated to call callbacks and print returned strings; `isTTY` on `TTYDep` renamed to `isInteractive`; clipboard fallback removed; `clipboardy` dependency dropped; `bindShortcuts` called only from attach client
- `centers/cli/src/file-sync/index.ts` — session methods (`showStatus`, `showMnemonic`, `restoreMnemonic`, `resetOwner`) refactored to return `Promise<string>` instead of writing to logger; `restoreMnemonic` signature changes to accept `mnemonic: string` directly; `session.quit()` removed
- New modules: `daemon-state.ts`, `daemon.ts`, `attach-client.ts`, `lib/cleanup.ts` (cleanupGroupAsync), `lib/promise.ts` (abortableSleep)
- New runtime artifact: Unix socket per watch-dir instance at a path derived from `env-paths` data dir
- New runtime artifact: `daemon-state.json` per watch-dir instance under `env-paths` data dir
- New runtime artifact: `daemon.log` per watch-dir instance under `env-paths` data dir
- `proper-lockfile` dependency removed from `centers/cli`
- No new npm dependencies; daemon spawning uses `process.execPath` (runtime-agnostic, no Bun hardcoding)
