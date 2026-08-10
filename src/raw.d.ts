// Vite `?raw` imports return the file's contents as a string (used by parity.test.ts
// to read the vanilla offscreen engine source without Node's fs).
declare module '*?raw' {
  const content: string;
  export default content;
}

// One file is read off disk, in invariants.test.ts: `?raw` returns an empty string for CSS because
// vitest stubs stylesheets, and the popup's fixed geometry is worth asserting anyway — three
// separate pieces of content moved the window before it was written down. Declared here instead of
// adding @types/node to the project for a single call.
declare module 'node:fs' {
  export function readFileSync(path: URL | string, encoding: 'utf8'): string;
}
