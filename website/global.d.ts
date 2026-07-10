// Ambient declaration for side-effect CSS imports (e.g. `import './globals.css'`).
// The repo's strict base tsconfig (verbatimModuleSyntax) rejects side-effect
// imports of untyped modules; Next processes the actual CSS through its bundler.
declare module '*.css';
