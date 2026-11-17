import { PortInUseError, serveFromEnv } from "./index.ts";

try {
  await serveFromEnv();
}
catch (error) {
  if (!(error instanceof PortInUseError)) throw error;
  console.error(error.message);
  process.exitCode = 1;
}
