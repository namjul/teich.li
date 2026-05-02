import {
  createFormatTypeError,
  String as EvoluString,
  object,
  optional,
} from "@evolu/common";

const EnvInput = object({
  TEICH_BASE_PATH: optional(EvoluString),
});

const formatTypeError = createFormatTypeError();

const parseEnv = () => {
  // biome-ignore lint/complexity/useLiteralKeys: process.env is typed via index signature; dot access triggers TS4111.
  const basePath = import.meta.env["VITE_TEICH_BASE_PATH"];

  const envInput = {
    ...(basePath !== undefined ? { TEICH_BASE_PATH: basePath } : {}),
  };

  const parsed = EnvInput.fromUnknown(envInput);

  if (!parsed.ok) {
    const details = formatTypeError(parsed.error);
    console.error(`Invalid TEICH_* environment configuration:\n${details}`);
    process.exit(1);
  }

  const raw = parsed.value;

  return {
    basePath: raw.TEICH_BASE_PATH,
  } as const;
};

export const env = parseEnv();
