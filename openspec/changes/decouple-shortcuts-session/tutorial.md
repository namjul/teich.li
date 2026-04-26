# Tutorial: Decouple Shortcuts from Session

> **Lesson plan** — used by the tutoring agent as a private curriculum. The learner works through the session interactively, not by reading this file directly.

This tutorial walks through decoupling `bindShortcuts` from `FileSyncSession`: making session methods return strings, replacing the wide `SessionDep` dependency with narrow callbacks, fixing the IO boundary in `restoreMnemonic`, and removing the `clipboardy` side-channel.

## Prerequisites

- Read `centers/cli/src/shortcuts.ts` and `centers/cli/src/file-sync/index.ts` before starting
- Comfortable reading TypeScript interfaces and async/await
- `bun install` run at the repo root

---

## Module 1: Session Methods Return Strings

### Objective

Refactor `showStatus`, `showMnemonic`, `resetOwner` in `file-sync/index.ts` to return `Promise<string>` instead of writing to the logger directly.

### Concept

When a function both computes a result and decides how to display it, you can't test the computation without capturing output. A method that calls `logger.info("Status: ...")` and returns `void` is untestable in isolation — any test must spy on the logger. The fix is to return the string and let the caller print it. This is the functional core / imperative shell split applied at method granularity: the session is the core (produces data), the caller is the shell (handles IO).

The key question to check understanding: if `showStatus` returns a string and `bindShortcuts` prints it, what happens in a future daemon where a socket command handler receives that string instead? How does the session code change?

### Worked Example

`showStatus` currently (in `file-sync/index.ts`):

```typescript
showStatus: async (): Promise<void> => {
  const o = await evolu.appOwner;
  cliShortcutInfo("Status:");
  cliShortcutInfo(`  DB path: ${dbPath}`);
  cliShortcutInfo(`  Watch dir: ${watchDir}`);
  cliShortcutInfo(`  Relay URL: ${relayUrl}`);
  cliShortcutInfo(`  Owner ID: ${o.id}`);
},
```

After:

```typescript
showStatus: async (): Promise<string> => {
  const o = await evolu.appOwner;
  return [
    "Status:",
    `  DB path: ${dbPath}`,
    `  Watch dir: ${watchDir}`,
    `  Relay URL: ${relayUrl}`,
    `  Owner ID: ${o.id}`,
  ].join("\n");
},
```

Note: `cliShortcutInfo` calls disappear entirely — the string carries all the information. The caller (`bindShortcuts`) will `logger.info` the returned string. The `FileSyncSession` interface type for `showStatus` changes from `() => Promise<void>` to `() => Promise<string>`.

### Exercise

Refactor `showMnemonic` the same way. Its current implementation:

```typescript
showMnemonic: async (): Promise<void> => {
  const o = await evolu.appOwner;
  cliShortcutInfo("");
  cliShortcutInfo("  Mnemonic (copy manually):");
  cliShortcutInfo(`  ${o.mnemonic}`);
  cliShortcutInfo("");
},
```

Requirements:
- Return `Promise<string>` with the mnemonic block as a single string
- No `cliShortcutInfo` calls remain
- Update the `FileSyncSession` interface entry for `showMnemonic`

**Verification:** `bun run typecheck` — no errors on `showMnemonic`.

### Solution

```typescript
showMnemonic: async (): Promise<string> => {
  const o = await evolu.appOwner;
  return ["", "  Mnemonic (copy manually):", `  ${o.mnemonic}`, ""].join("\n");
},
```

Interface change:
```typescript
readonly showMnemonic: () => Promise<string>;
```

---

## Module 2: ShortcutCommands Interface

### Objective

Define `ShortcutCommands` in `shortcuts.ts`, replace `SessionDep` in `bindShortcuts`, and update each shortcut case to call the callback and print the returned string.

### Concept

`bindShortcuts` currently receives `deps.session: FileSyncSession` — a wide interface with 8+ members. It uses 6 of them. The Law of Demeter says a module should only depend on what it directly uses. More practically: the wide interface means `bindShortcuts` is coupled to `FileSyncSession`'s design — you can't call it with anything that isn't a `FileSyncSession`. Replacing with narrow callbacks (plain `() => Promise<string>` functions) removes that coupling entirely. You can now pass real session methods, test doubles, or in the future socket-command wrappers, all without touching `bindShortcuts`.

