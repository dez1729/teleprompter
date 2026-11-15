import { copyFileSync, mkdirSync } from "node:fs";
import { build } from "esbuild";

const root = new URL("..", import.meta.url);
const out = new URL("dist/", root);
mkdirSync(out, { recursive: true });

await build({
  entryPoints: [new URL("src/main.ts", root).pathname],
  outfile: new URL("main.js", out).pathname,
  bundle: true,
  format: "cjs",
  platform: "browser",
  target: "es2022",
  external: ["obsidian", "electron", "@codemirror/*", "@lezer/*"],
  logLevel: "warning",
});
copyFileSync(new URL("manifest.json", root), new URL("manifest.json", out));
console.log(`Built the Obsidian plugin in ${out.pathname}`);
