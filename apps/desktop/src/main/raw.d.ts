// Vite inlines a file as a string with the ?raw suffix (main bundle and vitest alike).
declare module '*?raw' {
  const content: string;
  export default content;
}
