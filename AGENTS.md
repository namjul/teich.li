# Agent Instructions for txtatelier

This file provides coding guidelines for AI agents working on this local-first file synchronization system.

## Project Overview

**txtatelier** is a local-first, multi-device file sync system where:
- **Filesystem is canonical** - all truth resides on disk
- **Evolu** provides distributed replication
- **CLI** bridges filesystem ↔ Evolu with **change capture** (Filesystem → Evolu) and **state materialization** (Evolu → Filesystem)
- **PWA** provides web editing interface (reads/writes only Evolu)

---

## Workspace Structure

**Rule 1: Bun workspaces MUST be valid centers.**

Every workspace in `centers/` must justify itself as a center:
- Not every center needs to be a workspace (centers can be modules, patterns, concepts)
- Cannot create workspaces for utilities/organization without demonstrating organizing power

**Rule 2: Every explicit center MUST have a CENTER.md file.**

**Location:**
- Workspace centers: `centers/{center-name}/CENTER.md`
- Module centers: Colocated with code (e.g., `centers/cli/src/file-sync/CENTER.md`)

**What qualifies as a center?** See ATTRACTOR_PROTOCOL.md § Center (operational definition)

**See:** CENTER_PLANNING.md for center documentation protocol

## Build, Lint, and Test Commands

### Setup
```bash
bun install              # Install dependencies
```

### Development
```bash
bun run dev              # Start development server
bun run build            # Build for production
bun run preview          # Preview production build
```

### Testing
```bash
bun run test             # Run all Vitest projects (repo root, see vitest.config.ts)
bun run test:watch       # Vitest watch (root)
bun run test --project @txtatelier/pwa   # One workspace only (also: sync-invariants, cli)
cd centers/pwa && bun run test           # Same, from a single center
vitest run path/to/file.test.ts          # Single file (from repo root or center)
bun run test --coverage                  # Coverage (when configured)
```

### Linting and Formatting
```bash
bun run lint             # Run ESLint
bun run lint:fix         # Auto-fix linting issues
bun run format           # Run Prettier
bun run format:check     # Check formatting without changes
bun run typecheck        # Run TypeScript compiler check
```

### CLI Commands (when implemented)
```bash
bun run cli status       # Show sync status
bun run cli conflicts    # List conflict files
bun run cli sync         # Manually trigger sync
bun run cli doctor       # Diagnose issues
```

### Environment Variables

**Logging:**
```bash
TXTATELIER_LOG_LEVEL=DEBUG    # Show all logs including file operations
TXTATELIER_LOG_LEVEL=INFO     # Show minimal lifecycle logs (default)
TXTATELIER_LOG_LEVEL=ERROR      # Show only errors
```

**Other variables:**
```bash
TXTATELIER_WATCH_DIR=<path>   # Directory to watch for changes
TXTATELIER_DB_PATH=<path>     # Database file path
TXTATELIER_MNEMONIC=<words>   # 12 or 24-word mnemonic for owner restore
TXTATELIER_RELAY_URL=<url>    # WebSocket relay URL (default: wss://free.evoluhq.com)
```

---

## The Character of Code

| Idea | Name | Pattern (Context → Conflicting Forces → Configuration) | Rationale |
|------|------|----------------------------------------------------------|-----------|
| Pragmatic functional style | A Normal Kind of Function | When writing code → desire for elegance vs need for readability in multi-paradigm languages → Write normal-looking functional code | Avoids overly-fancy patterns that don't translate well |
| Prefer pure functions over classes | Pure Work | When designing abstractions → OOP elegance vs testability and predictability → Use functions and data unless API demands class | Pure functions are easier to test, reason about, and compose |
| Classes ok when API wants them | The Shape That Fits | When integrating with external APIs → personal preference vs interoperability → Use class if the API requires it | Pragmatic - work with the tool, not against it |
| Avoid currying/point-free style | A Clear Path | When writing functions → elegance of functional composition vs readability/maintainability → Write explicit arguments | These patterns don't work well in multi-paradigm languages |
| Factor out pure functions | A Reusable Gesture | When seeing repeated logic → inline vs extracted → Extract common logic into reusable pure functions | Enables reuse and separates concerns |
| Functional core, imperative shell | A Quiet Center | When structuring application → pure logic vs IO/side-effects → Core is pure, shell handles effects | Minimizes unpredictable behavior |

