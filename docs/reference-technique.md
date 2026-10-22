# Pagina — Référence technique

Documentation d'implémentation pour les développeurs. Le [guide d'utilisation](guide-utilisation.md) décrit les fonctions côté utilisateur. `CLAUDE.md` (racine) garde l'historique détaillé des décisions et pièges rencontrés.

## Stack

- **Tauri v2** (Rust) — application Windows, appels fichiers/watcher en Rust (`src-tauri/src/fs_commands.rs`, `watcher.rs`).
- **React 19 + TypeScript strict** — interface.
- **Tiptap v3 / ProseMirror** — édition riche ; **tiptap-markdown** pour la sérialisation.
- **KaTeX** (formules), **Mermaid** (diagrammes), **MathLive** (éditeur d'équations WYSIWYG), **lowlight** (coloration de code).
- **Zustand** — état (workspace, onglets).
- Tests : **Vitest + Testing Library** (unitaires) et **Playwright sur CDP** (vérifications dans la fenêtre Tauri réelle).

## Architecture en trois couches

| Couche | Rôle | Fichiers |
|---|---|---|
| État | Modèle documentaire, onglets, arborescence | `src/core/types.ts`, `src/core/store/*.ts` |
| Rendu/édition | Tiptap, pagination, ruban, panneaux | `src/ui/**` |
| Persistance | Seul module appelant `invoke` (Tauri) | `src/persistence/fileService.ts` |

Règles : les appels Tauri passent **toujours** par `fileService.ts` ; l'UI ne contient pas de logique métier ; les stores Zustand sont testables directement sans DOM.

## Le principe central : éditeur invisible + couche peinte

L'éditeur ProseMirror réel est **hors écran** (`left: -5000px`, opacité 0) ; ce que voit l'utilisateur est une **couche peinte** : de vraies boîtes A4 à taille fixe, contenant des **clones** du contenu (`cloneNode(true)`), recalculés à chaque modification par `src/ui/Editor/pagination/paintPages.ts` (avec `pagination/paginator.ts` pour la répartition en pages).

Avantages : pagination exacte à l'écran = à l'impression ; la structure du fichier reste du Markdown pur.
Conséquences : tout ce qui est interactif doit traduire écran → éditeur invisible.

### Résolution clic → position (le cœur du système)

`pagination/cloneIndex.ts` reconstruit à chaque repaint un **index des clones** : parcours parallèle original/clone (TreeWalker synchronisé), chaque nœud texte du clone → position ProseMirror (`view.posAtDOM`), chaque cellule td/th → sa plage.

`pagination/resolveClickPosition.ts` résout un clic :
1. **Chemin rapide** : `document.caretRangeFromPoint` sur le texte visible + position indexée → précision caractère, insensible au zoom.
2. **Repli géométrique** : balayage `coordsAtPos` borné **à la cellule cliquée** (le balayage global causait des « sauts » de sélection entre cellules).

Autres briques de la couche peinte : curseur dessiné (`caretPosition.ts`), surbrillance de sélection (`selectionHighlight.ts`), auto-scroll au glissement, double-clic (mot), triple-clic (paragraphe), Maj+clic (étendre) — gestionnaires dans `MarkdownEditor.tsx`.

### Sérialisation : Markdown + commentaires invisibles

- Le corps du document est du **Markdown standard** (GFM : tableaux, notes de bas de page, listes de tâches).
- Ce qui n'a pas d'équivalent Markdown est encodé en **commentaires HTML** reconnus par les moteurs Markdown et invisibles ailleurs : saut de page, marqueur/emplacement de sommaire, et l'en-tête de configuration `<!-- pagina:config {...} -->` (marges, format papier, styles de titres, en-tête/pied… — `src/core/pageLayout.ts`, `serializeDocumentConfig`/`extractDocumentConfig`).
- Les mises en forme sans équivalent Markdown (couleur, police, alignement, bordures complexes) sont sérialisées en `<span style>` ou HTML de tableau — lisible partout, hors syntaxe Markdown pure.
- `$formule$` / `$$formule$$` (convention Pandoc) pour les formules.

## Ruban

`src/ui/Toolbar/Toolbar.tsx` + `Toolbar.css` + `icons.tsx` (icônes SVG 24×24, stroke 1.6, `currentColor` ; boutons lettrés G/I/S/Aa en texte stylé). Deux onglets (Accueil, Insertion) ; typologie à la Word : grande icône + libellé, petite icône empilée, icône seule avec tooltip obligatoire. Le coin droit (barre d'onglets) porte Explorateur et Commenter, comme « Partager » dans Word.

Les commandes du ruban transitent par l'interface `ToolbarActions` (prop `actions`), implémentée par `MarkdownEditorHandle` (`MarkdownEditor.tsx`, `useImperativeHandle`) — App.tsx mappe le handle vers les actions. Le routage `cmd()` redirige toutes les commandes vers le mini-éditeur d'en-tête/pied tant qu'il est ouvert.

## Panneaux contextuels

`src/ui/ContextualPanels/ContextualPanelHost.tsx` : colonne droite unique, onglets quand plusieurs contextes actifs. Chaque contexte suit le **front montant** d'un signal `EditorStats` (Tableau : `insideTable` ; Sommaire : `insideToc` ; En-tête/pied : `headerFooterEditMode` ; Équation : `math` ; Diagramme : `mermaid` ; Styles : bouton). Contenus sans châssis : `TablePropertiesPanel`, `HeaderFooterPanel`, `TocPanel`, `HeadingStylesPanel`, `EquationPanel`, `DiagramPanel`. Le panneau **Rechercher** (`FindReplacePanel`) n'est pas contextuel : ouvert volontairement par Ctrl+F, avec « seed » de requête depuis le champ de la barre de titre.

### Équation (MathLive)

`src/ui/Math/EquationPanel.tsx` : champ `<math-field>` importé **dynamiquement** (ne charge pas au démarrage). Une formule est un nœud **atome** (`inlineMath`/`blockMath`, `src/ui/Editor/extensions/Math.ts`) désigné par `NodeSelection` ; `EditorStats.math` porte `{kind, source, pos}` — `pos` sert de clé React (remontage au changement de formule, jamais à la frappe). Chaque frappe → `updateMathSource` → `setNodeAttribute` → repaint. Sortie LaTeX standard. **Palette de symboles** (`eq-palette`) ouverte par défaut, repliée par le bouton ⌨ de l'`PanelHeader` ; édition directe sur la page (la formule peinte suit le champ). Pas de clavier virtuel plein écran (supprimé sur retour utilisateur).

### Diagramme (Mermaid)

`src/ui/Mermaid/DiagramPanel.tsx` : édition de la source Mermaid dans le panneau avec **rendu live** (SVG) à chaque frappe. Même cycle que l'Équation : front montant de `stats.mermaid` (NodeSelection sur le bloc), fermeture quand la sélection quitte le diagramme. La source reste un bloc de code Mermaid standard dans le `.md`.

## Règles graduées

`src/ui/Editor/pagination/Ruler.tsx` (+ `Ruler.css`) : horizontale sticky en haut du wrapper de pages, verticale sticky à gauche dans `.xmd-editor-row`. Graduation mm (marques 10/5/1 mm), zones de marge grisées, triangles de marge **glissants** → `RulerMarginPatch` → marges du document en direct (mêmes bornes que le dialogue Mise en page). La verticale répète un motif de page (graduations + marges + triangles) avec la période « hauteur de page + espace entre pages », translaté en continu par `MarkdownEditor.tsx` via les variables CSS `--xmd-ruler-v-offset` / `--xmd-ruler-v-stride` pour rester calée sur les pages réelles.

## Rechercher / Remplacer

`src/ui/FindReplace/FindReplacePanel.tsx` : parcourt le document Tiptap (texte des nœuds + positions ProseMirror), liste des résultats avec contexte, saut à l'occurrence, Remplacer / Tout remplacer (modifie le document via les transactions), options Respecter la casse / Mots entiers. Le champ de recherche de la barre de titre (`TabBar`) porte sa requête dans le panneau en direct (prop `findSeed`) ; Ctrl+F basculé au niveau App.

## Réglages globaux et utilisateur

`src/core/store/settingsStore.ts` (roadmap 1.4/1.5) : tout ce qui ne dépend PAS d'un document — persistés en localStorage (`pagina.settings`, `pagina.user`), silencieux si indisponible (même garde que `pagina.defaultPageLayout`). `useSettingsStore` (règles, auto-sauvegarde + intervalle) est lu par App (effet d'interval qui n'enregistre que les onglets `dirty`) et MarkdownEditor (prop `showRulers` : rendu conditionnel des règles, recomputeVRuler déjà gardé). `useUserStore` (prénom + nom, V1 ; la V2 MBEF/Ingenerix ne passera jamais par ce store) alimente l'avatar de la barre de titre via `userInitials()`. Fenêtres : `ui/Settings/SettingsDialog.tsx` (langue/thème/correction auto verrouillés « à venir ») et `ui/User/UserDialog.tsx`.

## Propriétés du document et variables

`src/ui/PageSetup/DocumentPropertiesDialog.tsx` : titre, sujet, auteur, mots-clés, commentaires + **champs personnalisés** libres — stockés dans `pagina:config` (commentaire HTML d'en-tête). `resolveHeaderFooterText` (`core/pageLayout.ts`) substitue `{{title}}`, `{{subject}}`, `{{keywords}}`, `{{created}}`, `{{modified}}` et **chaque champ personnalisé par son propre nom** dans les en-têtes/pieds.

## Paragraphe : retraits, espacement, interligne

- `src/ui/Paragraph/ParagraphDialog.tsx` : fenêtre « Retrait et espacement » façon Word (alignement + retraits cm du paragraphe sous le curseur ; espacement avant/après pt + interligne = réglages du document ; aperçu live ; « Définir par défaut » via `saveDefaultPageLayout`).
- `src/ui/Editor/extensions/ParagraphMarkdown.ts` : retraits stockés en **centimètres** (`indentCm`/`indentRightCm`, repli HTML sur le `<p>`, migration transparente des anciens fichiers, borne 12,5 cm) ; boutons Tabulation ± du ruban = pas de 1,25 cm ; commande `setParagraphIndent(leftCm, rightCm)`.
- **Piège de closure** : toute modification unitaire de mise en page passe par `tabsStore.patchLayout(path, patch)` — jamais par une capture de `activeTab.layout` passée par l'appelant (régler l'interligne puis l'espacement écrasait l'interligne avant le correctif du 2026-10-21).

## En-tête / pied de page

Contenu Markdown ordinaire dupliqué à chaque page (`layout.header/footer.text`). Édition : mini-éditeur Tiptap flottant posé sur la zone peinte (`startHeaderFooterEdit` dans `MarkdownEditor.tsx`), extensions identiques au principal + `Markdown` (parse/serialize). Le ruban s'y applique via `cmd()`. `paintPages.ts` reçoit le HTML converti (`mdToHtml`) ; variables substituées par `resolveHeaderFooterText` (`core/pageLayout.ts`). Positionnement « à partir du bord » : champ `fromEdgeMm` → variables CSS `--xmd-header-top`/`--xmd-footer-bottom`.

## Explorateur

`src/ui/FileExplorer/` (composant + store `workspaceStore.ts`). Points clés : recherche aplatie debouncée (150 ms), menu contextuel maison (jamais de `window.prompt`/`alert`/`confirm` — silencieusement cassés dans WebView2), tri avec `Intl.Collator` fr, watcher Rust avec debounce, onglets mis à jour au renommage/suppression. Tests Vitest : `__tests__/FileExplorer.*.test.tsx` (38 tests).

## Mise en page

`src/ui/PageSetup/PageSetupDialog.tsx` (3 onglets à la Word) + `src/core/pageLayout.ts` : formats A3/A4/A5/Letter/Legal + dimensions personnalisées (`widthMm`/`heightMm` optionnels, primés par `resolvePageSizeMm`), « Définir par défaut » persisté en localStorage (`pagina.defaultPageLayout`, utilisé par `createNewFile`).

## Couleurs : charte MBEF

Nuancier de référence (les couleurs sont écrites dans les feuilles CSS). Sapin `#003F2B` (primaire, en-têtes), prairie `#24AC6E` (accents, actions), ocean `#2F52A0` (liens), charbon `#343334` (texte), carotte `#EB5B1F` (erreurs), sable `#F7AE37` (avertissements), azur `#DFEFF8` (fonds informatifs). Toute nouvelle UI doit s'y conformer.

## Tests

- **Unitaires** : `npm test` (Vitest, jsdom, alias `@`, setup `@testing-library/jest-dom/vitest` + `cleanup()` explicite). Les commandes Tauri sont mockées via `vi.mock("@tauri-apps/api/core")`, les stores testés directement.
- **Fenêtre réelle** : lancement avec `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9222` (`run-tauri-dev.cmd`), pilotage Playwright `connectOverCDP('http://localhost:9222')`. Pièges : fenêtre réduite = viewport 146×20 (restaurer via `restore-window.ps`) ; HMR de `workspaceStore.ts` = singleton Zustand perdu (`page.reload()`) ; ne jamais sauvegarder les documents réels de l'utilisateur pendant un test.

## Version légère (intégrable)

`src/embed/PaginaLight.tsx` — composant sans Tauri ni explorateur pour MBEF Platform. Build : `npm run build:embed` → `releases/pagina-light-<version>.tgz`. Détails : [version-legere.md](version-legere.md).

## Script de lancement du développement

```
npm run dev        # vite
npx tauri dev      # application complète (ou run-tauri-dev.cmd avec CDP)
npm test           # tests unitaires
npm run build      # build production
```
