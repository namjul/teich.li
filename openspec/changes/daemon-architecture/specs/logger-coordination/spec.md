## ADDED Requirements

### Requirement: stdout/stderr redirect in daemon mode

When `--log <path>` is present, `process.stdout.write` and `process.stderr.write` SHALL be patched at startup to write to the log file stream (append mode). Output is not tee'd to socket clients — attach clients receive command responses over the socket only; daemon log output is observable via `daemon.log` directly. No changes to `logger.ts` are required.

Log file location: `<data-dir>/instances/<hash(watchDir)>/daemon.log`

#### Scenario: Daemon mode routes to log file

- **WHEN** the daemon process starts with `--log <path>`
- **THEN** all `console.*` output is appended to the log file and nothing is written to the terminal

#### Scenario: Foreground mode routes to console

- **WHEN** the CLI runs in foreground mode (no `--log` flag)
- **THEN** all log output goes to the console as before, unchanged

#### Scenario: Log file append

- **WHEN** the daemon is restarted after a previous run
- **THEN** new log lines are appended to the existing log file without truncating prior content
