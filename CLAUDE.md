# Pagina — notes de développement (CLAUDE.md)

Ce fichier est le guide COURT à lire en début de session : méthode de test,
architecture, pièges récurrents, points ouverts. Le journal complet et daté de
chaque fonctionnalité/bug (historique, ~4 500 lignes) est dans
`docs/JOURNAL-DEVELOPPEMENT.md` — à consulter pour le détail d'un sujet précis,
et à compléter à chaque session. Feuille de route : `ROADMAP-PAGINA.md`.

Voir aussi `README.md` pour la présentation du projet côté utilisateur/dépôt.

## À reprendre en priorité

- **Sommaire : retour utilisateur du 2026-10-20 — « ce n'est pas très lisible à
  l'utilisation »**, sans précision. À clarifier avec lui (`AskUserQuestion`)
  AVANT de coder : coupure entre pages sans rappel du titre parent ? sommaire
  généré trop dense (pas de style par niveau) ? ou panneau latéral
  « Sommaire » peu pratique ? Détail dans le journal.
- Suite de l'audit du 2026-10-22 : découpage du corps de `MarkdownEditor.tsx`
  en hooks (un par commit, test réel dans l'app à chaque étape) et
  remplacement de `window.prompt/alert` — voir `ROADMAP-PAGINA.md`, priorité 0.
- **Impression/export refaits le 2026-10-22 mais à valider à l'usage** : section
  « Impression et export PDF » plus bas. Non testés ici : l'enregistrement par
  le vrai bouton (dialogue « Enregistrer sous » natif) et l'impression sur une
  vraie imprimante.
- Feuilles de route : `ROADMAP-PAGINA.md` (produit, priorités 0 à 5) et
  `ROADMAP-CASUALOFFICE.md` (ce qui est repris du fork de référence).

## Tester l'app directement (sans dépendre de captures d'écran de l'utilisateur)

`playwright-core` est installé en devDependency. On peut piloter la fenêtre
Tauri réellement ouverte (pas un navigateur séparé) via le port de debug
distant de WebView2 :

1. Lancer l'app avec la variable d'environnement :
   `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS="--remote-debugging-port=9222" npx tauri dev`
2. Se connecter et piloter :
   ```js
   const { chromium } = require('playwright-core');
   const browser = await chromium.connectOverCDP('http://localhost:9222');
   const page = browser.contexts()[0].pages()[0]; // la fenêtre de l'app
   // page.locator(...), page.keyboard.type(...), page.evaluate(...), etc.
   ```
   `page.evaluate(() => window.getSelection())` permet de vérifier la position
   réelle du curseur — bien plus rapide et fiable que d'interpréter des
   captures d'écran pour diagnostiquer un bug d'édition/curseur/layout.
3. Toujours annuler les frappes de test avant de rendre la main
   (`page.keyboard.press('Control+z')` en boucle) pour ne pas polluer le
   document réel de l'utilisateur — le contenu de test n'est de toute façon
   jamais sauvegardé sur disque tant qu'on n'appelle pas Ctrl+S.
4. Pour vérifier une mise en page d'IMPRESSION sans jamais ouvrir la boîte
   de dialogue système (bloquante, impossible à automatiser) : `page.pdf()`
   de Playwright fonctionne via CDP même sur une fenêtre WebView2 non
   lancée par Playwright (`connectOverCDP` suffit) — ça déclenche le vrai
   `Page.printToPDF` de Chromium, avec le vrai CSS `@media print`/`@page`
   de l'app. Écrire le buffer sur disque puis le lire directement avec
   l'outil Read (qui sait afficher un PDF page par page) permet de
   vérifier le rendu RÉEL de chaque page imprimée bien plus vite et plus
   fiablement qu'une capture d'écran avec `page.emulateMedia({media:
   'print'})` (qui peut afficher les sauts de page comme des grands trous
   blancs dans une capture "page complète" — pas un bug, juste un artefact
   de rendu du mode capture, à ne pas confondre avec un vrai problème de
   layout : toujours vérifier la géométrie réelle des `.xmd-page`
   — `getBoundingClientRect()` — ou générer un vrai PDF pour trancher).
   Ça a permis de confirmer en quelques secondes un bug de curseur qui
   résistait à plusieurs hypothèses au jugé (voir plus bas, bug `onUpdate`).

## Stack et architecture

Tauri (Rust) + React + TypeScript. Éditeur riche : Tiptap/ProseMirror avec
sérialisation Markdown via `tiptap-markdown`.

Trois couches séparées (pour permettre plus tard un module IA sans réécrire
l'éditeur) :

- **État document** : `src/core/types.ts`, `src/core/store/workspaceStore.ts`
  (arborescence + dossier ouvert), `src/core/store/tabsStore.ts` (onglets
  ouverts, contenu, dirty state).
- **Rendu/édition** : `src/ui/Editor/MarkdownEditor.tsx` (Tiptap), extensions
  custom dans `src/ui/Editor/extensions/` (ex. `PageBreak.ts`), le module de
  pagination `src/ui/Editor/pagination/` (voir son propre `README.md` —
  réutilisable tel quel dans un autre projet Tiptap/ProseMirror),
  `src/ui/Toolbar/`, `src/ui/TabBar/`, `src/ui/FileExplorer/`.
- **Persistance fichier** : `src/persistence/fileService.ts` (seul module
  autorisé à appeler `invoke` côté frontend), backend Rust dans
  `src-tauri/src/fs_commands.rs` (lecture/écriture/CRUD fichiers) et
  `src-tauri/src/watcher.rs` (watch du dossier de travail).
- **Couleurs UI** : nuancier officiel MBEF (anciennement `src/ui/theme/tokens.ts`, supprimé : jamais importé, les couleurs vivent dans les CSS)
  (Mon BE Fluides), référence de couleurs : `sapin`
  #003F2B (primaire : ruban, en-têtes de panneaux, éléments actifs),
  `prairie` #24AC6E (accents : onglet actif, cases cochées, boutons
  d'action), `ocean` #2F52A0 (liens, sommaire, titres), `charbon`
  #343334 (texte), `carotte` #EB5B1F (erreurs), `sable` #F7AE37
  (avertissements), `azur` #DFEFF8 (fonds informatifs). Toute nouvelle
  UI doit reprendre ces couleurs — ne pas inventer de teintes (le
  dialogue Mise en page les applique, voir « État d'avancement »).


## Pièges récurrents (à relire AVANT de toucher à l'éditeur)

Condensé du journal (`docs/JOURNAL-DEVELOPPEMENT.md`, historique complet daté
par fonctionnalité — à consulter pour le détail d'un bug précis).

- **Focus/sélection** : tout bouton, menu ou panneau qui agit sur la sélection
  de l'éditeur doit poser `onMouseDown={keepEditorFocus}`
  (`src/ui/focusGuard.ts`). Sans ça, le `mousedown` retire le focus à
  l'éditeur invisible et l'action s'applique à une sélection vide. Un test par
  `dispatchEvent("click")` ne détecte PAS ce bug : utiliser de vrais clics.
- **Réglages de mise en page** : toujours `tabsStore.patchLayout(path, patch)`,
  jamais un layout capturé dans une closure React (il est périmé au clic).
- **Éditeur invisible** : `.xmd-live-editor-host` doit rester
  `position: fixed` (en `absolute`, la sélection native fait défiler le
  conteneur). `view.posAtCoords` est inutilisable hors écran : la résolution
  clic → position passe par `pagination/cloneIndex.ts` + `resolveClickPosition`.
- **Zoom** : la mesure de pagination ne doit JAMAIS dépendre du zoom ;
  curseur et sélection se calculent par rapport à `.xmd-canvas-frame`.
- **Dialogues** : pas de `window.confirm()` (rejeté en silence sans
  permission) ni de `window.print()` (boucle JS/IPC sans effet) — utiliser le
  plugin dialog et les commandes Rust `print_window`/`export_pdf`.
  `window.prompt`/`alert` fonctionnent encore mais sont fragiles.
- **Permissions Tauri v2** : toute commande de fenêtre échoue en silence sans sa
  permission `core:window:allow-*` dans `capabilities/default.json` ; en cas de
  bouton « qui ne fait rien », lire les logs `tauri dev`.
- **API COM asynchrone** (ex. `PrintToPdf`) : jamais d'attente bloquante dans
  une commande Tauri — lancer, puis renvoyer le résultat par évènement.
- **`@media print`** (`App.css` pour le chrome, fin de `MarkdownEditor.css` pour
  le contenu) : après toute refonte du chrome de l'app, vérifier que toutes les
  classes racines visibles (ex. `.tbar`) y sont masquées ; tout nouveau repère
  d'édition (pastille, étiquette, fond de sélection) doit y être masqué aussi.
- **Contrat `EditorStats`** : tout nouveau champ doit être émis aux 5 points
  d'émission de `MarkdownEditor.tsx` (onUpdate, getStats, onSelectionUpdate et
  les deux émissions liées au repaint), sinon le ruban est « en retard ».
- **`ToolbarActions`** : `App.tsx` et `PaginaLight.tsx` font un spread du handle
  de l'éditeur ; une nouvelle action s'ajoute au handle et à l'interface
  `ToolbarActions` (Toolbar.tsx), nulle part ailleurs.
- **Extensions sur balise HTML partagée** (`sup`, `sub`, `div`…) : poser
  `priority` sur `parseHTML`, sinon une règle générique d'une autre extension
  l'emporte (voir `Footnote.ts`).
- **Tests dans l'app réelle** : un seul `tauri dev` vivant ; vérifier l'onglet
  actif et son état dirty AVANT de taper ; annuler (Ctrl+Z) et ne jamais
  sauvegarder ; redémarrer l'app complètement (pas juste HMR) avant de conclure
  qu'une interaction souris est cassée ; fichiers de test jetables, jamais un
  document de l'utilisateur ; `Write` plutôt qu'un heredoc pour les scripts
  contenant des antislashs.
- **Commiter souvent** : un retour arrière accidentel du disque a déjà coûté du
  travail non committé (voir journal, incident du 2026-10-21).

## Organisation de `src/ui/Editor/` (audit du 2026-10-22)

`MarkdownEditor.tsx` reste le composant central (éditeur invisible + couche
peinte + panneaux contextuels). Les fonctions sans état en ont été extraites :

- `editorTableOps.ts` — opérations de tableau (bordures, largeurs/hauteurs,
  alignement vertical, positions de cellules, type `GridLine`).
- `editorQueries.ts` — lectures de l'état (style/marques/alignement/liste
  actifs, objet sélectionné, recherche).
- `editorUtils.ts` — tailles de police, casse, presse-papiers, signets, mesures.
- `src/ui/focusGuard.ts` (`keepEditorFocus`) et `src/ui/useClickOutside.ts`.

Reste à découper : le corps du composant (~2 300 lignes d'effets : souris,
repaint, en-tête/pied, menus) en hooks, un par commit, avec test réel dans
l'app à chaque étape.

## Passe de test fonction par fonction (2026-10-22)

Menée par CDP sur l'app réelle avec un document jetable (créé puis supprimé).
**Corrigés** (un commit chacun) : bouton « Normal » mort (`ParagraphMarkdown`
écrasait `setParagraph`/Ctrl+Alt+0 — `addCommands`/`addKeyboardShortcuts` d'une
extension étendue REMPLACENT ceux du parent : toujours `...this.parent?.()`) ;
panneaux contextuels qui volaient le focus (Ctrl+Z mort après un clic) ;
« Pied de page » depuis le haut de la page 1 ouvrait un champ hors écran ;
**en-tête/pied vidé = fichier corrompu** (`<!-- empty-line -->` dans le JSON
`pagina:config` fermait le commentaire HTML, le reste du JSON fuyait dans le
corps) — le JSON est désormais échappé (`-->` → `>`) et les fichiers déjà
corrompus sont réparés à la lecture (`repairTruncatedConfig`, 3 tests).
**Vérifiés OK** : marques inline, styles de bloc, listes, alignements, tailles,
couleurs, tableaux (lignes/colonnes/fusion/bordures/menu contextuel), insertions
(saut de page, note, grille de tableau, emoji, lien, signet, renvoi, sommaire,
Mermaid, formule), en-tête/pied + variables, Rechercher/Remplacer, 8 dialogues,
format papier, règles glissantes, paramétrage, vues Markdown/Code, sauvegarde
(disque relu), explorateur (créer/renommer/dupliquer/supprimer), PDF d'impression,
mini-barre, pastille de langage, raccourcis.
**Non testés** : Imprimer et Exporter PDF natifs (dialogues système), Ouvrir un
fichier/dossier (dialogue système), fenêtre minimisée/déplacement, thème sombre.
**Constats sans correction** : l'onglet reste « modifié » après annulation
jusqu'au retour exact du texte brut du disque (comparaison de chaînes sérialisées,
pas de pile d'annulation) ; l'équation s'édite maintenant SUR la page (`math-field`
flottant), le panneau ne porte que la palette.
**Pièges de méthode** : (1) l'**auto-sauvegarde est active (60 s)** — un test sur
un document réel l'écrit sur disque : toujours un fichier jetable ; (2) après
beaucoup d'éditions HMR la session peut devenir « zombie » (couche peinte figée,
frappes perdues) : `page.reload()` avant de conclure à un bug ; (3) un double-clic
Playwright vise le CENTRE de l'élément (souvent du blanc à droite d'un paragraphe
court) : viser `position: {x: 20, y: 8}` ; (4) pour revenir à l'état initial, le
focus doit être dans l'éditeur (cliquer dans le document puis ~80 × Ctrl+Z) ;
(5) restaurer le zoom (barre de statut) et fermer les dialogues avant de relancer.

