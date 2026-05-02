# teich

Local-first, multi-device file sync with [Evolu](https://www.evolu.dev/). See [PROJECT.md](./PROJECT.md) for architecture and [AGENTS.md](./AGENTS.md) for contributor tooling.

## Usage

### Web Interface (PWA)

Use the web editor at **https://namjul.github.io/teich/**

The PWA provides a browser-based interface for editing files synced via Evolu.

### CLI

```bash
npx @teich/cli --watch-dir ./notes
```

The CLI watches a directory and syncs files bidirectionally with Evolu. See [centers/cli/CENTER.md](./centers/cli/CENTER.md) for detailed documentation.

### Packages

| Package | Description | Center |
|---------|-------------|--------|
| `@teich/cli` | File sync daemon with interactive CLI | [centers/cli/CENTER.md](./centers/cli/CENTER.md) |
| `@teich/pwa` | Web editor interface (SolidJS + Evolu) | [centers/pwa/CENTER.md](./centers/pwa/CENTER.md) |
| `@teich/sync-invariants` | Sync correctness utilities | [centers/sync-invariants/CENTER.md](./centers/sync-invariants/CENTER.md) |


