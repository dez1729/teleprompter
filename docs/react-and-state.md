# React and state

## Effects

- Reach for `useEffect` last: derive values during render, and handle user actions in event handlers ([You Might Not Need an Effect](https://react.dev/learn/you-might-not-need-an-effect)). `eslint-plugin-react-you-might-not-need-an-effect` flags the common cases.
- Do not do any async work in useEffect like fetch unless I approve it.
- To wait for the DOM, observe the real ready signal (a ref callback, `ResizeObserver`, `MutationObserver`, an `onLoad` event). Nested `requestAnimationFrame` calls ("double rAF") are lint-flagged and need explicit approval.

## Library choices

`package.json` holds several overlapping libraries; use these for new code:

| Job                     | Library        |
| ----------------------- | -------------- |
| Server state / fetching | TanStack Query |
