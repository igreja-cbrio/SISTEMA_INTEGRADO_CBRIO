// Permite importar arquivos .html como string crua via o sufixo ?raw do Vite.
// (Usado por src/pages/atlas/Atlas.tsx para embutir o atlas no iframe.)
declare module '*.html?raw' {
  const content: string;
  export default content;
}
