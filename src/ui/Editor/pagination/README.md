# Module de pagination — "éditeur invisible + couche peinte"

Ce dossier implémente une pagination à l'écran pour un éditeur ProseMirror
(ou Tiptap, qui est construit dessus) sous forme de pages A4 (ou autre
format) à **taille fixe**, comme dans Word — pas un flux continu avec des
séparateurs calculés. Il a été écrit pour Pagina (éditeur Markdown), mais
**ne dépend de rien de spécifique à Pagina** : aucune référence au
filesystem, au Markdown, ni au store de l'application. Il ne dépend que de
`@tiptap/pm` (ProseMirror) et du DOM du navigateur. Pensé pour être copié
tel quel dans un autre projet Tiptap/ProseMirror qui a besoin de la même
chose.

## Le problème que ça résout

Un éditeur riche (Tiptap/ProseMirror, ContentEditable, etc.) est un flux de
texte continu. Si on veut donner l'impression visuelle de plusieurs feuilles
de papier empilées (comme Word), deux approches naïves existent et
échouent toutes les deux :

1. **Un seul flux continu + des espaces calculés** entre les "pages"
   (widgets de décoration ProseMirror, `padding`, etc.) pour simuler la
   coupure. Problème : la hauteur d'une "page" n'est jamais réellement
   fixe — elle se recalcule à chaque frappe, et de petites erreurs
   d'arrondi/de mesure s'accumulent (voir la section Pièges plus bas).
2. **Restructurer le schéma du document** avec un vrai nœud "page" par
   page (comme le ferait un vrai format de document paginé). Problème :
   il faudrait re-répartir le contenu entre les nœuds "page" à chaque
   frappe, ce qui déplace des nœuds ProseMirror en permanence et rend le
   suivi du curseur/de la sélection extrêmement fragile.

## L'architecture retenue

**Un éditeur ProseMirror réel mais invisible, plus une couche peinte en
lecture seule par-dessus.**

```
┌─────────────────────────────────────────────────────────┐
│  .xmd-live-editor-host  (invisible, hors écran)          │
│  ┌─────────────────────────────────────────────────┐    │
│  │  <EditorContent>  ← LE document ProseMirror réel │    │
│  │  Curseur, sélection, undo/redo, IME : 100% natif │    │
│  └─────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────┘
                          │
                          │ à chaque update (onUpdate, onSelectionUpdate)
                          ▼
┌─────────────────────────────────────────────────────────┐
│  .xmd-canvas-frame  (visible, c'est ce que voit l'utilisateur)
│  ┌───────────┐  ┌───────────┐  ┌───────────┐             │
│  │ .xmd-page │  │ .xmd-page │  │ .xmd-page │   ...       │
│  │ (clones)  │  │ (clones)  │  │ (clones)  │             │
│  └───────────┘  └───────────┘  └───────────┘             │
│  + .xmd-fake-caret (curseur dessiné à la main)           │
│  + .xmd-selection-layer (surbrillance dessinée à la main)│
└─────────────────────────────────────────────────────────┘
```

- L'éditeur réel vit dans une zone **hors écran mais focusable et
  mesurable** (jamais `display:none` — ça casserait les mesures ; jamais
  `visibility:hidden` — ça empêcherait le focus). C'est la SEULE source de
  vérité éditable.
- À chaque modification, on mesure la hauteur RÉELLE déjà rendue de
  chaque bloc de premier niveau (le navigateur a déjà fait tout le travail
  de mise en ligne du texte) et on les répartit en pages via une petite
  machine à états (`paginator.ts`).
- On peint alors des **clones** (`cloneNode(true)`, jamais les vrais
  nœuds) dans des boîtes de page à hauteur CSS fixe (`paintPages.ts`).
  Les vrais nœuds ProseMirror ne sont JAMAIS déplacés — ProseMirror gère
  lui-même le DOM de sa zone éditable, en sortir des nœuds casserait son
  suivi interne DOM ↔ document.
- Un clic sur un clone est traduit en position réelle dans l'éditeur
  invisible (`resolveClickPosition.ts`).
- Un curseur (`caretPosition.ts`) et une surbrillance de sélection
  (`selectionHighlight.ts`) sont dessinés à la main par-dessus les clones,
  puisque la vraie sélection ProseMirror est invisible.

## Fichiers

| Fichier | Rôle |
|---|---|
| `paginator.ts` | Machine à états pure (aucune dépendance DOM) : reçoit une suite de hauteurs de blocs + espacements, renvoie sur quelle page chacun tombe. Réutilisable même hors navigateur (testable unitairement). |
| `paintPages.ts` | Mesure les blocs de premier niveau du document ProseMirror réel, appelle `paginator.ts`, puis reconstruit le DOM peint (clones dans des boîtes `.xmd-page`). |
| `resolveClickPosition.ts` | Traduit un clic (coordonnées écran) sur un clone en position document ProseMirror réelle. Contient `findPosNearCoords`, l'alternative maison à `view.posAtCoords` (voir Pièges). |
| `caretPosition.ts` | Calcule où dessiner le curseur clignotant à partir de la vraie position de sélection. |
| `selectionHighlight.ts` | Calcule les rectangles de surbrillance d'une sélection étendue (un rectangle par ligne visuelle, via `Range.getClientRects()`). |
| `zoom.ts` | Paliers de zoom et fonctions de clamp — purement utilitaire, aucun lien avec le reste (juste inclus ici parce que le zoom affecte les mesures de `paintPages.ts`). |

