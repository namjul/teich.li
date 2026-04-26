## MODIFIED Requirements

### Requirement: Owner operations on the live session

`FileSyncSession` SHALL expose `showMnemonic`, `showStatus`, `restoreMnemonic(mnemonic: string)`, and `resetOwner` for the running sync session. Each SHALL return `Promise<string>` — the text to display to the user — instead of writing to the logger directly. `showMnemonic` SHALL return the mnemonic formatted for display. `restoreMnemonic` SHALL accept the mnemonic words as a plain string (collected by the caller), validate them, persist the restored owner, flush, and SHALL return a string instructing the user to stop the process and start the CLI again. `resetOwner` SHALL reset the persisted owner, flush, and SHALL return a string instructing the user to stop and start again. Neither method SHALL use an extra confirmation prompt before acting.

#### Scenario: Restore after paste

- **WHEN** `restoreMnemonic` is called with a valid mnemonic string
- **THEN** the owner is persisted and the method returns a string telling the user to quit and restart

#### Scenario: Reset without confirmation

- **WHEN** `resetOwner` is called
- **THEN** the owner is reset and the method returns a string telling the user to quit and restart, with no interactive confirm step

#### Scenario: Output returned not logged

- **WHEN** any of `showStatus`, `showMnemonic`, `resetOwner`, or `restoreMnemonic` is called
- **THEN** the method returns a string and does NOT call the logger internally
