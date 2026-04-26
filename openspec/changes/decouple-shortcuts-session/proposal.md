## Why

`bindShortcuts` is coupled to `FileSyncSession` via a wide interface, and session methods mix business logic with presentation by calling the logger directly. This makes both modules harder to test and harder to reuse — `bindShortcuts` cannot work without a real session, and session methods cannot be inspected without capturing log output.

## What Changes

- Session methods `showStatus`, `showMnemonic`, `resetOwner`, and `restoreMnemonic` return `Promise<string>` instead of writing to the logger and returning `void`
- `restoreMnemonic` signature changes from `(readLine: ReadLineFn) => Promise<void>` to `(mnemonic: string) => Promise<string>` — the caller collects input, the session processes it
- `bindShortcuts` dependency on `SessionDep` (wide `FileSyncSession`) replaced with `ShortcutCommands` (narrow async callbacks); `bindShortcuts` prints the returned strings via `logger.info`
- `TTYDep.isTTY` renamed to `TTYDep.isInteractive`
- Clipboard fallback removed from `readMnemonicLine`; `clipboardy` dependency dropped

## Capabilities

### New Capabilities

- `shortcut-commands`: The `ShortcutCommands` narrow callback interface that decouples `bindShortcuts` from `FileSyncSession`

### Modified Capabilities

- `cli-interaction-loop`: `bindShortcuts` dependency type changes from `SessionDep` to `ShortcutCommands`; `isTTY` renamed to `isInteractive`; mnemonic restore flow changes (caller collects input, session receives string)
- `owner-management`: `restoreMnemonic` signature change; session methods return output strings instead of writing to logger

## Impact

- `centers/cli/src/shortcuts.ts` — replace `SessionDep` with `ShortcutCommands`, rename `isTTY` to `isInteractive`, remove `clipboardy` import and `readMnemonicLine` clipboard fallback, update `bindShortcuts` to call callbacks and print returned strings
- `centers/cli/src/file-sync/index.ts` — refactor `showStatus`, `showMnemonic`, `resetOwner` to return `Promise<string>`; change `restoreMnemonic` to `(mnemonic: string) => Promise<string>`
- `centers/cli/src/cli.ts` — update `bindShortcuts` call site to pass `ShortcutCommands` callbacks, rename `isTTY` to `isInteractive`
- `centers/cli/package.json` — remove `clipboardy` dependency