## Comment l'intégrer dans un autre projet

1. Copier ce dossier tel quel (seule dépendance : `@tiptap/pm`).
2. Dans le composant qui monte l'éditeur Tiptap :
   - Rendre `<EditorContent>` dans une zone avec le CSS de
     `.xmd-live-editor-host` (voir `MarkdownEditor.css` dans ce projet
     pour les valeurs exactes, et surtout les commentaires expliquant
     POURQUOI chaque propriété est nécessaire — ne pas les simplifier
     sans relire les pièges ci-dessous).
   - Ajouter un conteneur `.xmd-canvas-frame` (position: relative, sans
     padding) contenant un `<div>` pour le canvas peint, un `<div>` pour
     le curseur, et un `<div>` pour la couche de surbrillance.
   - Dans `onUpdate`/`onSelectionUpdate` de `useEditor`, appeler
     `paintPages`, `computeCaretScreenPosition` et
     `computeSelectionRects`, et pousser leurs résultats dans le DOM
     (voir `MarkdownEditor.tsx` pour l'exemple complet — c'est le
     meilleur point de départ à copier-adapter).
   - Sur `mousedown`/`mousemove` du canvas peint, utiliser
     `findClonedBlock` + `resolveClickPosition` pour repositionner la
     vraie sélection ProseMirror (`editor.commands.setTextSelection`).
3. Adapter les constantes de mise en page (taille de page, marges) à
   l'unité de mesure du nouveau projet — ce module ne connaît que des
   pixels ; la conversion mm→px (voir `mmToPx` dans `MarkdownEditor.tsx`)
   est à la charge de l'appelant.