Question: if you defined a `ShortcutSession` sub-interface extracted from `FileSyncSession`, you'd also decouple `bindShortcuts`. Why does this design reject that approach?

### Worked Example

Define the new interface and update the `bindShortcuts` parameter type:

```typescript
export interface ShortcutCommands {
  readonly showStatus: () => Promise<string>;
  readonly showMnemonic: () => Promise<string>;
  readonly restoreMnemonic: (mnemonic: string) => Promise<string>;
  readonly resetOwner: () => Promise<string>;
  readonly clearScreen: () => void;
  readonly quit: () => void;
}
```

Update the `bindShortcuts` signature (replace `SessionDep &`):

```typescript
export const bindShortcuts = (
  deps: ShortcutCommands & LoggerDep & TTYDep & ShortcutOptionsDep & ReadlineDep,
): (() => void) => {
```

Also rename `isTTY` to `isInteractive` on `TTYDep`:

```typescript
export interface TTYDep {
  readonly isInteractive: boolean;
}
```

And update the early-return guard:

```typescript
if (!deps.isInteractive || deps.readline == null) {
```

Delete the old `SessionDep` interface entirely.

### Exercise

Update the `switch` cases in `handleLine` so each shortcut calls the corresponding `ShortcutCommands` callback and prints the result via `deps.logger.info`. The `u` case as a model:

```typescript
case "u":
  await runShortcut("u", async () => {
    deps.logger.info(await deps.showStatus());
  });
  return;
```

Apply the same pattern to `s`, `d`, `c`, and `q`. Skip `p` for now — that's Module 3.

**Verification:** `bun run typecheck` will fail (cli.ts call site not yet updated) — that's expected. Check that `shortcuts.ts` itself has no type errors.

### Solution

```typescript
case "u":
  await runShortcut("u", async () => {
    deps.logger.info(await deps.showStatus());
  });
  return;
case "s":
  await runShortcut("s", async () => {
    deps.logger.info(await deps.showMnemonic());
  });
  return;
case "d":
  await runShortcut("d", async () => {
    deps.logger.info(await deps.resetOwner());
  });
  return;
case "c":
  await runShortcut("c", () => deps.clearScreen());
  return;
case "q":
  await runShortcut("q", () => deps.quit());
  return;
```

---

## Module 3: Mnemonic IO Boundary

### Objective

Fix `restoreMnemonic` so the session receives a string rather than a readline callback, and update the `p` shortcut to collect-then-pass.

### Concept

`restoreMnemonic` currently takes a `ReadLineFn` — the session calls it to ask the user for input. This means the session owns the IO timing. That's backwards: session methods are business logic; who asks the user and when is the UI layer's concern. The fix splits it: `bindShortcuts` asks the user (readline), gets the string, then passes it to `restoreMnemonic`. The session never touches readline. This is the same pattern as passing a value to a pure function instead of passing a callback that the function uses to fetch the value.

Question: the current `readMnemonicLine` wraps `readline.question` in `setImmediate`. Why is that deferral necessary, and does it need to move with this refactor?

### Worked Example

Change `restoreMnemonic` in `file-sync/index.ts`:

```typescript
// Before:
restoreMnemonic: async (readLine: ReadLineFn): Promise<void> => {
  const line = (await readLine("Paste mnemonic words: ")).trim();
  await restoreOwnerFromMnemonic(ownerSession, line);
  cliShortcutInfo("");
  cliShortcutInfo("  Owner restored. Stop this process (q) and start again...");
  cliShortcutInfo("");
},

// After:
restoreMnemonic: async (mnemonic: string): Promise<string> => {
  await restoreOwnerFromMnemonic(ownerSession, mnemonic);
  return "\n  Owner restored. Stop this process and start again to use the restored identity.\n";
},
```

Update the `FileSyncSession` interface:
```typescript
readonly restoreMnemonic: (mnemonic: string) => Promise<string>;
```

