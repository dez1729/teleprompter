# Teleprompter

## Start from origin/main

Worktrees here can start on a stale line of history. Before picking work or claiming a feature is missing, `git fetch` and compare `HEAD` with `origin/main`; read the roadmap from `origin/main:README.md`.

## Domain language

- **Naming anything (identifiers, UI copy, docs, commit messages)**: [`GLOSSARY.md`](./GLOSSARY.md). Use its terms, capitalised as written (Script, Push, Reading window, Follow), and never the words it lists under _Avoid_.
- **Changing how the Script is stored, filtered, or synced between windows**: [`docs/adr/`](./docs/adr). Read the ADRs first; record a new decision there when you overturn one.

## Language specific conventions

- These docs, with `.oxlintrc.json` and `.prettierrc`, are the project's style.
- **Writing or editing any `.ts`/`.tsx`**: [`docs/typescript-conventions.md`](./docs/typescript-conventions.md)
- **Effects, state, or picking a library**: [`docs/react-and-state.md`](./docs/react-and-state.md)

## Done

A change is done when every command in [`.github/workflows/checks.yml`](./.github/workflows/checks.yml) passes locally, plus `pnpm test:e2e` when it touches the Prompter, the Editor, or the server. A user-visible change also updates `README.md` in the same branch.

## Commits

Conventional commits with the package as scope (`web`, `server`, `cli`, `protocol`, `e2e`, `obsidian`). Write the subject as the behaviour the reader gets, in plain words: `fix(web): keep the line being read inside the Reading window`.
