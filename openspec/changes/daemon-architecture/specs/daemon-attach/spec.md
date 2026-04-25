## ADDED Requirements

### Requirement: Attach command connects a client to a running daemon

`txtatelier attach [--watch-dir <path>]` SHALL resolve the watch directory using the same logic as all other subcommands (explicit flag or configured default), read the daemon state file to obtain the socket path and PID, print a welcome header, and open a bidirectional JSON lines connection to that instance's Unix socket.

Welcome output on successful connection:
1. `printStartupBanner` (version, connection duration)
2. `➜  Attached: <watchDir> (pid <pid>)`

#### Scenario: Attach to running instance

- **WHEN** the user runs `txtatelier attach` and a daemon is running for the resolved watch directory
- **THEN** the client connects to that daemon and prints the welcome header

#### Scenario: Attach with explicit watch directory

- **WHEN** the user runs `txtatelier attach --watch-dir <path>`
- **THEN** the client connects to the daemon for that specific watch directory

#### Scenario: No daemon running for resolved directory

- **WHEN** the user runs `txtatelier attach` and no daemon is running for the resolved watch directory
- **THEN** the CLI prints an error and exits with a non-zero code

### Requirement: JSON lines command protocol

The Unix socket SHALL carry newline-delimited JSON in both directions. The attach client sends typed command objects; the daemon responds with a single `{ ok: boolean; output: string }` object per command. The connection remains open for multiple command/response cycles.

Command schema:
```ts
type DaemonCommand =
  | { type: "showStatus" }
  | { type: "showMnemonic" }
  | { type: "restoreMnemonic"; mnemonic: string }
  | { type: "resetOwner" }
```

Response schema: `{ ok: boolean; output: string }` — `output` is the text to display, with embedded newlines where needed.

#### Scenario: Shortcut sends command, client prints response

- **WHEN** the user types a shortcut key + Enter while attached
- **THEN** the attach client sends the corresponding JSON command over the socket
- **THEN** the daemon executes the command and sends a JSON response
- **THEN** the attach client prints `response.output` to stdout

#### Scenario: Unknown or malformed command

- **WHEN** the daemon receives a line that is not valid JSON or has an unknown `type`
- **THEN** the daemon responds with `{ ok: false, output: "Unknown command: ..." }`
- **THEN** the connection remains open

### Requirement: `bindShortcuts` lives in the attach client only

The attach client SHALL call `bindShortcuts` with `isInteractive: true` against a `readline.createInterface({ input: process.stdin, output: process.stdout })`. The daemon SHALL NOT call `bindShortcuts`. All user interaction (shortcut parsing, mnemonic prompting) happens in the client process.

#### Scenario: Mnemonic restore (`p` shortcut)

- **WHEN** the user types `p` + Enter while attached
- **THEN** the attach client prompts for mnemonic words via `readline.question`
- **THEN** the client sends `{ type: "restoreMnemonic", mnemonic: "<collected words>" }` to the daemon
- **THEN** the daemon calls `session.restoreMnemonic(mnemonic)` and returns the result string

### Requirement: Detach without stopping daemon

The attach client SHALL exit without stopping the daemon when the user detaches. Both detach signals are handled client-side and SHALL NOT be sent to the daemon as commands.

#### Scenario: Detach with Ctrl+C

- **WHEN** the user presses Ctrl+C while attached
- **THEN** the client catches SIGINT, closes the socket connection, and exits 0; the daemon continues running

#### Scenario: Detach with q

- **WHEN** the user types `q` + Enter while attached
- **THEN** the client closes the socket connection and exits 0; the daemon continues running; no command is sent to the daemon

#### Scenario: Clear screen with c

- **WHEN** the user types `c` + Enter while attached
- **THEN** the client clears its local terminal; no command is sent to the daemon

### Requirement: Multiple simultaneous attach clients

The daemon SHALL accept and serve multiple concurrent attach connections on the same Unix socket. Each connection is an independent command/response channel. The daemon SHALL serialize command execution across all connections via a mutex so that session-mutating commands (`restoreMnemonic`, `resetOwner`) never run concurrently.

#### Scenario: Two clients attached simultaneously

- **WHEN** two terminals each run `txtatelier attach` for the same watch directory
- **THEN** each client can independently send commands and receive responses
- **THEN** commands from both clients are processed sequentially by the daemon

### Requirement: Blank slate on connect

The attach client SHALL NOT replay prior daemon output. The log file is available for inspection of historical output.

#### Scenario: Connect after daemon has been running

- **WHEN** a client connects to a daemon that has been running for an extended period
- **THEN** the client sees only its welcome header and subsequent command responses

### Requirement: Daemon crash detection

The attach client SHALL detect when the daemon closes the socket unexpectedly and exit with an error.

#### Scenario: Daemon crashes while client is attached

- **WHEN** the daemon process dies while one or more clients are attached
- **THEN** each affected client prints `[txtatelier] daemon disconnected` and exits non-zero