## The Grammar of Form

| Idea | Name | Pattern (Context → Conflicting Forces → Configuration) | Rationale |
|------|------|----------------------------------------------------------|-----------|
| Arrow functions over function declarations | A Bound Work | When declaring functions → hoisting flexibility vs top-down organization → Use arrow functions with const | No hoisting enforces better code organization |
| Include return type in function declaration | A Known Shape | When defining functions → inference flexibility vs explicit contracts → Explicitly type return | Makes contract clear to callers |
| Prefer interface over type | A Named Contract | When defining types → type flexibility vs tooling → Use interface | Interfaces appear by name in errors and tooltips |
| Type only for unions/utilities | A Union of Shapes | When not using interface → need for union/mapped types vs interface capability → Use type for unions, mapped types, tuples | Types needed for these features |
| Uppercase namespace imports | A Strong Name | When using namespace imports → lowercase vs uppercase → Use Module uppercase convention | Convention for clarity and consistency |
| Import with file extension (Deno/web) | A Full Address | When importing in Deno/browser → bare imports vs file extensions → Include extension ./module.ts | Required for these environments |
| type keyword for type imports | A Clear Kind | When importing types → mixed vs explicit → Use import { type Foo } | Clear distinction between type and value imports |
| Export at point of definition | A Thing Exposed Where It Lives | When defining exports → centralized vs distributed → Export where defined | Better readability and discoverability |
| Prefer map/filter/reduce | A Gentle Transformation | When transforming arrays immutably → mutation vs transformation → Use map/filter/reduce | Immutable array operations |
| Prefer for-of over forEach | A Simple Walk | When transforming arrays mutably → forEach vs for-of → Use for-of | More readable for mutable operations |
| Prefer undefined to null | An Empty Nothing | When representing optionality → null vs undefined → Use undefined | Simpler handling of optional values |
| Native #field syntax | A True Privacy | When declaring private fields → TypeScript private vs native → Use #field | Native syntax is enforced at runtime |
| Arrow function class fields | A Bound Self | When needing bound methods → bind manually vs class field arrow → Use method = () => {} | Hard-bound this without manual binding |

## The Shape of Modules

| Idea | Name | Pattern (Context → Conflicting Forces → Configuration) | Rationale |
|------|------|----------------------------------------------------------|-----------|
| Top-down readability | A Whole Before Its Parts | When organizing code → bottom-up implementation vs top-down reading → Public API first (interfaces/types) | Code read more than written; contract should be clear immediately |

## A Fitting Name

| Idea | Name | Pattern (Context → Conflicting Forces → Configuration) | Rationale |
|------|------|----------------------------------------------------------|-----------|
| Unique exported members | A Singular Name | When exporting utilities → namespace objects vs unique names → Avoid export const Utils = {} | Prevents conflicts, improves clarity |
| readonly types | An Unchanged Thing | When defining collections → mutable vs readonly → Use ReadonlyArray, ReadonlySet, etc. | Prevents accidental mutation |
| readonly prefix on interface props | A Fixed Property | When defining interfaces → mutable vs immutable properties → Prefix with readonly | Aligns with immutable data philosophy |
| function keyword for overloads | A Transparent Signature | When writing overloaded functions → arrow vs function → Use function keyword | TypeScript requires function for overload signatures |

### Error Handling

