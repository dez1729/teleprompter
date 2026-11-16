import { loadDotEnv, optionsFromEnv, startServer } from "./index.ts";

try {
  loadDotEnv();
  const options = optionsFromEnv();
  const server = await startServer(options);
  console.log(`Teleprompter listening on ${server.url}`);
  console.log(`Follow can listen through ${options.transcribersLabel}.`);
}
catch (error) {
  const { code } = error as NodeJS.ErrnoException;
  console.error(code === "EADDRINUSE" ? "That port is already in use. Set PORT to use another." : String(error));
  process.exit(1);
}