4. Pour l'impression/export PDF : imprimer directement le canvas peint
   (voir la section "Impression" de `CLAUDE.md` du projet Pagina) — pas
   besoin d'un moteur de pagination séparé (type Paged.js), puisque les
   boîtes `.xmd-page` sont déjà des pages A4 à taille exacte. Un simple
   CSS `@media print` avec `break-after: page` sur `.xmd-page` suffit.
   **Piège spécifique à Tauri/WebView2 (Windows), sans rapport avec ce
   module mais rencontré juste après l'avoir branché à l'impression** :
   `window.print()` ne fonctionne PAS dans Tauri 2.x/wry 0.55 sur Windows
   (boucle interne infinie entre le JS et l'IPC, jamais de vrai appel
   natif — voir `src-tauri/src/print_commands.rs` du projet Pagina pour le
   contournement complet via l'API COM `ICoreWebView2_16::ShowPrintUI`).
   Sans rapport avec la pagination elle-même, mais à connaître si ce
   module est réutilisé dans une autre appli Tauri.

## Pièges rencontrés (à ne PAS reproduire)

Ordonnés à peu près comme on les rencontrerait en réimplémentant ça de
zéro — chacun a coûté un vrai bug utilisateur avant d'être compris.

1. **`.offsetHeight` arrondit à l'entier.** Sur une page qui empile 20+
   blocs, l'arrondi de chacun s'accumule et peut désynchroniser la hauteur
   totale d'une page de plusieurs dizaines de pixels. Utiliser
   `getBoundingClientRect().height` (précision sub-pixel) — mais elle EST
   affectée par `transform: scale()` (zoom), donc diviser par le zoom
   courant pour rester dans un espace de pixels "logique" constant.

2. **Le curseur/les marges d'une page ne doivent JAMAIS venir d'un
   `padding` CSS sur la boîte de page elle-même** si les autres pages
   obtiennent leur marge autrement (ex. un espace entre boîtes) — ça finit
   par être compté une fois de trop sur la première page et pas assez sur
   les autres. Une seule et même logique pour la marge de TOUTES les
   pages (dans ce projet : `contentHeight = pageHeight - margins.top -
   margins.bottom`, appliqué de façon identique à chaque page dans
   `paginator.ts`).

3. **Un saut de page manuel doit combler la page qui se termine** à
   pleine hauteur (espace vide en dessous), exactement comme un saut de
   page naturel — sinon les pages n'ont visuellement pas toutes la même
   hauteur. Piège précis : `previousPageLeftover` doit être calculé de la
   même façon dans les deux branches (rupture forcée et rupture par
   dépassement) de `placeBlock()`.

4. **Le curseur dessiné à la main doit partager EXACTEMENT le même
   ancêtre positionné que le canvas peint**, sans aucun autre élément
   avec `padding`/`position:relative` entre les deux. Sinon le curseur
   calculé "juste" (au dixième de pixel) est rendu à un endroit visible
   différent, parce que son `position:absolute` se résout contre un
   ancêtre différent de celui utilisé pour le calcul.

5. **Le canvas invisible doit avoir EXACTEMENT la même largeur de contenu
   que les clones peints**, au centième de pixel près — pas "à peu près".
   Une largeur calculée indépendamment (ex. conversion mm→px en JS)
   diffère presque toujours de quelques millièmes de pixel de la largeur
   réellement calculée par le moteur CSS du navigateur pour la même valeur
   en mm. Cet écart est invisible à l'œil, mais peut suffire à faire
   retomber un mot de fin de ligne d'un côté et pas de l'autre — dès qu'un
   mot est à la limite, TOUT le retour à la ligne du reste du paragraphe
   diverge entre l'original et le clone, et la traduction clic→position
   se met à pointer vers une position complètement différente (même ligne
   visuelle, mot différent, ou pire : mauvaise cellule dans un tableau).
   **Fix** : ne jamais faire confiance à un calcul indépendant — mesurer
   la largeur RÉELLEMENT rendue des clones après le premier rendu, et
   forcer l'éditeur invisible à cette largeur exacte.

6. **`getBoundingClientRect().width` sur un élément `box-sizing:
   border-box` inclut le padding** (c'est la largeur de BORDURE, pas de
   CONTENU). Piège classique en résolvant le point 5 : "corriger" la
   largeur avec cette valeur directement la fait fausser dans l'autre
   sens (trop large). Toujours soustraire `padding-left`/`padding-right`
   (`getComputedStyle`) pour obtenir la largeur de contenu réelle, celle
   qui contraint effectivement la mise en ligne du texte.

7. **`height:0; overflow:hidden` casse la largeur intrinsèque d'un
   `<table>`** placé dedans (un tableau en layout auto ignore la largeur
   du conteneur à hauteur nulle et se rend à sa largeur "naturelle",
   souvent bien plus large). Si la zone invisible doit être hors du flux
   normal, préférer un décalage hors écran
   (`position:absolute; left:-Npx`) à un piège `height:0`.

8. **`view.posAtCoords()` (l'API native de ProseMirror "quelle position
   document est sous ce pixel") échoue silencieusement dès que l'élément
   est hors du viewport visible** — quelle que soit la distance testée, et
   même en cas de SUPERPOSITION exacte avec la couche peinte visible (où
   elle accroche alors le mauvais élément, celui du dessus). Cause
   probable : elle s'appuie en interne sur du hit-testing navigateur
   (type `elementFromPoint`), qui ne fonctionne QUE pour des coordonnées
   dans la fenêtre visible. Un élément positionné hors écran par CSS
   existe bien "en mise en page" mais n'est jamais trouvable par point.
   **Fix retenu ici** : abandon complet de `posAtCoords`, remplacé par une
   recherche géométrique maison (`findPosNearCoords` dans
   `resolveClickPosition.ts`) qui balaie les positions candidates et
   garde celle dont `coordsAtPos` (le sens INVERSE — position vers
   coordonnées — qui lui fonctionne très bien hors écran) tombe le plus
   près de la cible, avec une forte pondération sur l'écart vertical pour
   choisir la bonne ligne avant la bonne colonne.

9. **Une position document à une frontière de ligne est ambiguë** (elle
   désigne à la fois "fin de la ligne précédente" et "début de la ligne
   suivante") — `coordsAtPos(pos)` sans préciser de côté ne renvoie
   qu'une seule des deux interprétations, parfois la mauvaise, ce qui
   pouvait faire atterrir un clic en fin de ligne sur la ligne d'au-dessus
   dans un bloc de code (texte continu avec retours à la ligne internes).
   **Fix** : tester `coordsAtPos(pos, -1)` ET `coordsAtPos(pos, 1)` pour
   chaque position candidate dans `findPosNearCoords`, garder le meilleur
   des deux côtés.

10. **Une sélection étendue n'a pas de forme rectangulaire simple** dès
    qu'elle couvre plusieurs lignes ou plusieurs blocs. `coordsAtPos` ne
    donne qu'un point, pas une étendue — utiliser `Range.getClientRects()`
    du navigateur (un rectangle par ligne visuelle, gère nativement les
    retours à la ligne) sur une plage DOM construite avec
    `view.domAtPos()`, plutôt que d'essayer de recalculer soi-même la
    géométrie d'un texte enveloppé.

## Limites connues (non résolues à ce jour)

- Interaction zoom + pagination : un souci a été signalé (voir CLAUDE.md
  du projet Pagina) mais pas encore diagnostiqué.
- Clic en frontière de ligne dans un bloc de code : corrigé (piège n°9),
  mais l'approche par balayage linéaire (`findPosNearCoords`) est en
  O(taille du bloc) à chaque clic — potentiellement lent sur un bloc de
  code de plusieurs milliers de caractères (non mesuré, pas de plainte à
  ce jour).
