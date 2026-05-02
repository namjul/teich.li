# IDE-Style Text Editor Behaviors Exploration

**Date:** 2025-04-13  
**Context:** Evaluating IDE-style interactions for teich's text editing interface  
**Scope:** Character and line-level editing behaviors, excluding syntax highlighting

---

## Core Question

What makes a textarea feel like an IDE? We examined two reference implementations from ~2014 (Behave.js and misbehave) and modern alternatives to understand which behaviors provide the most value for a lightweight text editor.

---

## Reference Implementations Analysis

### Behave.js (https://github.com/iamso/Behave.js)

A lightweight, configurable library for adding IDE behaviors to textareas.

### misbehave (https://github.com/orbitbot/misbehave)

A successor to Behave.js with similar goals but different implementation choices.

---

## Feature Comparison: Reference Implementations

| Feature | Description | misbehave | Behave.js |
|:--------|:------------|:---------:|:---------:|
| **undo/redo** | Press common keyboard combinations (ctrl-z, ctrl-shift-z) to undo and redo edits | ✗ Custom implementation | ✗ Uses browser functionality, has issues |
| **autoIndent** | Indent to previous line start by default, `()` and `{}` has special functionality | ✓ | ✓ |
| **autoOpen** | If any of `({['"` are typed, their counterparts will also be added | ✓ | ✓ |
| **autoStrip** | If your cursor is between two paired characters, backspace will delete both | ✓ | ✓ |
| **overwrite** | If you type a closing character directly before an identical one, it will overwrite instead of add | ✓ | ✓ |
| **replaceTab** | Tab key indents instead of cycles focus, shift de-indents, similarly for multiline selections | ✓ | ✓ |
| **softTabs** | Use spaces instead of tab characters | ✓ | ✓ |
| **code fence** | Exclude areas from editing functionality with magic string | N/A | ✓ |

**Legend:** ✓ = Implemented  |  ✗ = Implemented but problematic  |  N/A = Not applicable

---

## Critical Observations

### What's Missing from References

Both libraries focus on **character-level** behaviors (brackets, quotes, indentation) but lack **line-level** operations that modern editors provide:

- No duplicate line
- No move line up/down
- No smart home key
- No selection expansion
- No bracket matching navigation

These omissions make them feel like "enhanced textareas" rather than "lightweight IDEs."

### Why References Are Outdated (2014 → 2025)

1. **No caretPositionFromPoint usage** - Modern browsers expose this API for hit-testing
2. **No Web Workers** - Heavy operations block the main thread
3. **Monolithic architecture** - Not composable or tree-shakeable
4. **Browser quirks** - Pre-ES6 compatibility concerns no longer relevant

---

## Proposed Additional Features

Beyond the reference implementations, the following features would elevate the editing experience:

### Line-Level Operations

| Feature | Description | Value Proposition |
|:--------|:------------|:------------------|
| **duplicateLine** | Ctrl+Shift+D duplicates current line or selection | Essential for lists, YAML frontmatter |
| **moveLineUp/Down** | Alt+Up/Down moves current line(s) | Reorder content without cut/paste |
| **joinLines** | Ctrl+J joins current and next line with space | Inverse of autoIndent's newline behavior |
| **transformCase** | Ctrl+K Ctrl+U/L to toggle upper/lower case | Works on auto-selected regions |
| **sortLines** | Alphabetically sort selected lines | List manipulation for markdown/config |
| **deleteLine** | Ctrl+Shift+K deletes entire line | Cleanup operation |

### Selection Enhancements

| Feature | Description | Value Proposition |
|:--------|:------------|:------------------|
| **expandSelection** | Shift+Alt+Right expands: word → line → paragraph | Progressive selection building |
| **shrinkSelection** | Shift+Alt+Left reverses expand | Navigation pair |
| **selectBracketContent** | When cursor inside (), select contents | Extends autoOpen/autoStrip bracket awareness |
| **selectLine** | Triple-click or Ctrl+L selects entire line | Works with replaceTab for block indent |
| **columnSelection** | Alt+drag for rectangular selection | Advanced, pairs with softTabs |

### Smart Navigation

| Feature | Description | Value Proposition |
|:--------|:------------|:------------------|
| **smartHome** | Home key toggles: line start → first non-whitespace | Essential with autoIndent (deep nesting) |
| **wordPartJump** | Ctrl+Left/Right respects camelCase/snake_case | Extends cursor navigation |
| **goToBracket** | Ctrl+Shift+\ jumps between matching brackets | Uses same bracket pairing as autoOpen |
| **scrollCenter** | Ctrl+L centers view on cursor | Long files with code fences |

### Smart Typing (Character Level)

| Feature | Description | Value Proposition |
|:--------|:------------|:------------------|
| **surroundSelection** | Select text, type `(`, wraps selection | Makes autoOpen retroactive |
| **autoComment** | Toggle line/block comments with Ctrl+/ | Works with code fences |
| **autoSemicolon** | Smart `;` insertion (end of statement) | Similar logic to autoOpen |
| **deleteWord** | Ctrl+Backspace deletes word part (camelCase-aware) | Pair with wordPartJump |

### Multi-Cursor (Advanced)

| Feature | Description | Value Proposition |
|:--------|:------------|:------------------|
| **addCursorAbove/Below** | Ctrl+Alt+Up/Down adds cursors on adjacent lines | All auto* behaviors apply to all cursors |
| **selectNextOccurrence** | Ctrl+D selects next instance of word | Multi-cursor gateway |
| **skipOccurrence** | Ctrl+K Ctrl+D skips current, selects next | Refinement |

### Clipboard Intelligence

