// Vite `?raw` imports return the file's contents as a string (used by parity.test.ts
// to read the vanilla offscreen engine source without Node's fs).
declare module '*?raw' {
  const content: string;
  export default content;
}