**Principles:**
- Throw errors for programmer mistakes (wrong types, invalid config)
- Return Result types for expected failures (file not found, network issues)
- Log errors with context for debugging
- Never silently swallow errors

**Pattern:**
```typescript
// For expected failures, use Result pattern
type Result<T, E = Error> = { ok: true; value: T } | { ok: false; error: E };

function readFile(path: string): Result<string> {
  try {
    const content = Bun.file(path).text();
    return { ok: true, value: content };
  } catch (error) {
    return { ok: false, error: error as Error };
  }
}

// For programmer errors, throw
function invariant(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new Error(`Invariant violation: ${message}`);
  }
}
```

### Fatal vs Recoverable Errors

**Critical distinction:** Differentiate between errors that prevent an operation from proceeding (fatal) vs errors affecting individual items (recoverable).

**Fatal errors** - Return `err()` in Result type:
- System resources unavailable (watchDir missing, database unavailable)
- Configuration invalid (cannot proceed without fixing)
- Systematic failures where continuing would be meaningless

**Recoverable errors** - Track in stats, continue processing:
- Individual file failures (permission denied, file too large)
- Partial network failures (one sync failed, others succeeded)
- Item-level validation errors

**Pattern for orchestration functions:**
```typescript
interface OperationStats {
  readonly processedCount: number;
  readonly failedCount: number;
  readonly errors: ReadonlyArray<{
    readonly path: string;
    readonly error: ItemError;
  }>;
}

type FatalError = 
  | { readonly type: "SystemResourceUnavailable"; readonly cause: Error }
  | { readonly type: "InvalidConfiguration"; readonly message: string };

// Return Result<Stats, FatalError> - only fail on systematic issues
const processItems = async (
  items: ReadonlyArray<Item>
): Promise<Result<OperationStats, FatalError>> => {
  // Check preconditions - fatal if missing
  if (!systemResourceAvailable) {
    return err({ type: "SystemResourceUnavailable", cause: error });
  }

  // Process items - continue on per-item failures
  const errors: Array<{ path: string; error: ItemError }> = [];
  let processedCount = 0;

  for (const item of items) {
    processedCount += 1;
    const result = await processItem(item);
    if (!result.ok) {
      // NOT fatal - track error and continue
      errors.push({ path: item.path, error: result.error });
      logger.error(`Failed to process ${item.path}:`, result.error);
      continue;
    }
  }

  // Return ok() even with partial failures
  return ok({
    processedCount,
    failedCount: errors.length,
    errors,
  });
};
```

**Guidelines:**
- Use `Result<Stats, FatalError>` for operations that process collections
- Fatal errors should have narrow, specific types (not generic Error)
- Always document the fatal/recoverable boundary in JSDoc
- Stats should include counts and error details for observability
- Log recoverable errors but continue processing
- Callers must explicitly unwrap Results - no silent failures

### Comments

- **Avoid redundant comments** - code should be self-documenting
- **Document "why" not "what"** - explain reasoning, not mechanics
- **Use JSDoc for public APIs** - include examples where helpful
- **Mark TODOs clearly:** `// TODO(phase-3): Add conflict detection`

**Good:**
```typescript
// Prevents infinite sync loops by tracking last applied hash
const lastAppliedHash = new Map<string, string>();
```

**Bad:**
```typescript
// Create a map
const lastAppliedHash = new Map<string, string>();
```

---

## Architecture Guidelines

### Filesystem is Canonical

- **Never silently overwrite filesystem** - always create conflict files
- Users and external tools (editors, git) operate directly on files
- Evolu reflects filesystem state, not the other way around

### Change capture and state materialization

**Change capture (Filesystem → Evolu):**
- Watch filesystem changes with debouncing (50-200ms)
- Compute content hash and compare with Evolu
- Update Evolu row if hash differs

**State materialization (Evolu → Filesystem):**
- Watch Evolu changes (subscriptions)
- Check for conflicts before writing
- Update `lastAppliedHash` after applying changes

