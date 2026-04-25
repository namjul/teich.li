## Context

txtatelier currently runs as a foreground process that blocks the terminal and dies when the terminal closes. There is no way to ask "is it running?" without keeping the terminal open. This design makes txtatelier a managed background service.

The reference implementation is [busytown-pi](https://github.com/gordonbrander/busytown-pi), which solves the same daemon lifecycle problem. Several modules from that codebase are adapted here; others are explicitly excluded.

Current state:
- `cli.ts` starts sync in the foreground, exits on SIGINT/SIGTERM
- Instance uniqueness enforced via `proper-lockfile` (file lock in cache dir)
- No subcommands beyond `start` (implicit) and `owner`
- Logger writes to console only

## Goals / Non-Goals

**Goals:**
- Daemon survives terminal close
- `start`, `stop`, `ps`, `attach` subcommands
- State file as the universal discovery and liveness mechanism
- `--watch-dir` as the consistent instance identifier across all subcommands

**Non-Goals:**
- Start-on-login (systemd/launchd integration) — user responsibility for now
- `--foreground` flag — deferred; not needed without systemd
- Status fields beyond PID, watch dir, and last heartbeat (`fileCount`, `relayConnected`) — deferred
- Multiple watch directories in a single daemon instance
- Log rotation

## Decisions

### State file supersedes proper-lockfile

**Decision:** Remove `proper-lockfile`. Use the daemon state file (`daemon-state.json`) + `kill(pid, 0)` as the sole duplicate-prevention mechanism.

**Rationale:** `proper-lockfile` was a second artifact with its own stale threshold and cleanup semantics. The state file is already required for daemon discovery — it already contains the PID, so liveness checking is `kill(pid, 0)` with no additional dependency. A stale state file (PID dead) is cleaned up and overwritten on next start, giving the same crash recovery semantics.

**Alternative considered:** Keep both. Rejected: two mechanisms for the same invariant, neither authoritative.

---

### Startup confirmation via state file polling

**Decision:** After spawning the daemon, the parent polls for the state file to appear (up to a timeout) before printing confirmation and exiting. Poll parameters: 20 iterations × 250ms = 5 seconds maximum wait.

**Rationale:** The alternative is an IPC channel (Node `child_process` `ipc` stdio option). IPC is simpler but not portable to Deno, which txtatelier may eventually target. Polling the state file is runtime-agnostic and produces the same result: the parent knows the daemon is alive before reporting success.

**Alternative considered:** IPC channel. Rejected: Deno portability gap; polling is only slightly slower.

---

### Runtime-agnostic daemon spawn

**Decision:** Spawn the daemon using `process.execPath` as the executable, passing the same entry point file as argv[0].

**Rationale:** Hardcoding `bun` or `node` breaks when the binary is installed via a different runtime or path. `process.execPath` is always the correct runtime for the currently running process.

**Daemon mode signal:** The daemon is spawned as `txtatelier start --watch-dir <resolvedWatchDir> --log <logPath>`. The `--log` flag is both the daemon mode signal and the log path. When `txtatelier start` detects `--log`, it redirects stdout/stderr to the log file and runs the sync loop directly. When `--log` is absent, `txtatelier start` spawns a daemon child and exits.

**busytown-pi:** Identical pattern — spawns `busytown start --log <path>` with `--log` as the daemon signal.

---

### No-args shows help (not foreground, not status)

**Decision:** `txtatelier` with no arguments prints help and exits 0. The foreground behavior moves exclusively to `txtatelier start`.

**Rationale:** A service tool's default should orient the user, not start a process. "What can I do?" is the right answer when nothing is specified. Running `ps` requires scanning state files, which is non-trivial for a default; foreground silently contradicts the daemon model.

**busytown-pi:** `txtatelier` with no args shows help — same decision.

---

### `--watch-dir` as universal instance identifier

**Decision:** All subcommands (`start`, `stop`, `attach`) resolve the watch directory using the same `resolveConfiguredWatchDir` logic: explicit `--watch-dir` flag, then configured default. `ps` is the only subcommand that scans all instances (no `--watch-dir` needed).

**Rationale:** Consistent mental model — the watch directory is the identity of an instance. No pickers, no implicit "current" selection logic per subcommand.

---

### Start when already running: informational, exit 0

**Decision:** If `txtatelier start` finds a live daemon for the resolved watch dir, it prints an informational message and exits 0.

**Rationale:** The desired outcome (daemon running for that dir) is already achieved. Exiting non-zero would make `start` hostile to idempotent invocation (shell scripts, startup hooks). The `spawnDaemon` function enforces this internally so the check is consistent whether called from CLI or programmatically.

---

### Stop: SIGTERM → poll → SIGKILL

**Decision:** `txtatelier stop` sends SIGTERM, polls until the PID is gone (using `abortableSleep` between polls), and sends SIGKILL if the daemon does not exit within the timeout. Poll parameters: 10 iterations × 500ms = 5 seconds before SIGKILL.

**busytown-pi:** Same pattern (without SIGKILL fallback — txtatelier adds it).

---

### Attach: JSON lines command protocol

**Decision:** The Unix socket uses newline-delimited JSON in both directions. The attach client parses user input, constructs a typed command, and sends it as a single JSON line. The daemon responds with a single JSON line. `bindShortcuts` lives entirely in the attach client — the daemon never calls it.

Command schema:
```ts
type DaemonCommand =
  | { type: "showStatus" }
  | { type: "showMnemonic" }
  | { type: "restoreMnemonic"; mnemonic: string }
  | { type: "resetOwner" }
```

Response schema: `{ ok: boolean; output: string }` — `output` is the text to display to the user, with embedded newlines where needed. On unknown or malformed commands the daemon responds with `{ ok: false, output: "Unknown command: ..." }` rather than closing the connection.

**Rationale:** Keeping `bindShortcuts` and all readline logic in the attach client preserves a clean UI/logic boundary — the client owns all user interaction, the daemon receives typed directives and returns structured output. A text pipe would have required the daemon to host readline and shortcut-parsing logic, mixing UI and business logic.

**Alternative considered:** Plain-text pipe. Rejected: required `bindShortcuts` to live in the daemon, blurring the UI/logic boundary.

---

### Attach: detach does not stop daemon

**Decision:** Ctrl+C and `q` + Enter both detach the client without stopping the daemon. There is no in-band stop key in attach mode.

**`q` and `c` are client-side only:** The attach client intercepts `q` + Enter and closes the socket without sending a command to the daemon. `c` + Enter clears the client's local terminal (`process.stdout.write('\x1Bc')`) without involving the daemon. Ctrl+C is handled by the client catching SIGINT and closing the connection. Neither `q` nor `c` is sent over the socket.

**Rationale:** The daemon's lifecycle is independent of attach sessions. To stop the daemon, use `txtatelier stop`. Having a stop-from-attach key creates two paths to the same operation, one of which is hidden and discoverable only by accident.

**Alternative considered:** `x` + Enter to stop-and-detach. Rejected: redundant with `txtatelier stop`.

---

### Attach: multiple clients, blank slate

**Decision:** The daemon accepts any number of concurrent attach connections. Each connection is an independent command/response channel — there is no output broadcast. No output history is replayed on connect.

**Command serialization:** The daemon serializes command execution across all connections via a mutex (promise chain). Two clients sending commands simultaneously are processed sequentially. This eliminates concurrent mutation of session state without per-command locking at the session level.

**Rationale:** Multiple clients fall out naturally from a Unix socket server accepting multiple connections. Serialization is necessary because session methods that mutate owner state (`restoreMnemonic`, `resetOwner`) are not safe to run concurrently. History replay requires a ring buffer with no clear benefit over simply reconnecting.

---

### Logger: stdout/stderr redirect in daemon mode

**Decision:** When `--log <path>` is present, `process.stdout.write` and `process.stderr.write` are patched at daemon startup to redirect output to the log file stream (append mode). `logger.ts` is unchanged. No new file driver or logger module is added. Output is not tee'd to attach clients — daemon log output is observable only via `daemon.log`.

**Rationale:** All logging ultimately calls `console.*`, which calls `process.stdout.write` or `process.stderr.write`. Patching at the stream level requires zero changes to any other module. picocolors auto-disables ANSI codes when `process.stdout.isTTY` is falsy (which it is in daemon mode), so log file output is clean plaintext without extra work. Attach clients receive command responses over the socket; daemon log output is a separate concern.

**busytown-pi:** Identical approach — patches `process.stdout.write` and `process.stderr.write` when `--log` is provided.

---

### cleanupGroupAsync: cli.ts only

**Decision:** `cleanupGroupAsync` (from `lib/cleanup.ts`) is adopted in `cli.ts` to consolidate signal handler teardown. It is not threaded into `file-sync/index.ts` in this change.

**Rationale:** `file-sync` has its own `session.stop()` sequence that is proven and stable. Refactoring it is out of scope. `lib/cleanup.ts` is authored as a standalone utility (no CLI coupling) to make future adoption easy.

---

### abortableSleep: daemon startup polling loop only

**Decision:** `abortableSleep` (from `lib/promise.ts`) is used in the daemon startup polling loop in `daemon.ts`. It is not threaded into `file-sync` internals.

**Rationale:** `file-sync` uses event-driven wakeups (filesystem watcher, Evolu subscriptions) — it does not busy-poll, so `abortableSleep` adds nothing there.

---


### Instance directory hash

**Decision:** The hash key for each instance subdirectory is sha256 of the resolved watch dir path, truncated to 8 hex characters — identical to the existing lockfile path derivation in `InstanceLock.ts`.

**Rationale:** Reuses existing logic; collision probability across realistic watch dir counts (tens) is negligible.

---

### bindShortcuts: attach client only, command callbacks replace SessionDep

**Decision:** `bindShortcuts` is called only in the attach client process, not in the daemon. `SessionDep` is replaced with a narrow `ShortcutCommands` interface of plain async callbacks:

```ts
interface ShortcutCommands {
  showStatus: () => Promise<string>;
  showMnemonic: () => Promise<string>;
  restoreMnemonic: (mnemonic: string) => Promise<string>;
  resetOwner: () => Promise<string>;
  clearScreen: () => void;
  quit: () => void;
}
```

The attach client provides these callbacks as socket-command wrappers (e.g. `showStatus` sends `{ type: "showStatus" }`, awaits `{ ok, output }`, returns `output`). `bindShortcuts` calls the callback, receives the output string, and prints it via `deps.logger.info`. The `isTTY` property on `TTYDep` is renamed to `isInteractive`; the attach client always passes `isInteractive: true`.

**Rationale:** The attach client has no real session — only a socket connection. A proxy that fakes `FileSyncSession` would implement far more surface than `bindShortcuts` actually uses. Narrow callbacks make the dependency explicit and require no fake object.

---

### Clipboard fallback removed from mnemonic restore

**Decision:** The clipboard fallback in `readMnemonicLine` (the empty-line → `clipboard.readSync()` path) is removed. Users type the mnemonic directly. The `clipboardy` dependency is dropped entirely. In the new attach model, the client collects the full mnemonic string via `readline.question` and sends it as `{ type: "restoreMnemonic", mnemonic: string }` — the daemon calls `session.restoreMnemonic(mnemonic)` directly with no readline callback.

**Rationale:** The clipboard fallback was a terminal convenience that adds complexity with no benefit in the new client-collects-then-sends model. `session.restoreMnemonic` signature changes from `(readLine: ReadLineFn) => Promise<void>` to `(mnemonic: string) => Promise<string>`.

---

### Session methods return output strings

**Decision:** All session methods that produce user-visible output (`showStatus`, `showMnemonic`, `restoreMnemonic`, `resetOwner`) return `Promise<string>` instead of writing to the logger. The daemon command handler captures the return value and sends it as `response.output`. Errors are caught and returned as `{ ok: false, output: error.message }`.

**Rationale:** The daemon cannot write command output to stdout (which goes to the log file) and simultaneously send it to a specific socket client. Returning output as a string is the clean boundary: session logic produces a value, the command handler routes it.

---

### `session.quit()` removed

**Decision:** `session.quit()` is removed. Daemon shutdown happens exclusively via SIGTERM (sent by `txtatelier stop`). The SIGTERM handler calls `session.stop()` directly.

**Rationale:** With no foreground mode and no in-band stop key in attach mode, `session.quit()` has no callers.

---

### Daemon startup log entry

**Decision:** When the daemon starts in `--log` mode, the first log entry is a plain structured line: `[txtatelier] daemon started pid=<pid> watchDir=<path> version=<version>`. The `printStartupBanner` call is suppressed in daemon mode — the banner is a foreground terminal artifact.

**Rationale:** The log file is the only pre-attach observability surface. A scannable structured line (with timestamp from the logger) is more useful than an ANSI-stripped banner.

---

### Attach: welcome output

**Decision:** On successful connection, the attach client calls `printStartupBanner` (unchanged) and then prints one additional line: `➜  Attached: <watchDir> (pid <pid>)`. The watch dir and PID are read from the state file before connecting.

**Rationale:** The banner provides version context; the extra line confirms which instance the client is talking to, which matters when multiple daemons are running.

---

### Attach: daemon crash detection

**Decision:** When the socket closes from the daemon side (unexpected — not initiated by `q` or Ctrl+C), the attach client prints `[txtatelier] daemon disconnected` and exits non-zero.

**Rationale:** Distinguishes crash from normal detach; signals to the user that investigation is needed.

---

### Stale socket file cleanup

**Decision:** When `getDaemonStatus` finds a state file whose PID is dead, it removes both the state file and the socket file (path read from the state file before removal) in the same step.

**Rationale:** A stale socket file causes `EADDRINUSE` on the next daemon start. Cleaning it alongside the state file is the natural place — any caller that checks liveness will trigger the cleanup automatically, with no separate startup step needed.

---

### State file removal ordering on shutdown

**Decision:** The SIGTERM handler removes the state file (and socket file) as the last act before `process.exit(0)`, after `session.stop()` completes.

**Rationale:** Keeps the invariant that state file present = process running or in graceful shutdown. A new `start` during shutdown would see the PID alive via `kill(pid, 0)` and correctly wait rather than racing.

---

### `logs` command dropped

**Decision:** `txtatelier logs` is not implemented. The log file path is stored in the state file; users can open it directly.

**Rationale:** The command would only add value for reading historical output before an attach connection — a narrow use case that doesn't justify the implementation. `txtatelier attach` covers real-time observation.

---

## Risks / Trade-offs

**State file polling has a startup latency window** → The parent waits up to the polling timeout before reporting failure. In practice the daemon writes the state file within milliseconds of startup. Timeout chosen to be long enough for slow machines, short enough to feel responsive.

**Command serialization adds head-of-line blocking** → A slow command (e.g. `restoreMnemonic` waiting on Evolu) blocks all other attached clients from receiving responses. Acceptable: simultaneous attach sessions are rare, and all commands are fast in practice.

**Plain-text log format is not machine-parseable** → Structured fields (log level filtering, JSON ingestion) are not possible without post-processing. Acceptable tradeoff: the audience is humans inspecting the log file directly, not log aggregators.

**`kill(pid, 0)` has a TOCTOU window** → Between reading the PID and sending SIGTERM, the process could die and a new process could reuse the PID. Extremely unlikely in practice (PID reuse takes thousands of intervening process births). busytown-pi accepts the same risk.

## Open Questions

None — all architectural decisions resolved during design interview.
