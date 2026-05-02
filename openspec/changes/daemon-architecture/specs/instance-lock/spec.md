## MODIFIED Requirements

### Requirement: Lock implementation characteristics

The instance lock SHALL use the daemon state file combined with PID liveness checking (`kill(pid, 0)`) as the sole mechanism for duplicate prevention. The `proper-lockfile` dependency SHALL be removed. A state file whose PID is not alive is stale and SHALL be cleaned up and overwritten by a new start.

#### Scenario: Stale lock after crash

- **WHEN** a previous process crashed without removing the state file and the stored PID is no longer alive
- **THEN** a new `teich start` for the same watch directory removes the stale state file and starts successfully

#### Scenario: Live daemon already running

- **WHEN** a state file exists for the resolved watch directory and `kill(pid, 0)` succeeds for the stored PID
- **THEN** the instance is considered live; `teich start` prints an informational message identifying the running instance and exits 0 without spawning a new daemon
