import {
  createFormatTypeError,
  String as EvoluString,
  object,
  optional,
  union,
} from "@evolu/common";

export const LogLevel = union("DEBUG", "INFO", "ERROR");
export type LogLevel = typeof LogLevel.Type;

const EnvInput = object({
  TEICH_DB_PATH: optional(EvoluString),
  TEICH_LOG_LEVEL: optional(LogLevel),
  TEICH_RELAY_URL: optional(EvoluString),
  TEICH_WATCH_DIR: optional(EvoluString),
});

const formatTypeError = createFormatTypeError();

const parseEnv = () => {
  const processEnv = process.env as Record<string, string | undefined>;
  // biome-ignore-start lint/complexity/useLiteralKeys: process.env is typed via index signature; dot access triggers TS4111.
  const dbPathInput = processEnv["TEICH_DB_PATH"];
  const logLevelInput = processEnv["TEICH_LOG_LEVEL"];
  const relayUrlInput = processEnv["TEICH_RELAY_URL"];
  const watchDirInput = processEnv["TEICH_WATCH_DIR"];
  // biome-ignore-end lint/complexity/useLiteralKeys: process.env is typed via index signature; dot access triggers TS4111.

  const envInput = {
    ...(dbPathInput !== undefined ? { TEICH_DB_PATH: dbPathInput } : {}),
    ...(logLevelInput !== undefined
      ? { TEICH_LOG_LEVEL: logLevelInput.toUpperCase() }
      : {}),
    ...(relayUrlInput !== undefined ? { TEICH_RELAY_URL: relayUrlInput } : {}),
    ...(watchDirInput !== undefined ? { TEICH_WATCH_DIR: watchDirInput } : {}),
  };

  const parsed = EnvInput.fromUnknown(envInput);

  if (!parsed.ok) {
    const details = formatTypeError(parsed.error);
    console.error(`Invalid TEICH_* environment configuration:\n${details}`);
    process.exit(1);
  }

  const raw = parsed.value;

  return {
    dbPath: raw.TEICH_DB_PATH,
    logLevel: raw.TEICH_LOG_LEVEL ?? "ERROR",
    relayUrl: raw.TEICH_RELAY_URL,
    watchDir: raw.TEICH_WATCH_DIR,
  } as const;
};

export const env = parseEnv();
