# Pagina léger — version intégrable

Une version réduite de Pagina, pensée pour être **intégrée dans une autre application** (MBEF Platform, plus tard
l'app Windows Ingenerix) : WYSIWYG, pages A4 réelles, ruban limité à l'onglet « Accueil ». Elle n'a ni explorateur,
ni onglets de fichiers, ni dépendance à Tauri.

## Ce qu'elle contient / ne contient pas

| Inclus | Absent |
|---|---|
| Police, Paragraphe, Styles (Normal / Titre 1 / Titre 2…), Liens, Éléments (tableau, séparateur, bloc de code), En-tête et pied de page, Sommaire | Onglets « Format avancé » et « Extras », Explorateur, bouton Image, dialogues de mise en page |
| Pagination A4, zoom, lecture seule, Markdown standard + commentaires `<!-- pagina:config -->` | Diagrammes Mermaid et formules KaTeX (remplacés par des stubs vides au build : plusieurs Mo économisés ; le texte reste intact dans le .md) |

## Code

- `src/embed/PaginaLight.tsx` — le composant (`value`, `onChange`, `onSave`, `documentTitle`, `height`, `resetKey`, `readOnly`).
- `src/embed/index.ts` — point d'entrée de la bibliothèque.
- `src/ui/Toolbar/Toolbar.tsx` — prop `leger` (ruban réduit). Sans effet dans Pagina elle-même.
- `src/ui/Editor/MarkdownEditor.tsx` — prop `readOnly`. Sans effet dans Pagina elle-même.
- `vite.lib.config.ts` — build en bibliothèque (React et toutes les dépendances restent externes).

## Fabriquer le paquet

```
npm run build:embed
```

Produit `releases/pagina-light-<version>.tgz` (la version est `VERSION_PAQUET` dans `scripts/build-embed.mjs`,
indépendante de celle de Pagina). Le paquet déclare ses propres dépendances (Tiptap, lowlight…) et React en
`peerDependencies` (18 ou 19).

## L'utiliser dans une application

L'application dépend du `.tgz` **figé sur un tag** de ce dépôt (l'URL brute GitHub est immuable pour un tag) :

```json
"pagina-light": "https://raw.githubusercontent.com/KarlMinneMbef/Pagina/<tag>/releases/pagina-light-<version>.tgz"
```

```tsx
import { PaginaLight } from "pagina-light";
import "pagina-light/style.css";

<PaginaLight value={markdown} onChange={setMarkdown} height={640} />
```

`value` n'est lu qu'au montage ; changer `resetKey` recharge un nouveau contenu. `onChange` reçoit le Markdown
complet, commentaires de mise en page réinjectés, et n'est appelé qu'après une vraie interaction de l'utilisateur
(jamais pour la normalisation initiale du document).

**Mettre à jour l'application hôte** après une évolution de Pagina : incrémenter `VERSION_PAQUET`,
`npm run build:embed`, commiter le `.tgz`, poser un nouveau tag, puis changer le tag dans le `package.json` de l'hôte.

## Tester

```
node scripts/test-embed.mjs
```

Lance le banc d'essai (`harness-embed/`) dans Chrome ou Edge via Playwright : ruban léger, page A4, frappe,
sérialisation Markdown (tableau GFM, gras, titres), lecture seule, aucune erreur console.
