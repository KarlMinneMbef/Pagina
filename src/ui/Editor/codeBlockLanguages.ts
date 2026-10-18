/**
 * Langages proposés pour les blocs de code (pastille de langage posée
 * sur le bloc actif — voir MarkdownEditor.tsx ; anciennement un
 * `<select>` du ruban Insertion, retiré 2026-10-17).
 *
 * Doit correspondre aux clés de `common` de lowlight (voir
 * `MarkdownEditor.tsx`, `createLowlight(common)`) — sinon la coloration
 * syntaxique ne s'applique pas silencieusement. Vérifié une fois via
 * `Object.keys(common)`, pas d'import direct pour éviter de coupler ce
 * fichier à la config interne de l'éditeur.
 */
export const CODE_BLOCK_LANGUAGE_OPTIONS = [
  "javascript", "typescript", "python", "java", "c", "cpp", "csharp",
  "html", "css", "scss", "less", "json", "yaml", "xml", "markdown",
  "bash", "shell", "sql", "php", "ruby", "go", "rust", "swift", "kotlin",
  "r", "lua", "perl", "graphql", "makefile", "ini", "diff",
] as const;