## Impression et export PDF (refonte du 2026-10-22)

Retour utilisateur : « l'impression marche moyen, l'export aussi, regarde ce
que fait Casual — on n'a pas l'aperçu ». Comparaison détaillée dans
`ROADMAP-CASUALOFFICE.md`. Mesuré en analysant le PDF natif page par page
(`pymupdf`) : papier **Letter** au lieu d'A4, **fonds perdus** (bandeaux,
surlignages), repère « Saut de page » imprimé, barres de défilement dans les
blocs de code.

- **`PrintToPdf` avec `None` = défauts WebView2** : Letter, sans fonds, et le
  `@page { size }` du CSS est IGNORÉ. `export_pdf` (`print_commands.rs`) prend
  donc `width_mm`/`height_mm` (calculés par `resolvePageSizeMm` dans
  `App.tsx`) et construit des `ICoreWebView2PrintSettings` via
  `ICoreWebView2Environment6::CreatePrintSettings` : format du document, marges
  0 (déjà dans le padding des pages), fonds oui, en-tête/pied du navigateur non.
- **Aperçu** : `print_window` ouvre `COREWEBVIEW2_PRINT_DIALOG_KIND_BROWSER`
  (boîte d'impression d'Edge : aperçu des pages, plages, imprimante, copies,
  couleur) au lieu de `..._SYSTEM` (boîte Windows sans aperçu).
