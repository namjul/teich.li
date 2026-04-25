## ADDED Requirements

### Requirement: Start command launches detached background daemon

`txtatelier start [--watch-dir <path>]` SHALL spawn the CLI as a detached background process that survives terminal close. The spawn SHALL use `process.execPath` (not a hardcoded runtime binary) and pass `start --watch-dir <resolvedWatchDir> --log <logPath>` as arguments. The spawned process SHALL run with `detached: true`, `stdio: 'ignore'`, and `child.unref()`. The parent SHALL poll the state file to confirm startup before exiting. Poll parameters: 20 iterations × 250ms (5 second maximum).

The `--log` flag is the daemon mode signal: when present, `txtatelier start` redirects stdout/stderr to the log file and runs the sync loop directly instead of spawning a child.

#### Scenario: Successful daemon start

- **WHEN** the user runs `txtatelier start` and no daemon is running for that watch directory
- **THEN** a detached background process is spawned and the state file appears within the polling timeout
- **THEN** the parent process prints a confirmation and exits 0

#### Scenario: Start when daemon already running

- **WHEN** the user runs `txtatelier start` and a live daemon is already running for that watch directory
- **THEN** the CLI prints an informational message (not an error) identifying the running instance
- **THEN** the process exits 0

#### Scenario: Runtime-agnostic spawn

- **WHEN** `txtatelier start` spawns the daemon
- **THEN** the child process is launched via `process.execPath` with no hardcoded runtime path

### Requirement: Stop command terminates a running daemon

`txtatelier stop [--watch-dir <path>]` SHALL send SIGTERM to the daemon PID from the state file, poll until the process is dead, and send SIGKILL if it does not exit within a timeout. Poll parameters: 10 iterations × 500ms (5 seconds before SIGKILL).

#### Scenario: Graceful stop

- **WHEN** the user runs `txtatelier stop` and a daemon is running for that watch directory
- **THEN** SIGTERM is sent to the daemon PID
- **THEN** the CLI polls until the process is gone and exits 0

#### Scenario: Forceful stop on timeout

- **WHEN** the daemon does not exit within the SIGTERM timeout
- **THEN** SIGKILL is sent and the CLI exits 0

#### Scenario: Stop when not running

- **WHEN** the user runs `txtatelier stop` and no daemon is running for that watch directory
- **THEN** the CLI prints an error and exits with a non-zero code

### Requirement: ps command lists all running instances

`txtatelier ps` SHALL scan all instance state files, check liveness of each PID via `kill(pid, 0)`, display running instances, and remove stale state files.

#### Scenario: One or more instances running

- **WHEN** the user runs `txtatelier ps` and one or more daemons are running
- **THEN** each running instance is shown as two lines: `● <watchDir> (pid <pid>, last seen <Xs> ago)` followed by `  log: <logPath>`

#### Scenario: No instances running

- **WHEN** the user runs `txtatelier ps` and no daemons are running
- **THEN** the CLI prints a message indicating no instances are running and exits 0

#### Scenario: Stale state file cleanup

- **WHEN** `txtatelier ps` finds a state file whose PID is not alive
- **THEN** the stale state file is removed and that instance is not shown as running

### Requirement: Daemon state file

The daemon SHALL write a state file atomically at startup and update it periodically as a heartbeat. The state file SHALL be removed on clean shutdown.

State file schema:
- `pid`: process ID of the running daemon
- `watchDir`: resolved absolute watch directory path
- `socketPath`: absolute path to the Unix socket
- `logPath`: absolute path to the daemon log file
- `startedAt`: ISO 8601 timestamp of daemon start
- `updatedAt`: ISO 8601 timestamp, refreshed every 30 seconds

#### Scenario: State file written at startup

- **WHEN** the daemon starts successfully
- **THEN** a state file is written atomically at `instances/{hash}/daemon-state.json` before the parent's polling timeout elapses

#### Scenario: Heartbeat updates state file

- **WHEN** 30 seconds have elapsed since the last state file write
- **THEN** the state file is rewritten atomically with the current `updatedAt` timestamp

#### Scenario: State file removed on clean shutdown

- **WHEN** the daemon receives SIGTERM and completes graceful shutdown
- **THEN** the state file is removed after `session.stop()` completes, as the last act before process exit

#### Scenario: Stale detection and cleanup

- **WHEN** a state file exists but `kill(pid, 0)` fails for the stored PID
- **THEN** the process is considered dead; the state file and the socket file (path read from the state file) are both removed; the instance is reported as not running

### Requirement: Instance scoping per watch directory

All per-instance runtime artifacts SHALL be stored under a hash-derived subdirectory of the env-paths data directory so multiple daemons for different watch directories coexist without conflict.

Path pattern: `<data-dir>/instances/<hash(resolvedWatchDir)>/`

Hash: sha256 of the resolved absolute watch dir path, truncated to 8 hex characters.

Artifacts under that directory:
- `daemon-state.json`
- `txtatelier.sock`
- `daemon.log`

#### Scenario: Two daemons for different directories

- **WHEN** the user runs `txtatelier start --watch-dir ~/notes` and `txtatelier start --watch-dir ~/journal`
- **THEN** each daemon writes to its own instance directory with no filename collisions

### Requirement: Default command shows help

`txtatelier` with no subcommand argument SHALL display help output listing available subcommands and exit 0.

#### Scenario: No arguments

- **WHEN** the user runs `txtatelier` with no arguments
- **THEN** help text is printed listing available subcommands
- **THEN** the process exits 0