Also refactor `resetOwner` in the same pass (task 1.4):
```typescript
resetOwner: async (): Promise<string> => {
  await resetOwnerData(ownerSession);
  return "\n  Owner reset. Stop this process and start again to use the new owner.\n";
},
```

### Exercise

Update the `p` shortcut in `shortcuts.ts`. Remove `readMnemonicLine` entirely. The `p` case should:
1. Use the existing `question` helper (with its `setImmediate` deferral) to prompt the user
2. Apply `normalizeMnemonicInput` to the typed string
3. Call `deps.restoreMnemonic(mnemonic)` and print the result

The `setImmediate` deferral stays in `question` — it's the readline re-entrancy workaround and belongs at the `question` level, not removed.

**Verification:** After this module, `shortcuts.ts` should have no import of `clipboardy` and no `readMnemonicLine` function. `bun run typecheck` will still fail at the cli.ts call site — that's fixed in Module 4.

### Solution

```typescript
case "p":
  await runShortcut("p", async () => {
    const mnemonic = await question("Mnemonic, then Enter: ");
    deps.logger.info(await deps.restoreMnemonic(normalizeMnemonicInput(mnemonic)));
  });
  return;
```

Remove `readMnemonicLine` function and the `import clipboard from "clipboardy"` line.

Also update the `p` description in the `shortcuts` array:
```typescript
{ key: "p", description: "restore mnemonic (type or paste words, then Enter)" },
```

---

## Module 4: Remove clipboardy and Wire the CLI

### Objective

Remove the `clipboardy` package, update the `cli.ts` call site to pass `ShortcutCommands` callbacks, and verify the full build passes.

### Concept

After the previous modules, `shortcuts.ts` no longer imports `clipboardy` — but the package is still in `package.json`. Dependency hygiene matters: unused packages add install time, surface area for security advisories, and native addon compilation. `bun remove` handles the removal atomically. The CLI call site update is the mechanical wiring step: since `bindShortcuts` now expects `ShortcutCommands`, the caller must pass an object with the right callbacks, each wrapping the real session method.

### Worked Example

Remove the package:
```bash
cd centers/cli && bun remove clipboardy
```

Verify:
```bash
rg "clipboardy" centers/cli/   # should return nothing
```

### Exercise

Update `cli.ts` to pass a `ShortcutCommands` object to `bindShortcuts`. Find the current call site (search for `bindShortcuts` in `cli.ts`) and replace the `session:` property with individual callbacks. The pattern:

```typescript
bindShortcuts({
  showStatus: () => session.showStatus(),
  showMnemonic: () => session.showMnemonic(),
  restoreMnemonic: (mnemonic) => session.restoreMnemonic(mnemonic),
  resetOwner: () => session.resetOwner(),
  clearScreen: () => session.clearConsole(),
  quit: () => { void session.quit(); },
  logger,
  isInteractive: computeStdinInteractive(),
  options: { print: true },
  readline: rl,
});
```

Also rename any remaining `isTTY` references to `isInteractive` at this call site.

**Verification:**
```bash
bun run typecheck   # no errors
bun run test        # all tests pass
```

### Solution

The worked example above is the solution. Key things to check:
- `clearScreen` maps to `session.clearConsole()` — the method name differs between the interface and the session
- `quit` wraps `session.quit()` with `void` since `quit` on `ShortcutCommands` returns `void` but `session.quit()` returns `Promise<void>`
- `isTTY` renamed to `isInteractive` everywhere at the call site

---

## Summary

| Module | What changes | Key concept |
|--------|-------------|-------------|
| 1 | Session methods return `Promise<string>` | Functional core: produce data, don't display it |
| 2 | `ShortcutCommands` replaces `SessionDep` | Narrow dependencies over wide interfaces |
| 3 | `restoreMnemonic(mnemonic: string)`, `p` shortcut collects input | IO belongs to the UI layer, not the session |
| 4 | Remove `clipboardy`, wire `cli.ts` | Dependency cleanup and mechanical wiring |

Estimated total: ~1.5 hours.
