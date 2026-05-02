# Exploration: CLI Webserver as Publishing Interface

**Status:** Exploration complete  
**Context:** teich CLI runs a webserver to serve files as a permanent second interface for public consumption

---

## Core Insight

The CLI webserver is not a preview or debugging tool—it is a **publishing platform**. This reframes the CLI from "sync tool" to "publication system" with the filesystem remaining canonical.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    PUBLISHING ARCHITECTURE                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   ┌─────────────────────────────────────────────────────────────────┐  │
│   │                         PUBLIC INTERNET                         │  │
│   │                           (readers)                             │  │
│   └───────────────────────┬─────────────────────────────────────────┘  │
│                           │                                           │
│                           ▼                                           │
│   ┌─────────────────────────────────────────────────────────────────┐  │
│   │                    REVERSE PROXY (user's)                       │  │
│   │              nginx, caddy, cloudflare tunnel, etc               │  │
│   └───────────────────────┬─────────────────────────────────────────┘  │
│                           │                                           │
│                           ▼                                           │
│   ┌─────────────────────────────────────────────────────────────────┐  │
│   │                    CLI WEBSERVER (localhost)                    │  │
│   │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │  │
│   │  │   Router    │  │   Render    │  │   Selective Publish     │  │  │
│   │  │             │  │             │  │                         │  │  │
│   │  │ /           │  │ markdown    │  │ Which files public?      │  │  │
│   │  │ /{path}     │──► │   → HTML    │◄─┤  - All?                  │  │  │
│   │  │ /raw/{path} │  │             │  │  - Tagged? (#public)     │  │  │
│   │  │             │  │ .txt → ???   │  │  - Config list?          │  │  │
│   │  └─────────────┘  └─────────────┘  └─────────────────────────┘  │  │
│   └───────────────────────┬─────────────────────────────────────────┘  │
│                           │                                           │
│                           ▼                                           │
│   ┌─────────────────────────────────────────────────────────────────┐  │
│   │                    FILESYSTEM (canonical)                        │  │
│   │              ~/Documents/Txtatelier/{files}.md/.txt              │  │
│   └─────────────────────────────────────────────────────────────────┘  │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Decisions Made

### 1. URL Structure: Option B (Clean Slugs)

**Chosen:** Clean slugs with mirrored hierarchy

```
Filesystem                  URL Path
──────────                  ────────
notes/ideas.md      ──►     /notes/ideas
journal/2024-01.txt ──►     /journal/2024-01
```

**Rationale:**
- Decouples URLs from filenames (allows `.md` and `.txt` to coexist at same slug)
- Prepares ground for future wiki-link resolution
- Cleaner for public consumption
- Users can reverse-proxy without exposing file extensions

### 2. Scope: Foundation Now, Advancements Later

**Current teich state:**
- No public/private concept
- No wiki-links
- Filesystem = flat organization

**Future advancements (layered on):**
- Tag-based or frontmatter filtering for selective publishing
- `[[link]]` resolution and backlinking
- Publication organization separate from file organization

### 3. Minimum Viable Webserver

| Feature | Behavior | Future Enhancement |
|---------|----------|-------------------|
| Files served | All `.md` and `.txt` | Filter by tag/frontmatter |
| URL mapping | Clean slugs, mirrored hierarchy | Custom slugs via frontmatter |
| Markdown | Rendered to HTML | Wiki-link resolution |
| `.txt` files | `<pre>` wrapped, monospace | Configurable per-file format |
| Raw endpoint | `/raw/{path}` returns source | Always available |
| Directory index | List all files at `/` | Organized by folder |

---

## Open Questions (Deferred)

### 1. Slug Collision Strategy

When two files map to the same slug:

```
notes/ideas.md  ──┐
                  ├─► both want /notes/ideas
notes/ideas.txt ──┘
```

**Options:**
| Strategy | Pros | Cons |
|----------|------|------|
| First wins | Simple | Content silently disappears |
| Disambiguated | All content available | URLs become unpredictable |
| Extension in slug | Predictable | URLs get noisy |
| Reject startup | Safe | Annoying for users |

**Status:** Not blocking MVP, but needs decision before production use

### 2. .txt Rendering Semantics

Without wiki-links or special semantics, `.txt` files are just text content:

**Option A:** `<pre>` wrapped, monospace, preserved whitespace  
- Authentic to source
- Good for code/logs
- Safe default

**Option B:** Auto-wrapped paragraphs, proportional font  
- Better for prose
- Loses exact formatting

**Option C:** Render as markdown (same as `.md`)  
- Unified experience
- Assumes `.txt` might contain MD

**Status:** Configurable per-file via future frontmatter (`format: prose`)? For MVP, use Option A (safe default).

### 3. Hierarchy: Flat vs. Mirrored

**Flat (all files in root namespace):**
```
/ideas ──► notes/ideas.md
/concepts ──► wiki/concepts.md
```

**Mirrored (preserve directory structure):**
```
/notes/ideas ──► notes/ideas.md
/wiki/concepts ──► wiki/concepts.md
```

**Chosen:** Mirrored

**Rationale:**
- Scales better as file count grows
- Matches mental model of filesystem
- Avoids collision issues as directories provide natural namespaces

---

## Future Advancements (Not MVP)

### Selective Publishing

| Approach | Mechanism |
|----------|-----------|
| **Tag-based** | `#public` in content |
| **Frontmatter** | `public: true` in YAML |
| **Config list** | `publicFiles: [...]` in config |
| **Dot-prefix exclude** | `.private.md` ignored |

### Wiki-Link Resolution

```
┌────────────────────────────────────────────────────────────┐
│  WIKI-LINK RESOLUTION STRATEGIES                           │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  1. EXACT PATH                                             │
│     [[other-file.md]] → /other-file.md                     │
│                                                            │
│  2. SLUG-BASED (matches Option B)                          │
│     [[other-file.md]] → /other-file                        │
│                                                            │
│  3. TITLE-BASED                                            │
│     [[Other File]] → /other-file (resolved by title)       │
│                                                            │
│  4. LEAVE AS-IS                                            │
│     [[other-file.md]] → plaintext (no link)                │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

For public consumption with Option B URLs, slug-based resolution aligns best.

---

## Implementation Notes

### Port and Binding
- Default: localhost-only (security)
- Configurable port (default: 8080 or similar)
- Users handle reverse-proxy for public exposure

### Rendering Stack
- Markdown: basic HTML output (no complex CSS framework)
- `.txt`: `<pre>` wrapper with minimal styling
- Directory index: simple HTML list with links

### No Live Reload (Initially)
- Webserver reads filesystem on each request
- No WebSocket/SSE for updates
- Simple, stateless, sufficient for publishing use case

---

## Contact Test for This Exploration

**Success-if:**
- MVP webserver serves all .md/.txt files via clean slugs
- Markdown renders to readable HTML
- .txt renders as preformatted text
- Users can reverse-proxy to make content public
- Foundation supports future selective publishing and wiki-links

**Failure-if:**
- Slug collisions cause confusing behavior
- Rendering choices prevent future extensibility
- URL structure locks us into bad patterns