- **`@page` dynamique** : `MarkdownEditor.tsx` injecte
  `<style id="xmd-print-page-size">` selon le format/orientation du document ;
  la règle fixe `A4` de `App.css` a été retirée.
- **CSS d'impression** (fin de `MarkdownEditor.css`) : `print-color-adjust:
  exact` sur les pages ; repères d'édition (`.xmd-pagebreak`, `.xmd-sectionbreak`,
  `.xmd-toc-marker`) en `visibility: hidden` (l'espace reste réservé, la
  pagination ne bouge pas) ; `.xmd-docfield` sans fond ; `pre`/`.tableWrapper`
  sans défilement.
- **Tester l'export sans dialogue** : depuis CDP, `window.__TAURI_INTERNALS__`
  est toujours disponible — `invoke('plugin:event|listen', …)` puis
  `invoke('export_pdf', { path, widthMm: 210, heightMm: 297 })`, attendre
  l'évènement `pdf-export-result` (payload `null` = succès), puis analyser le
  fichier avec `pymupdf` (taille de page, texte, `get_pixmap` pour voir).
  `page.pdf()` de Playwright n'est PAS représentatif de l'export natif (c'est
  un autre chemin Chromium, qui respecte le CSS).
- **Dialogue d'impression à fermer à la main** : la boîte du navigateur n'est pas
  dans le DOM ; ne pas lui envoyer de touches système (`SendKeys`) sans accord de
  l'utilisateur, qui peut avoir la main sur sa machine.

## Pages de garde (refonte du 2026-10-22, en deux temps)

Retour utilisateur : « je ne peux pas bien éditer, je génère du HTML bizarre ».
Constats (mesurés dans l'app) : le fichier contenait des `<p style="background:
rgb(…)…">` ; les champs `{{title}}` vides étaient invisibles (bandeau vert « vide »
impossible à remplir) et illisibles sur fond sombre ; Entrée en fin de paragraphe
clonait le style (un bandeau de plus) ; `<strong>` + `font-weight` doublés.

