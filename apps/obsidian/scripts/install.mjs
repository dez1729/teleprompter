import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";

const vault = process.argv[2];
if (!vault || !existsSync(join(vault, ".obsidian"))) {
  console.error("Usage: pnpm install:obsidian <path to your vault>\nThe folder must be an Obsidian vault (it has a .obsidian folder).");
  process.exit(1);
}

const target = resolve(vault, ".obsidian", "plugins", "teleprompter");
mkdirSync(target, { recursive: true });
for (const file of ["main.js", "manifest.json"]) copyFileSync(new URL(`../dist/${file}`, import.meta.url), join(target, file));
console.log(`Installed in ${target}. In Obsidian, turn on Teleprompter under Settings → Community plugins.`);
