## 1. Session Method Refactor

- [ ] 1.1 In `file-sync/index.ts`: change `showStatus` to return `Promise<string>` — build and return the status string instead of calling `cliShortcutInfo`
- [ ] 1.2 In `file-sync/index.ts`: change `showMnemonic` to return `Promise<string>` — return the mnemonic block as a string
- [ ] 1.3 In `file-sync/index.ts`: change `restoreMnemonic` signature to `(mnemonic: string) => Promise<string>` — remove `ReadLineFn` parameter; call `restoreOwnerFromMnemonic` with the received string; return the confirmation message
- [ ] 1.4 In `file-sync/index.ts`: change `resetOwner` to return `Promise<string>` — return the confirmation message instead of calling `cliShortcutInfo`
- [ ] 1.5 Update `FileSyncSession` interface to reflect the new return types and `restoreMnemonic` signature

## 2. ShortcutCommands Interface

- [ ] 2.1 In `shortcuts.ts`: define `ShortcutCommands` interface with `showStatus`, `showMnemonic`, `restoreMnemonic(mnemonic: string)`, `resetOwner` (all `Promise<string>`), plus `clearScreen` and `quit` (`void`)
- [ ] 2.2 In `shortcuts.ts`: rename `TTYDep.isTTY` to `TTYDep.isInteractive`
- [ ] 2.3 In `shortcuts.ts`: replace `SessionDep` with `ShortcutCommands` in the `bindShortcuts` parameter type
- [ ] 2.4 In `shortcuts.ts`: update each shortcut case to call the corresponding callback and print the returned string via `deps.logger.info`
- [ ] 2.5 In `shortcuts.ts`: update the `isInteractive` guard (was `isTTY`) in the early-return check

## 3. Mnemonic Collect-then-Pass

- [ ] 3.1 In `shortcuts.ts`: remove `readMnemonicLine` and the `clipboardy` import
- [ ] 3.2 In `shortcuts.ts`: update the `p` shortcut to collect the mnemonic via `readline.question` (using the existing `question` helper with `setImmediate` deferral), apply `normalizeMnemonicInput`, then call `deps.restoreMnemonic(mnemonic)`

## 4. Remove clipboardy

- [ ] 4.1 Run `cd centers/cli && bun remove clipboardy` to remove the dependency
- [ ] 4.2 Verify `rg "clipboardy" centers/cli/` returns no output

## 5. CLI Call Site Update

- [ ] 5.1 In `cli.ts`: update `bindShortcuts` call to pass a `ShortcutCommands` object with thin callbacks wrapping the real `FileSyncSession` methods
- [ ] 5.2 In `cli.ts`: rename `isTTY` to `isInteractive` at the `bindShortcuts` call site
- [ ] 5.3 Run `bun run typecheck` — no type errors
- [ ] 5.4 Run `bun run test` — all tests pass
