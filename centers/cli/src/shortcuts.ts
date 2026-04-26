import type { Interface as ReadlineInterface } from "node:readline";
import type { Logger } from "./logger.ts";

export interface ShortcutCommands {
  readonly showStatus: () => Promise<string>;
  readonly showMnemonic: () => Promise<string>;
  readonly restoreMnemonic: (mnemonic: string) => Promise<string>;
  readonly resetOwner: () => Promise<string>;
  readonly clearScreen: () => void;
  readonly quit: () => void;
}

export interface TTYDep {
  readonly isInteractive: boolean;
}

export interface LoggerDep {
  readonly logger: Logger;
}

export interface ShortcutOptionsDep {
  readonly options: { readonly print: boolean };
}

export interface ReadlineDep {
  readonly readline: ReadlineInterface | null;
}

export interface CLIShortcut {
  readonly key: string;
  readonly description: string;
}

const handleShortcutError = (
  error: unknown,
  key: string,
  logger: Logger,
): void => {
  // Log error and return to prompt instead of killing process
  // This allows users to retry or use other shortcuts
  logger.error(`[shortcut] Error on '${key}':`, error);
  logger.info("Returning to prompt. Press h + Enter for help.");
};

const normalizeMnemonicInput = (s: string): string =>
  s.replace(/\r\n/g, "\n").replace(/\n/g, " ").replace(/\s+/g, " ").trim();

/**
 * Bind readline shortcuts (key + Enter). Dependencies use a single `deps` object (Evolu DI style).
 *
 * @returns Cleanup function (close readline when tearing down the CLI).
 */
export const bindShortcuts = (
  deps: ShortcutCommands &
    LoggerDep &
    TTYDep &
    ShortcutOptionsDep &
    ReadlineDep,
): (() => void) => {
  if (!deps.isInteractive || deps.readline == null) {
    if (deps.options.print) {
      deps.logger.info("Running non-interactive (shortcuts disabled)");
    }
    return () => {};
  }

  const rl = deps.readline;
  let actionRunning = false;

  const shortcuts: readonly CLIShortcut[] = [
    { key: "u", description: "show status" },
    { key: "s", description: "show mnemonic (copy manually)" },
    {
      key: "p",
      description:
        "restore mnemonic (type words, Ctrl+Shift+V / middle-click to paste, or Enter alone for clipboard)",
    },
    {
      key: "d",
      description:
        "reset owner immediately (restore with p if you saved mnemonic)",
    },
    { key: "c", description: "clear viewport (scrollback kept)" },
    { key: "q", description: "quit" },
  ];

  // Defer question() out of the synchronous 'line' handler stack. Calling
  // rl.question from inside 'line' breaks prompt / input in Node readline.
  const question = (q: string): Promise<string> =>
    new Promise((resolve) => {
      setImmediate(() => {
        rl.question(q, (answer) => {
          resolve(answer);
          setImmediate(() => {
            rl.prompt(true);
          });
        });
      });
    });

  const readMnemonicLine = async (): Promise<string> => {
    const typed = await question(
      "Mnemonic, then Enter (use Ctrl+Shift+V to paste): ",
    );
    return normalizeMnemonicInput(typed);
  };

  const showHelp = (): void => {
    deps.logger.info("");
    deps.logger.info("  Shortcuts (type letter + Enter)");
    for (const s of shortcuts) {
      deps.logger.info(`  ${s.key} + enter  ${s.description}`);
    }
    deps.logger.info("  h + enter  show this help");
    deps.logger.info("");
  };

  const runShortcut = async (
    key: string,
    fn: () => void | Promise<void | string>,
  ): Promise<void> => {
    if (actionRunning) {
      return;
    }
    actionRunning = true;
    try {
      const result = await fn();
      if (typeof result === "string") deps.logger.info(result);
    } catch (error) {
      handleShortcutError(error, key, deps.logger);
    } finally {
      actionRunning = false;
    }
  };

  const handleLine = async (line: string): Promise<void> => {
    const trimmed = line.trim().toLowerCase();

    if (trimmed === "h") {
      showHelp();
      return;
    }

    switch (trimmed) {
      case "u":
        await runShortcut("u", () => deps.showStatus());
        return;
      case "s":
        await runShortcut("s", () => deps.showMnemonic());
        return;
      case "p":
        await runShortcut("p", async () =>
          deps.restoreMnemonic(await readMnemonicLine()),
        );
        return;
      case "d":
        await runShortcut("d", () => deps.resetOwner());
        return;
      case "c":
        await runShortcut("c", () => {
          deps.clearScreen();
        });
        return;
      case "q":
        await runShortcut("q", () => deps.quit());
        return;
      default:
        return;
    }
  };

  rl.on("line", (line) => {
    void handleLine(line);
  });

  if (deps.options.print) {
    deps.logger.info("➜  press h + enter to show help");
  }

  rl.prompt(true);

  return () => {
    rl.close();
  };
};

export const computeStdinInteractive = (): boolean => {
  const ci = process.env["CI"];
  return (
    process.stdin.isTTY === true && ci !== "true" && ci !== "1" && ci !== ""
  );
};
