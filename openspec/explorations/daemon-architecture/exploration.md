# Daemon Architecture Exploration

**Source:** Comparison of busytown-pi's daemon pattern against txtatelier's current foreground-only CLI

**Reference:** https://github.com/gordonbrander/busytown-pi — relevant files: `src/cli.ts`, `src/daemon.ts`, `src/daemon-state.ts`, `src/process-system.ts`, `src/dashboard.ts`, `src/index.ts`, `src/lib/cleanup.ts`, `src/lib/promise.ts`, `src/lib/json-logger.ts`

**Trigger:** txtatelier currently has no way to run in the background. The process blocks the terminal and dies when the terminal closes.

---

## The Problem

```
txtatelier          ← blocks terminal
Ctrl+C              ← sync stops
close terminal      ← sync stops (SIGHUP)
```

There is no way to ask "is txtatelier running?" without having the terminal open. Sync is tied to a session.

---

## What busytown-pi Does

busytown-pi separates three distinct concerns:

```
daemon-state.ts   — PID file + liveness check
                    atomically written JSON: { daemon, processes, updatedAt, agentsDir }
                    isProcessAlive(pid) via kill(pid, 0)
                    getDaemonStatus() cleans up stale files if PID is dead

daemon.ts         — spawn/stop the CLI as a detached background process
                    spawn(..., { detached: true, stdio: 'ignore' })
                    child.unref()  ← detaches from parent event loop
                    polls state file to confirm startup

process-system.ts — supervise multiple child processes with auto-restart
                    exponential backoff, SIGTERM→SIGKILL escalation
                    (NOT relevant to txtatelier — different problem domain)
```

---

## Two OS Features a Daemon Enables

### Surviving terminal close

`detached: true` moves the child into its own process group — no longer a child of the shell session. `stdio: 'ignore'` closes the inherited file descriptors tied to the terminal. `child.unref()` tells the runtime not to wait for it. After the parent exits, the child is owned by PID 1.

Close the terminal — txtatelier keeps syncing.

### Startup on login

A separate OS-level layer (systemd user service on Linux, launchd plist on macOS) starts the daemon automatically on login. These two features are independent — you can have one without the other.

---

## The TTY Conflict Was Overstated

The code already handles the foreground/daemon distinction gracefully:

- `computeStdinInteractive()` checks `process.stdin.isTTY`
- `bindShortcuts()` returns a no-op when `!isTTY`
- `canClearViewport()` guards all screen-clearing behind `process.stdout.isTTY`

A daemon running without a terminal naturally falls into the non-interactive path with **no code changes needed**. The file watching and Evolu sync are unaffected.

What each shortcut becomes in daemon mode:

| Shortcut | What it does | Daemon equivalent |
|---|---|---|
| `u` | show status | `txtatelier status` (new) |
| `s` | show mnemonic | `txtatelier owner --show` (exists) |
| `p` | restore mnemonic | foreground-only (needs interactive stdin) |
| `d` | reset owner | `txtatelier owner --reset --yes` (exists) |
| `c` | clear viewport | meaningless in daemon mode |
| `q` | quit | `txtatelier stop` (new) |

---

## Daemon-State vs Socket

Two distinct artifacts, solving different problems.

**State file** — passive, always-readable JSON on disk:
- Answers "is it running?" via `kill(pid, 0)` without connecting
- Enables discovery of all running instances by scanning a directory
- Confirms startup: parent polls for file to appear after `spawn()`
- Handles crash detection: file exists but PID is dead → stale, clean up
- Public API for any tool (editor plugin, status bar, shell script) to read
- Written by daemon, readable by anyone, no connection required

**Socket** — interactive, bidirectional channel:
- Carries live communication: commands in, output out
- Requires daemon alive and client connected
- Cannot answer "is anything running?" — only usable when you already know it is

The state file is what makes the socket findable and meaningful.

---

## Multiple Instances

txtatelier already scopes everything per watch directory via hash:

```
instance lock:  ~/.cache/txtatelier/instance-locks/{hash(watchDir)}.lock
DB:             ~/.local/share/txtatelier/txtatelier-{hash(watchDir)}.db
```

Multiple daemons for different watch dirs coexist naturally. Daemon state files and sockets follow the same pattern:

```
~/.local/share/txtatelier/instances/{hash}/daemon-state.json
~/.local/share/txtatelier/instances/{hash}/txtatelier.sock
```

`txtatelier start` (same dir twice) → reads state file, checks PID, errors if alive.
`txtatelier start --watch-dir ~/journal` → different hash, independent daemon.

**busytown-pi's stop command** stops one instance scoped to a project root — not all. There is no stop-all. `txtatelier stop` follows the same model.

---

## The API Shape

Mental model: **a service you manage**, not a command you run.

