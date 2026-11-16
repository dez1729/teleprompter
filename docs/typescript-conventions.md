# Code style

House TypeScript conventions that go beyond what Prettier and oxlint enforce.

## Functions

- Write arrow functions (`const doThing = () => {}`), not function declarations.
- Write named helpers or plain statements instead of IIFEs.

## Types

- Use `interface` for object shapes; use type aliases for unions and other non-object types.
- Use string-literal union types instead of `enum`.
- Lift inline parameter object types into a named `interface`.
- Write object literals passed as request bodies or returned as typed payloads as `{ ... } satisfies Foo as Foo`. `satisfies` catches missing or misspelled fields; `as` keeps the declared type.

## Null and type checks (`es-toolkit`)

- Check for null/undefined with `isNil(x)` / `!isNil(x)`, not `!x` or `!!x`.
- Check runtime types with the `es-toolkit` predicates (`isString`, `isNumber`, `isFunction`, ...), not `typeof`.

## Array access

- Index with `.at(i)`, not `arr[i]`.
- When the element is known to exist, assert it with a non-null bang: `arr.at(0)!`.

## Comments

- Write `//` comments, including multi-line ones; leave existing `/* */` blocks as they are.
- Keep each comment to at most 2–3 sentences, stating only what the code can't show.
- Leave out cross-references ("see x") and verification notes ("tested on y", "confirmed working").

## Layout

- Put a blank line between code blocks.
