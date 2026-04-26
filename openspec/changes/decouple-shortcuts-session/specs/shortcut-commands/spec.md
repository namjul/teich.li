## ADDED Requirements

### Requirement: ShortcutCommands interface

A `ShortcutCommands` interface SHALL be defined in `shortcuts.ts` as the sole dependency type for `bindShortcuts`. It SHALL consist of narrow async callbacks only: `showStatus`, `showMnemonic`, `restoreMnemonic(mnemonic: string)`, `resetOwner` (each returning `Promise<string>`), plus synchronous `clearScreen` and `quit` (returning `void`). No reference to `FileSyncSession` SHALL appear in `shortcuts.ts`.

#### Scenario: Callback invocation

- **WHEN** the user submits a shortcut key
- **THEN** `bindShortcuts` calls the corresponding `ShortcutCommands` callback and prints the returned string via `logger.info`

#### Scenario: Foreground session wiring

- **WHEN** `bindShortcuts` is called from the foreground CLI
- **THEN** the `ShortcutCommands` callbacks are thin wrappers over the real `FileSyncSession` methods
- **THEN** `bindShortcuts` has no direct dependency on `FileSyncSession`

### Requirement: isInteractive replaces isTTY on TTYDep

`TTYDep` SHALL expose `isInteractive: boolean` instead of `isTTY: boolean`. `bindShortcuts` SHALL gate shortcut binding on `deps.isInteractive`. The value produced by `computeStdinInteractive` is unchanged.

#### Scenario: Interactive terminal

- **WHEN** `isInteractive` is `true` and `readline` is non-null
- **THEN** shortcuts are bound and the help hint is printed

#### Scenario: Non-interactive environment

- **WHEN** `isInteractive` is `false`
- **THEN** `bindShortcuts` logs that shortcuts are disabled and returns a no-op cleanup

### Requirement: Clipboard fallback removed

`readMnemonicLine` SHALL NOT read from the system clipboard. When the user provides an empty line at the mnemonic prompt, the empty string SHALL be passed to `restoreMnemonic` unchanged. The `clipboardy` package SHALL be removed as a dependency.

#### Scenario: Empty mnemonic input

- **WHEN** the user submits an empty line at the mnemonic prompt
- **THEN** `restoreMnemonic` is called with an empty string
- **THEN** no clipboard read is attempted