### Conflict Handling

Conflicts are **explicit and first-class**:
```
original-file.md
original-file.conflict-<ownerId>-<timestamp>.md
```

- Original file remains untouched
- Conflict files sync like any other file
- Users resolve conflicts manually

---

## Testing Guidelines

- **Unit tests:** For pure functions (hashing, validation, utilities)
- **Integration tests:** For change capture, state materialization, and conflict scenarios
- Test file naming: `<module-name>.test.ts`
- Use descriptive test names: `test("creates conflict file when hashes differ")`

---

## Git Workflow

This project uses **Living Systems Commits** - a protocol that treats software as living structure, not mechanical assembly.

**Core principle:** Every non-trivial commit includes a **contact test** - specifying what would make the claim wrong.

**CRITICAL RULE: Only commit after the user was asked and explicitly confirmed it.**

Agents must:
1. Prepare changes (edit files, stage with `git add`)
2. Show proposed commit message to user
3. Wait for explicit user confirmation
4. Only then execute `git commit`

Never commit autonomously, even if changes seem complete.

### Format

```
<type>(<scope>): <subject>
<body>
Center-Impact: ...
Contact: ...
```

**Types:** `strengthen`, `create`, `dissolve`, `revision`, `simplify`, `refactor`, `chore`, `unfolding`, `repair`

**Required sections:**
- `Center-Impact:` for non-trivial changes (which centers strengthened/weakened/created/dissolved)
- `Contact:` with both `Success-if:` and `Failure-if:` conditions

**Contact test patterns:**
- Self-experience: "I can modify code 1 week later without re-reading"
- Binary: "Tests pass, no behavior changes"
- Comparative: "Code reduces from 340 to <200 lines"
- Counting: "Zero crashes in 1 week of use"

**Example (minimal):**
```
strengthen(file-sync): reduce debounce to 50ms

Center-Impact:
  Strengthened: file-sync-loop - faster feedback

Contact:
  Success-if: Sync feels instant, CPU <5% increase
  Failure-if: High CPU or sync instability
  Timeline: 1 week
```

**Git configuration:**
```bash
git config commit.template .gitmessage
```

### Anti-Patterns

**Mythology without operational definitions** — "make sync feel more alive" has no falsifiable meaning. Use measurable outcomes: latency, line count, crash count, self-experience after 1 week.

**Missing failure condition** — `Failure-if: [not specified]` is mythology. Every contact test must state what would prove it wrong.

**Post-hoc justification** — writing `Success-if: Feature works` after seeing it work. Contact tests are hypotheses, written before implementation.

### When to Skip Contact Tests

- **Trivial changes** (typo, formatting, dep bump): use `Center-Impact: None`
- **Pure deletions**: binary test suffices — "does anything break?"
- **Obvious failures**: compilation errors, test failures (built-in feedback)
- **Exploratory commits**: mark `Status: Exploratory — contact test after learning`
- **Docs-only**: unless claiming "better docs" (that claim needs a test)

---

## Key Design Constraints

1. **No complex merge algorithms** - conflicts are explicit files
2. **No ancestry tracking** - rely only on `ownerId` and `lastAppliedHash`
3. **Deterministic behavior** - same inputs always produce same outputs
4. **Loop prevention** - check `row.ownerId === myOwnerId` to avoid echoes
5. **Atomic operations** - use temp-file + rename pattern for writes

---

# Documentation Links

- Evolu: https://www.evolu.dev/llms.txt
  - https://www.evolu.dev/llms-full.txt
- SolidJS: https://docs.solidjs.com/llms.txt
  - https://docs.solidjs.com/llms-full.txt
- ZagJS: https://zagjs.com/llms.txt
  - https://zagjs.com/llms-full.txt
- Bun: https://bun.com/llms.txt
  - https://bun.com/llms-full.txt
- daisyUI: https://daisyui.com/llms.txt
