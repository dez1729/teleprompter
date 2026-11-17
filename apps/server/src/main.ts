import { PortInUseError, serveFromEnv, stopOnSignals } from "./index.ts";

try {
  stopOnSignals(await serveFromEnv());
}
catch (error) {
  console.error(error instanceof PortInUseError ? error.message : String(error));
  process.exitCode = 1;
}
