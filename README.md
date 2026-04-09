# txtatelier

Local-first, multi-device file sync with Evolu. See [PROJECT.md](./PROJECT.md) for architecture and [AGENTS.md](./AGENTS.md) for contributor tooling.

## Usage

### Web Interface (PWA)

Use the web editor at **https://namjul.github.io/txtatelier/**

The PWA provides a browser-based interface for editing files synced via Evolu.

### CLI

```bash
npx @txtatelier/cli --watch-dir ./notes
```

The CLI watches a directory and syncs files bidirectionally with Evolu. See [centers/cli/CENTER.md](./centers/cli/CENTER.md) for detailed documentation.

### Packages

| Package | Description | Center |
|---------|-------------|--------|
| `@txtatelier/cli` | File sync daemon with interactive CLI | [centers/cli/CENTER.md](./centers/cli/CENTER.md) |
| `@txtatelier/pwa` | Web editor interface (SolidJS + Evolu) | [centers/pwa/CENTER.md](./centers/pwa/CENTER.md) |
| `@txtatelier/sync-invariants` | Sync correctness utilities | [centers/sync-invariants/CENTER.md](./centers/sync-invariants/CENTER.md) |


