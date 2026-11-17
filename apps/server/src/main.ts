import { PortInUseError, serveFromEnv, SettingError } from "./index.ts";

try {
  await serveFromEnv();
}
catch (error) {
  if (!(error instanceof PortInUseError || error instanceof SettingError)) throw error;
  console.error(error.message);
  process.exitCode = 1;
}
