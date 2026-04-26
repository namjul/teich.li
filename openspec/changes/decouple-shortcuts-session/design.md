## Context

`bindShortcuts` currently depends on `SessionDep` — the full `FileSyncSession` interface. It calls `deps.session.showStatus()`, `deps.session.quit()`, etc. directly. Session methods (`showStatus`, `showMnemonic`, `resetOwner`, `restoreMnemonic`) write to the logger internally and return `void`, meaning their output is not observable without capturing log calls. `restoreMnemonic` reaches out to get user input via an injected `ReadLineFn` callback, mixing IO and business logic in one method. The `clipboardy` dependency powers an implicit clipboard fallback when the mnemonic prompt receives empty input.

## Goals / Non-Goals

**Goals:**
- `bindShortcuts` depends only on narrow callbacks — no knowledge of `FileSyncSession`
- Session methods return their output as strings — callers decide where to print
- Mnemonic restore is split at the IO boundary: `bindShortcuts` collects the string, the session receives it
- Remove `clipboardy` and the clipboard fallback
- Rename `isTTY` to `isInteractive` throughout

**Non-Goals:**
- Daemon architecture or socket protocol — this change is foreground-only
- Changes to shortcut key bindings or help text
- Changes to `computeStdinInteractive` logic

## Decisions

### ShortcutCommands replaces SessionDep

**Decision:** Replace `SessionDep & { session: FileSyncSession }` in `bindShortcuts` with a `ShortcutCommands` interface of plain async callbacks: `showStatus`, `showMnemonic`, `restoreMnemonic(mnemonic: string)`, `resetOwner`, `clearScreen`, `quit`.

**Rationale:** `bindShortcuts` uses 6 methods from `FileSyncSession`, but `FileSyncSession` is a wide interface with additional methods (`stop`, `onStop`, etc.) that shortcuts do not need. Narrow callbacks make the dependency explicit, remove the coupling, and let `bindShortcuts` be called with any provider — the real session, a test double, or in the future a socket wrapper.

**Alternative considered:** Keep `SessionDep`, extract only a subset interface (`ShortcutSession`). Rejected: still requires `FileSyncSession` to implement a derived interface rather than just passing callbacks.

---

### Session methods return Promise<string>

**Decision:** `showStatus`, `showMnemonic`, `resetOwner`, and `restoreMnemonic` return `Promise<string>` (the text to display) instead of calling the logger and returning `Promise<void>`. `bindShortcuts` receives the string and prints it via `deps.logger.info`.

**Rationale:** Methods that mix computation and presentation are untestable without log capture. Returning a string separates concerns — the session produces data, the caller decides where it goes.

**Alternative considered:** Pass a logger into each session method. Rejected: more coupling, not less.

---

### restoreMnemonic takes mnemonic string directly

**Decision:** `restoreMnemonic` signature changes from `(readLine: ReadLineFn) => Promise<void>` to `(mnemonic: string) => Promise<string>`. `bindShortcuts` collects the mnemonic via `readline.question` before calling `restoreMnemonic`.

**Rationale:** A session method should not perform IO. The `ReadLineFn` callback was a workaround to let the session control when to ask the user — but that decision belongs to the UI layer. Collecting input first and passing the result keeps the session pure.

---

### Clipboard fallback removed

**Decision:** Remove the empty-line → `clipboard.readSync()` path from `readMnemonicLine`. Users type the mnemonic directly. `clipboardy` is removed as a dependency.

**Rationale:** The clipboard fallback is an implicit side-channel that silently reads from the clipboard when the user hits Enter on an empty line. This is surprising behavior. With `restoreMnemonic` now taking a string directly, the collect-then-pass flow makes an empty string naturally a no-op at the session level rather than a clipboard read.

---

### isTTY renamed to isInteractive

**Decision:** `TTYDep.isTTY` renamed to `TTYDep.isInteractive`. `computeStdinInteractive` return value is unchanged; only the property name at the interface and call sites changes.

**Rationale:** `isTTY` is a low-level OS property name. `isInteractive` describes what the code actually tests: whether the session should bind shortcuts and show prompts.

## Risks / Trade-offs

**Call site changes at `cli.ts`** → `bindShortcuts` call must be updated to pass `ShortcutCommands` callbacks that wrap the real session methods. One additional indirection per shortcut — negligible at runtime, slightly more code at the call site.

**`restoreMnemonic` behavior change** → The `ReadLineFn` parameter is removed from the `FileSyncSession` interface and the underlying implementation. Any callers beyond `shortcuts.ts` and `cli.ts` that pass a readline function will need to be updated — `rg` shows no other callers.
