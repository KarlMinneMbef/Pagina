// Variante "/vitest" : branche les matchers (toBeInTheDocument, etc.) sur le
// `expect` de Vitest sans exiger de globales.
import "@testing-library/jest-dom/vitest";
// Sans `globals: true`, @testing-library/react n'installe pas son
// auto-cleanup afterEach : il faut le faire soi-même, sinon le DOM des
// tests précédents pollue les requêtes suivantes.
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => {
  cleanup();
});
