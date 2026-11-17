import { optionsFromEnv, startServer } from "./index.ts";

try {
  const server = await startServer(optionsFromEnv());
  console.log(`Teleprompter listening on ${server.url}`);
  // As PID 1 in a container, Node ignores these signals unless it handles them.
  const stop = () => void server.close().then(() => process.exit(0));
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);
}
catch (error) {
  const { code } = error as NodeJS.ErrnoException;
  console.error(code === "EADDRINUSE" ? "That port is already in use. Set PORT to use another." : String(error));
  process.exit(1);
}
