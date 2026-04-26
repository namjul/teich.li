## MODIFIED Requirements

### Requirement: TTY-gated readline shortcuts

The CLI SHALL detect interactive stdin using `process.stdin.isTTY` and absence of a truthy `CI` environment value. When interactive, the CLI SHALL bind a single readline interface with an empty visible prompt and SHALL accept single-letter commands followed by Enter (`h`, `u`, `s`, `p`, `d`, `c`, `q`). When not interactive, the CLI SHALL log that shortcuts are disabled and SHALL NOT create a readline interface. `bindShortcuts` SHALL accept `isInteractive` (not `isTTY`) on its `TTYDep` parameter.

#### Scenario: Foreground terminal

- **WHEN** the user runs the default start command in a TTY with `CI` unset
- **THEN** the process prints a startup banner and a hint to press `h` + Enter for help
- **THEN** readline accepts shortcut lines after the prompt

#### Scenario: Background or CI

- **WHEN** stdin is not a TTY or `CI` is set to a truthy sentinel
- **THEN** the process logs `Running non-interactive (shortcuts disabled)`
- **THEN** no readline interface is bound for shortcuts

### Requirement: Shortcut semantics

The CLI SHALL map shortcuts as follows: `u` status, `s` show mnemonic for manual copy, `p` restore mnemonic from a prompted line, `d` reset owner immediately without confirmation, `c` clear the visible viewport without destroying scrollback, `q` quit, `h` help listing shortcuts. The CLI SHALL ignore unknown single-letter input without exiting. For each shortcut that produces output, `bindShortcuts` SHALL print the string returned by the corresponding `ShortcutCommands` callback via `logger.info`.

#### Scenario: Help

- **WHEN** the user submits `h` + Enter
- **THEN** the CLI prints a help block listing all shortcuts

#### Scenario: Shortcut output printed

- **WHEN** the user submits `u` + Enter
- **THEN** `bindShortcuts` calls `showStatus()`, receives the output string, and prints it via `logger.info`
