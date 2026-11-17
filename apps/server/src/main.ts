import { PortInUseError, serveFromEnv } from "./index.ts";

try {
  await serveFromEnv();
}
catch (error) {
  console.error(error instanceof PortInUseError ? error.message : String(error));
  process.exitCode = 1;
}