| Feature | Description | Value Proposition |
|:--------|:------------|:------------------|
| **smartPaste** | Adjusts indentation of pasted content to match destination | Critical with softTabs/autoIndent |
| **pasteAndIndent** | Same as above but explicit | Explicit intent |

### Markdown-Specific (teich Context)

| Feature | Description | Value Proposition |
|:--------|:------------|:------------------|
| **toggleBold** | Ctrl+B wraps selection with `**` | SurroundSelection specialization |
| **toggleItalic** | Ctrl+I wraps with `_` | SurroundSelection specialization |
| **toggleCode** | Ctrl+` wraps with backticks | SurroundSelection specialization |
| **toggleLink** | Ctrl+K inserts `[text](url)` | Smart insertion |
| **headerLevel** | Ctrl+1-6 toggles/set header level | Line-level transformation |

---

## Implementation Complexity Analysis

### Easy (< 10 lines)
- Tab ↔ spaces conversion
- Auto-insert closing brackets
- Overwrite matching bracket
- Insert newline with auto-indent
- Surround selection

### Medium (10-50 lines)
- Smart home key
- Duplicate line
- Move line up/down
- Join lines
- Word jumping with camelCase
- Toggle comment
- Expand/shrink selection (basic)

### Hard (50+ lines, edge cases)
- Column selection (rectangular)
- Multi-cursor (requires selection overlay)
- Expand selection (semantic: word → expression → block)
- Autocomplete dropdown positioning
- Snippet expansion with tab stops
- Smart paste (indentation detection)
- Error recovery in partial selections

---

## Architecture Considerations

### State Requirements

**Stateless (just transform):**
- autoOpen, autoStrip, overwrite
- surroundSelection
- duplicateLine, joinLines

**Requires history:**
- undo/redo (reference implementations handle this differently)

**Requires editor state:**
- expandSelection (track expansion level)
- multi-cursor (track all cursor positions)
- goToBracket (find matching bracket)

### Composability

Modern approach favors **behavior as pure function**:

```typescript
// Behavior signature
type Behavior = (
  text: string,
  selection: { start: number; end: number },
  event: KeyboardEvent
) => { text: string; selection: { start: number; end: number } } | null;

// Null means behavior didn't handle it, try next
```

This enables:
- Testing (input/output verification)
- Composition (chain behaviors)
- Time-travel debugging (just signals)
- Tree-shaking (only import what you need)

---

## Recommendations for teich

### Phase 1: MVP (High Value, Low Complexity)

Add to reference implementation set:

1. **smartHome** - Essential with autoIndent
2. **duplicateLine** - Huge productivity win for lists
3. **surroundSelection** - Makes autoOpen retroactive
4. **wordPartJump** - Extends cursor navigation

**Estimated effort:** ~75 lines of behavior code  
**Result:** Feels like a modern editor

### Phase 2: Enhanced Experience

5. **expandSelection** - Progressive selection
6. **smartPaste** - Consistent indentation
7. **moveLineUp/Down** - Content reordering
8. **goToBracket** - Reuses bracket matching

### Phase 3: Power User

9. **selectNextOccurrence** - Multi-cursor gateway
10. **addCursorAbove/Below** - True multi-cursor
11. **Markdown toggles** - Domain-specific enhancements

---

## When to Build vs. When to Use Existing

### Build Custom If:
- Bundle size is absolutely critical (<20KB total)
- Very specific interaction model required
- Learning exercise (valid reason)
- Full control over behavior composition

### Use CodeMirror 6 If:
- Need professional-grade editing
- Bundle size acceptable (~60KB)
- Want existing ecosystem (themes, modes, etc.)
- No time to implement edge cases

### Use Monaco If:
- Need "real IDE" feel
- LSP integration required
- Bundle size not a concern (huge)

---

## Textarea vs. Contenteditable Decision

For IDE behaviors without syntax highlighting:

**textarea wins** because:
- Native selection API is unambiguous
- undo/redo works automatically (mostly)
- Screen reader compatible
- Form integration is trivial

**contenteditable only needed if:**
- Rich text formatting (bold, italic, etc.)
- Inline decorations (error squiggles, highlights)
- Multiple cursor visualization
- Widgets embedded in text

For teich's use case (text/markdown files), **textarea + behaviors** is the right choice.

---

## Related Decisions

### Parser Choice (Syntax Highlighting Context)

Though out of scope for this exploration, if syntax highlighting is added later:

| Approach | When to Use |
|:---------|:------------|
| **Regex-based** (Prism.js) | Fast, good enough for 80% of cases, ~2KB |
| **Ohm.js** | Custom DSLs, small files, ~30KB |
| **Tree-sitter** | Large files, existing languages, incremental, ~700KB |

For teich: Start with regex-based, add Ohm only for custom query syntax, skip Tree-sitter unless users demand professional IDE feel.

---

## Open Questions

1. Should behaviors be configurable per file type (markdown vs. code)?
2. How to handle undo/redo stack when behaviors modify text programmatically?
3. Should multi-cursor support be prioritized for Phase 2?
4. What is the interaction between code fence exclusion and other behaviors?
5. How do behaviors compose with SolidJS signals for time-travel debugging?

---

## Conclusion

The reference implementations provide a solid foundation for character-level behaviors. The biggest gap is **line-level operations** (duplicate, move, smart home) which provide disproportionate value for the effort required.

Recommended path: Implement the reference feature set + smartHome + duplicateLine + surroundSelection as MVP. This provides 90% of the IDE feel with minimal complexity.

---

**Next Steps:**
- [ ] Prototype smartHome behavior
- [ ] Evaluate undo/redo strategy (native vs. custom)
- [ ] Decide on CodeMirror 6 vs. custom implementation
- [ ] Create behavior composition architecture