- **Étape 1** : champ vide = son libellé en grisé ; fond de champ translucide (couleur
  héritée) ; clic sur un champ éditable = saisie directe (`docFieldEdit.ts`, écrit dans
  les propriétés via `setEditableDocField`) ; Entrée en fin de paragraphe à `htmlStyle`
  = paragraphe normal ; gras/italique/souligné de `<p style>` lus par les marques seulement.
- **Étape 2** : le .md est du Markdown PUR (`# {{title}}`, `## {{subject}}`, lignes de
  texte). Le marqueur de début porte `theme=nom` ; `CoverTheme.ts` pose
  `data-cover-theme` sur chaque bloc de la zone EN DÉCORATION (l'éditeur invisible mesure
  donc les vraies hauteurs, les clones peints l'héritent) ; `ui/Cover/coverThemes.css`
  style PAR TYPE DE BLOC (pas par position : insérer une ligne ne décale rien). Les titres
  de couverture sont exclus du sommaire, de la numérotation et des ancres peintes
  (`coverZoneContentOffsets`/`isInCoverZoneContent`, appliqués dans `TocMarker.ts`,
  `HeadingAutoNumber.ts`, `paintPages.ts` — les trois doivent rester d'accord, sinon les
  liens du sommaire visent le mauvais `id`). Menu « Apparence » dans le panneau Page de
  garde ; la galerie rend son aperçu avec les mêmes règles CSS. Anciens fichiers à HTML
  inline : inchangés, en style libre. Voir `docs/format-fichier.md` §5.4.
- **Marges de la page de garde** (2026-10-23) : jetons `margin-top|left|right=mm` dans le
  marqueur de début ; `CoverTheme.ts` les pose en `style` de décoration sur chaque bloc de
  la zone (`margin-left: calc(Xmm - var(--xmd-margin-left))`) — ce sont des marges de BLOC,
  pas de page : la pagination (qui mesure l'éditeur invisible) reste exacte sans toucher au
  paginateur, et une marge plus petite que celle du document fait déborder un bandeau jusqu'au
  bord de la page (vérifié à l'écran et dans le PDF natif). Limites : la marge haute ne vaut
  que si la zone ouvre le document ; pas de marge basse ; le repère de début de zone (visible
  à l'écran seulement) décale ~5 mm l'affichage par rapport au PDF.
- Piège : `coverThemes.css` doit être importé APRÈS `MarkdownEditor.css`
  (spécificité égale avec `.xmd-prosemirror h1` : le dernier gagne).
- Piège de méthode : un clic Playwright à `x: 20` sur un titre de couverture tombe sur le
  champ (qui ouvre sa saisie) — viser à droite du champ pour placer le curseur.
- Piège de méthode : appuyer sur `End` puis `Enter` sans pause ne suffit pas, PM lit la
  sélection native de façon asynchrone — attendre ~300 ms entre les deux dans un script.

## Audit de code (2026-10-22)

Inventaire par `knip` (code mort) et `jscpd` (doublons) : `tsc` propre,
51 tests verts (48 + 3 sur le commentaire de config), 1,6 % de lignes dupliquées. Retirés : 3 dépendances inutiles,
`tokens.ts`, constantes mortes, exports superflus. Faux positifs de knip à
connaître : `src/embed/*`, `harness-embed/`, `vite.lib.config.ts` sont la
version légère (`npm run build:embed`), pas du code mort. `npm audit` signale
des failles préexistantes (dompurify via mermaid, katex) non corrigées.
Reste ouvert : remplacer `window.prompt/alert` (7 appels : lien, signet,
renvoi, nouveau fichier) par un vrai composant de dialogue.

## Décisions techniques notables

- **StarterKit Tiptap v3** inclut déjà `Link` et `Underline` : ne pas les
  importer séparément (ça provoquait un warning de duplication d'extensions).
  Les configurer via `StarterKit.configure({ link: {...} })`.
- **Pagination à l'écran = pagination réelle = pagination imprimée**, et
  c'est la même dans les trois cas depuis la réécriture du 2026-09-12 (voir
  section détaillée plus haut). Le document ProseMirror reste un flux
  unique en interne (éditeur invisible), mais ce que l'utilisateur voit et
  ce qui sort à l'impression sont la MÊME couche peinte (`paintPages.ts`),
  pas deux moteurs de pagination différents qui pourraient diverger. Voir
  `src/ui/Editor/pagination/README.md` pour la documentation complète de
  cette architecture (écrite pour être réutilisable telle quelle dans un
  autre projet Tiptap/ProseMirror).
- **Sauts de page et futurs marqueurs de mise en page** : toujours passer par
  des commentaires HTML Markdown standards (`<!-- pagebreak -->`, futur
  `<!-- toc -->`, etc.) pour rester lisible dans n'importe quel autre outil
  Markdown. Voir `src/ui/Editor/extensions/PageBreak.ts` comme modèle à suivre.

## Feuille de route de développement (ordre proposé)

1. ~~Diagnostiquer et corriger l'aperçu avant impression~~ **Fait
   (2026-09-13)**, refondu le 2026-10-22 (format réel, fonds, aperçu du
   navigateur) — voir « Impression et export PDF » plus haut.
2. ~~En-têtes/pieds de page + marges/format papier/orientation
   configurables~~ **Fait (2026-09-13)** — voir section "Mise en page
   configurable par document" plus haut.
3. Numérotation de page configurable.
4. Sommaire automatique.
5. Gestion des images mode atelier (copie réelle dans `images/`).
6. Mode paquet `.mdpack` + bascule automatique `.xmd`.
7. ~~Actions manquantes de l'explorateur (renommer/dupliquer/supprimer)~~
   **Fait (2026-10-17)** — chantier explorateur complet : recherche,
   menu contextuel, badge modifié, tri, tooltip, rafraîchissement
   robuste, ergonomie clavier. Reste le déplacement (drag & drop).
8. Thème sombre.

La feuille de route À JOUR est `ROADMAP-PAGINA.md` (priorités 0 à 5) : cette
liste n'est conservée que pour mémoire de l'ordre historique.

## Feuille de route produit (hors périmètre V1, ne pas développer maintenant)

Documentée dans `README.md` — module IA, multi-fenêtres, autres formats
d'export, licence.

- **Import `.docx` (idée de l'utilisateur, pas encore détaillée/décidée,
  2026-09-13)** : l'utilisateur a mentionné avoir "une petite idée" de
  comment s'y prendre, à discuter avec lui avant de commencer quoi que ce
  soit — ne pas partir sur une implémentation (ex. réutiliser le fork
  `pagina-docx-engine`/CasualOffice mis de côté, ou un convertisseur externe
  type Pandoc) sans validation explicite de son approche.