```bash
txtatelier start [--watch-dir]   # launch daemon for that dir
txtatelier stop  [--watch-dir]   # stop one instance (not all)
txtatelier status                # list all running instances
txtatelier attach [--watch-dir]  # connect interactive TUI
txtatelier logs  [--watch-dir]   # tail log file

txtatelier owner --show          # one-shot, no daemon needed
txtatelier owner --where
txtatelier owner --reset --yes
```

`txtatelier status` reads all state files and shows a summary:

```
  ~/notes    pid 8421  running  312 files  3s ago   ● connected
  ~/journal  pid 9102  running   88 files  1m ago   ◌ offline
```

---

## Attach

The attach client is a **pure text pipe** to the running daemon. No structured protocol needed.

```
attach client                        daemon
─────────────────────────────────────────────
readline → line ──────────────────►  receives line
                                     runs shortcut handler
                         ◄─────────  logger output (text)
terminal prints it
```

The socket replaces what was previously stdin and stdout. The daemon's existing shortcut handling (`bindShortcuts`) works unchanged. The `p` shortcut (multi-turn mnemonic restore) works naturally because the client forwards everything faithfully — daemon sends prompt text, client prints it, user types response, client sends it back.

**Attach selection** when multiple instances are running:

```
0 running  →  error: "No txtatelier instances running. Use 'txtatelier start'."
1 running  →  attach automatically
2+ running →  show picker

  Multiple txtatelier instances running. Select one:

    1  ~/notes    (312 files · 4s ago · connected)
    2  ~/journal   (88 files · 1m ago · offline)

    > _
```

Explicit selection skips the picker: `txtatelier attach --watch-dir ~/notes`.

**Daemon lifecycle is independent of attach.** Detaching does not stop the daemon. This is explicit in busytown-pi's `session_shutdown` handler: "Don't stop the daemon on exit — it's intentionally independent."

`store.ts` (busytown-pi's reactive state pattern) is **not needed** for attach. The core is a pipe, not a reactive UI. It would only become relevant if attach grows a persistent status bar with live-updating counters.

`dashboard.ts` (busytown-pi's editor widget) is a **different thing entirely** — a passive status widget embedded inside a coding agent editor, polling the state file, read-only. Not analogous to attach.

---

## Other Features a Daemon Makes Possible

**Near-free once the daemon exists:**
- Tailable structured logs: `txtatelier logs --since 1h --type conflict`
- On-demand operations without restart: `txtatelier pause`, `txtatelier flush`

**Larger investments:**
- Notification hooks: user-configurable shell commands on conflict/disconnect/error
- System tray / menu bar: reads state file, no Evolu knowledge needed
- Multiple watch directories managed by one daemon
- Health monitoring via `updatedAt` heartbeat in state file
- Scripting: git hooks, dotfiles managers, shutdown scripts

**The unifying idea:** a persistent process is addressable. Foreground processes are disposable — they live and die with a session. A daemon is a service with a stable address (PID, state file, socket) that any process can find and talk to.

---

## What to Borrow from busytown-pi

| Piece | Borrow? | Notes |
|---|---|---|
| `daemon-state.ts` | Yes, nearly verbatim | PID file + stale cleanup |
| `daemon.ts` | Yes, adapted | Use `process.execPath` not a hardcoded runtime |
| `cleanupGroupAsync` | Yes | Replace ad-hoc teardown in cli.ts and file-sync |
| `abortableSleep` | Yes | Thread AbortSignal through internal loops |
| JSON logger driver model | Partially | Absorb into existing `logger.ts`, not a new module |
| `process-system.ts` | No | txtatelier doesn't manage child processes |
| `store.ts` | No (yet) | Only if reactive dashboard UI is built |
| `dashboard.ts` | No | Editor-specific, different problem |

---

## Key Constraints

- **No Bun hardcoding** in daemon spawn. Use `process.execPath` — runtime-agnostic.
- **Stop is per-instance**, not all. `txtatelier stop --watch-dir ~/journal` stops that one.
- **Daemon lifecycle is independent of attach.** Detach ≠ stop.
- **Single logger module.** `logger.ts` adapts output strategy (console vs file) by configuration. No parallel json-logger module.
- **State file is a public contract.** Schema should be stable enough for future editor integrations (VS Code extension, Neovim plugin) to read directly.
- **Double idempotency in `spawnDaemon`.** Check liveness at both the function level and the call site — guards against concurrent start attempts.

---

## Open Questions

- Multiple simultaneous attach clients: allowed or one at a time? busytown-pi doesn't address it.
- Does `txtatelier` (no args) keep current foreground behavior, or error with "use start/attach"?
- Does startup-on-login belong in the binary (generating systemd/launchd units) or left to the user?
- Can the instance lock (proper-lockfile) be retired in favour of PID file tracking, or do they serve different purposes?
