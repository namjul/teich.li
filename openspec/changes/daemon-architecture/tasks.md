## 1. Foundation Utilities

- [ ] 1.1 Create `lib/cleanup.ts` with `cleanupGroupAsync` — copied verbatim from busytown-pi; registers teardown steps, runs them in reverse insertion order on dispose
- [ ] 1.2 Create `lib/promise.ts` with `abortableSleep` — copied verbatim from busytown-pi; sleep that resolves (not rejects) early when an AbortSignal fires

## 2. Daemon State Module

- [ ] 2.1 Create `daemon-state.ts`: define `DaemonState` interface and instance directory path helpers (derive path from `env-paths` data dir + `hash(resolvedWatchDir)`); on daemon startup, if a state file already exists at the derived path and its `watchDir` field does not match the resolved watch dir, log an error and exit — this surfaces an 8-char hash collision explicitly rather than silently corrupting state
- [ ] 2.2 Implement atomic write/read/remove for state file (tmp + rename pattern)
- [ ] 2.3 Implement `isProcessAlive` (`kill(pid, 0)`) and `getDaemonStatus` (liveness check + stale state file and socket file cleanup)
- [ ] 2.4 Implement `getAllDaemonStates` — scan all instance dirs, return live states, remove stale files

## 3. Logger Redirect

- [ ] 3.1 In daemon startup (when `--log` is present), patch `process.stdout.write` and `process.stderr.write` to write to the log file stream only (append mode); no tee to socket clients

## 4. Daemon Module

- [ ] 4.1 Create `daemon.ts`: implement `spawnDaemon` — spawns detached daemon via `process.execPath` passing `start --watch-dir <path> --log <logPath>`, polls state file to confirm startup, returns informational result if already running
- [ ] 4.2 Implement `stopDaemon` in `daemon.ts` — SIGTERM → poll until dead (using `abortableSleep`) → SIGKILL on timeout
- [ ] 4.3 Implement heartbeat loop in daemon process — rewrites state file atomically every 30 seconds

## 5. Unix Socket Layer

- [ ] 5.1 Implement socket server in daemon process — listens on `socketPath`, maintains a `Set` of active connections for shutdown cleanup; on new connection read newline-delimited JSON commands, execute via `handleCommand` (with mutex serialization), write `{ ok, output }` JSON response; on connection close remove from set
- [ ] 5.2 Implement `handleCommand` in daemon — switch on `DaemonCommand.type`, call the corresponding session method (which returns `Promise<string>`), return `{ ok: true, output }` or `{ ok: false, output: error.message }` on throw; unknown type returns `{ ok: false, output: "Unknown command: ..." }`; `handleCommand` must never throw — if it does, the mutex promise chain breaks and all subsequent commands deadlock
- [ ] 5.3 Implement socket client for `attach` command (`attach-client.ts`) — reads state file for socket path and PID, prints welcome header (`printStartupBanner` + `➜  Attached: <watchDir> (pid <pid>)`), creates readline against process.stdin/stdout, calls `bindShortcuts` with `isInteractive: true`; on shortcut: sends JSON command, awaits JSON response; if `response.ok` is `true` prints `response.output` to stdout, if `false` prints `response.output` to stderr; intercepts `q` + Enter and SIGINT client-side (close connection, exit 0); on `c` clears local terminal; on unexpected socket close prints `[txtatelier] daemon disconnected` and exits non-zero

## 6. Instance Lock Replacement

- [ ] 6.1 Replace `proper-lockfile` in instance lock implementation with state file + `kill(pid, 0)` check
- [ ] 6.2 Remove `proper-lockfile` from `centers/cli/package.json`

## 7. CLI Subcommands

- [ ] 7.1 Update `txtatelier start`: when `--log` is absent, spawn daemon via `spawnDaemon` and exit; when `--log` is present, apply stdout/stderr redirect (task 3.1) and run the sync loop directly
- [ ] 7.2 Add `--log` argument to `startCommand` in `cli.ts` with a plain description (shown in help)
- [ ] 7.3 Adopt `cleanupGroupAsync` in `cli.ts` to consolidate signal handler teardown; state file removal registered first so it runs last
- [ ] 7.4 Add `txtatelier stop [--watch-dir]` subcommand using `stopDaemon`
- [ ] 7.5 Add `txtatelier ps` subcommand — calls `getAllDaemonStates`, formats each running instance as two lines: `● <watchDir> (pid <pid>, last seen <Xs> ago)` followed by `  log: <logPath>`; prints `No txtatelier instances running.` when none found
- [ ] 7.6 Add `txtatelier attach [--watch-dir]` subcommand using socket client
- [ ] 7.7 Remove `default: "start"` from main command so `txtatelier` with no args shows help (BREAKING)
- [ ] 7.8 In `shortcuts.ts`: replace `SessionDep` with `ShortcutCommands` interface (narrow async callbacks: `showStatus`, `showMnemonic`, `restoreMnemonic`, `resetOwner`, `clearScreen`, `quit`); update `bindShortcuts` to call each callback and print its return string via `deps.logger.info`; for the `p` shortcut, defer the `readline.question` call via `setImmediate` before invoking it (Node readline re-entrancy: calling `readline.question` directly inside a `line` event handler consumes the next input line as the answer), then collect the mnemonic and apply `normalizeMnemonicInput` before passing it to `deps.restoreMnemonic`; rename `isTTY` to `isInteractive` on `TTYDep`; remove clipboard fallback from `readMnemonicLine`; remove `clipboardy` import and dependency
- [ ] 7.9 In `file-sync/index.ts`: refactor `showStatus`, `showMnemonic`, `resetOwner` to return `Promise<string>` instead of writing to logger; change `restoreMnemonic` signature to `(mnemonic: string) => Promise<string>`; remove `session.quit()`
