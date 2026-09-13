# Pagina — notes de développement (CLAUDE.md)

Ce fichier sert à suivre l'avancement réel du projet entre les sessions : ce qui
est fait, ce qui est cassé, ce qui reste à faire. À tenir à jour à chaque
session de travail (ne pas laisser dériver par rapport au code réel).

Voir aussi `README.md` pour la présentation du projet côté utilisateur/dépôt.

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

## Audit de code (2026-09-13)

Passage demandé explicitement par l'utilisateur ("fait un audit de code, il
faut bien documenter car la mise en page pourra nous resservir sur d'autres
projets"). Constats et actions :

- **Mort-vivant supprimé** : `src/ui/PrintPreview/` (composant + CSS),
  `src/types/pagedjs.d.ts`, dépendance npm `pagedjs` — l'ancien système
  d'aperçu/impression basé sur Paged.js, remplacé par l'impression directe
  de la couche peinte (voir section "Impression / export PDF" plus bas).
  `npm install` relancé pour purger `node_modules`/le lockfile.
- **Le module de pagination (`src/ui/Editor/pagination/`) est le morceau de
  code le plus généralement réutilisable de tout le projet** : il ne
  dépend que de `@tiptap/pm` et du DOM, rien de spécifique à Pagina
  (filesystem, Markdown, store). Documentation dédiée écrite dans
  `src/ui/Editor/pagination/README.md` : rôle de chaque fichier, comment
  l'intégrer dans un autre projet, et la liste complète des 10 pièges
  rencontrés (mesures sub-pixel, `posAtCoords` peu fiable hors écran,
  `height:0` qui casse les tableaux, etc.) — à consulter AVANT de
  retoucher quoi que ce soit dans ce dossier, pour ne pas réintroduire un
  bug déjà corrigé une fois.
- **Fichiers audités et jugés propres** (pas de mort-vivant, pas
  d'incohérence) : `src/core/pageLayout.ts`, `src/core/store/tabsStore.ts`
  (la protection anti-double-ouverture par `Map` de promesses en cours est
  toujours en place et cohérente), `src/persistence/fileService.ts` (des
  fonctions comme `renamePath`/`deletePath`/`duplicatePath`/`createFolder`
  existent déjà côté Rust/service mais ne sont pas encore appelées depuis
  l'UI — normal, voir "Pas commencé" plus bas, ce n'est pas du code mort
  mais de la préparation en avance).
- **Pas d'audit de sécurité approfondi effectué** (pas demandé) : à noter
  si un jour pertinent, `src/persistence/fileService.ts` est bien le seul
  point d'entrée vers `invoke`, ce qui reste la bonne pratique établie dès
  le début du projet.

## État d'avancement par fonctionnalité

### Fait et fonctionnel
- **Intégration du nouveau logo Pagina (2026-09-13)** — deux fichiers déposés
  par l'utilisateur dans `public/` : `pagina-logo-icon.svg` (icône seule,
  document plié vert Sapin + "P") et `pagina-logo-lockup.svg` (icône +
  nom "Pagina" + accroche "Éditeur Markdown, mise en page incluse").
  Branchés à trois endroits : favicon (`index.html`, remplace
  `vite.svg`), titre de l'onglet navigateur/fenêtre (`<title>Pagina</title>`,
  remplaçait encore le texte par défaut "Tauri + React + Typescript"), et le
  logo dans `TitleBar.tsx` (remplace l'emoji 🖹 par une vraie `<img>` pointant
  sur l'icône seule — le lockup complet, avec le nom "Pagina" en toutes
  lettres, ne convient pas à cet emplacement car le nom du document/app
  s'affiche déjà juste à côté au centre de la barre). `pointer-events: none`
  sur `.tbar-logo` : ce logo doit rester zone de déplacement de fenêtre
  (`data-tauri-drag-region` sur le fond de la barre), pas un élément
  interactif qui l'intercepterait. Vérifié via l'endpoint JSON de CDP
  (`http://localhost:9222/json`) plutôt qu'une capture d'écran Playwright —
  `title`/`faviconUrl` corrects, `Read` du SVG a aussi permis de confirmer
  visuellement le contenu réel de l'icône (rendu comme une image).
- **Refonte visuelle/structurelle de l'interface façon Word (2026-09-13), en 4
  sections, sur demande explicite de l'utilisateur (maquette + spec précise).
  Explicitement cadrée comme PUREMENT VISUELLE : aucune logique métier, aucun
  store, aucun appel `invoke`, aucune fonction de `pageLayout.ts` /
  `paintPages.ts` / `fileService.ts` modifiés — seuls les éléments marqués
  "NON FONCTIONNEL" ci-dessous sont de purs placeholders.**
  1. **Barre supérieure fusionnée** (`src/ui/TitleBar/TitleBar.tsx`, nouveau) :
     l'ancienne barre de titre système + l'ancienne "quickbar" (nom de
     fichier + Nouveau/Enregistrer/Imprimer) deviennent une seule rangée,
     façon Word — logo, Enregistrer, Annuler/Rétablir (nouveaux, branchés sur
     l'historique Tiptap existant), Nouveau, Ouvrir un dossier, Imprimer, un
     chevron "Personnaliser" (NON FONCTIONNEL) ; au centre le titre
     `<fichier> — Pagina` ; à droite une barre "Rechercher" (NON
     FONCTIONNELLE, pas de recherche à ce stade), un avatar figé "KM" (NON
     FONCTIONNEL, pas de système d'utilisateurs), puis minimiser/agrandir/
     fermer. **Nécessite une fenêtre sans décorations natives**
     (`"decorations": false` dans `tauri.conf.json`) — l'application n'avait
     PAS de barre de titre personnalisée avant cette page : minimiser/
     agrandir/fermer sont implémentés ici directement via
     `@tauri-apps/api/window` (`getCurrentWindow()`), pas repris d'un code
     antérieur. A fallu ajouter les permissions Tauri correspondantes dans
     `src-tauri/capabilities/default.json`
     (`core:window:allow-minimize/-maximize/-unmaximize/-toggle-maximize/
     -close`) : `core:window:default` (inclus dans `core:default`) ne donne
     que des permissions de LECTURE sur la fenêtre, pas d'action — sans cet
     ajout les boutons ne font rien, sans la moindre erreur visible côté
     frontend. Glisser la fenêtre : attribut `data-tauri-drag-region` posé
     sur le fond de la barre (pas sur les boutons), aucun JS nécessaire.
  2. **Ruban Accueil réorganisé** (`Toolbar.tsx`) : ordre des groupes
     Police → Paragraphe → Styles → Liens et médias → Éléments → Pages →
     En-tête et pied de page → Sommaire (le bouton Explorateur reste à part,
     hors groupes, comme avant). L'ancien menu déroulant "Titre ▾" devient
     une galerie de boutons `StyleGallery` (Normal / Titre 1 / Titre 2 / un
     chevron pour les niveaux 3-6, réutilisant l'ancien `HeadingPicker`) —
     le bouton du style sous le curseur est mis en évidence (fond blanc,
     texte vert Sapin). Ça nécessitait une vraie nouvelle donnée qui
     n'existait pas encore : `EditorStats.activeBlockStyle` (nouveau champ,
     calculé par `getActiveBlockStyle(editor)` dans `MarkdownEditor.tsx` via
     `editor.isActive("heading", { level })`, remonté à la fois dans
     `onUpdate`, `onSelectionUpdate` et le calcul de page courante au
     défilement, pour rester à jour aussi bien en tapant qu'en déplaçant
     seulement le curseur). Ajout d'un petit lanceur `›` après le libellé
     des groupes Police/Paragraphe (TODO, pas de dialogue dédié pour
     l'instant), Styles (ouvre `HeadingStyleDialog`, remplace l'ancien
     bouton 🎨 dans le groupe) et Pages (ouvre `PageSetupDialog`, remplace
     l'ancien bouton ⚙). L'ancien groupe fusionné "Mise en page" est scindé
     en un groupe "Pages" (saut de page + lanceur) et un groupe séparé
     "En-tête et pied de page" (boutons En-tête/Pied de page + menu
     Variable). Le bouton "Normal" de la galerie appelait à tort
     `toggleHeading(1)` dans une première version (bascule H1, pas un vrai
     retour au paragraphe) — corrigé en ajoutant une vraie action
     `setParagraph` (Tiptap `editor.chain().focus().setParagraph().run()`,
     déjà fourni par l'extension Paragraph du StarterKit) plutôt que de
     détourner `toggleHeading`.
  3. **Explorateur de fichiers** (`FileExplorer.tsx`) : ajout d'une barre de
     recherche sous l'en-tête (NON FONCTIONNELLE — pas de filtrage
     d'arborescence à ce stade) et d'une étiquette de section (nom du
     dossier de travail, petites capitales) avec deux icônes "nouveau
     dossier"/"nouveau fichier" — branchées sur de vraies actions
     (`createNewFolder`, nouvelle action du `workspaceStore` enveloppant
     `createFolder` de `fileService.ts` + `refreshTree()` ; `createNewFile`
     existant, réutilisé tel quel). Le fichier de l'onglet actif est
     maintenant mis en évidence par une barre d'accent verte à gauche
     (`box-shadow: inset`, pas de `border-left` pour ne pas décaler le texte)
     + un fond clair, plutôt que le simple survol d'avant — nécessite de
     transmettre `activePath` (déjà disponible dans `App.tsx` via
     `useTabsStore()`) en nouvelle prop jusqu'à `FileExplorer`/`TreeNode`,
     qui ne le recevait pas du tout auparavant.
  4. **`PageSetupDialog` réorganisé en onglets internes** : "Page" (format
     papier et orientation remplacés par des cartes cliquables plutôt que des
     `<select>`, reste des champs inchangé), "En-tête / pied de page"
     (contenu strictement identique à avant, juste déplacé dans son propre
     onglet) et "Titres et sommaire" (n'duplique PAS le contenu de
     `HeadingStyleDialog` — l'ouvre par-dessus, avec `draft` du
     `PageSetupDialog` comme `layout` et `onApply` qui met juste à jour ce
     même `draft` : plus sûr qu'une fusion manuelle des deux formulaires, un
     seul et même code gère la logique de styles de titre partout où elle
     est utilisée, y compris depuis le ruban directement).
  - **Testé via Playwright/CDP contre l'app réelle** (voir méthode en haut de
    ce fichier) : capture de la barre fusionnée + ruban réordonné (correspond
    à la maquette), Annuler/Rétablir fonctionnels (texte tapé puis annulé/
    rétabli), bascule Agrandir/Restaurer, mise en évidence dynamique du bon
    bouton de la galerie de styles (Titre 1 appliqué → bouton "Titre 1"
    surligné), les 3 onglets de `PageSetupDialog` (cartes Format/Orientation
    cliquables, onglet "Titres et sommaire" ouvrant bien `HeadingStyleDialog`
    par-dessus), la barre d'accent de fichier actif dans l'explorateur.
    **Piège de méthode rencontré pendant ces tests** : la fenêtre déjà
    ouverte avec `--remote-debugging-port=9222` d'une session précédente
    avait un VRAI dossier de travail de l'utilisateur ouvert (pas un dossier
    de test) — un clic automatisé a fini par taper du texte de test dans une
    cellule de tableau d'un fichier réel (`Nouveau document.md`, un CCTP
    réel, pas un fichier vide comme son nom le suggérait). Annulé
    immédiatement (`Ctrl+Z` en boucle) et revérifié caractère par caractère
    (`textContent` de l'éditeur invisible ne contient plus le texte de test)
    avant de continuer — **jamais supposer qu'un fichier nommé "Nouveau
    document.md" dans le dossier ouvert d'une session précédente est vide ou
    jetable : toujours vérifier son contenu réel avant d'y taper quoi que ce
    soit pendant un test**, et confirmer qu'aucune sauvegarde n'a eu lieu
    (pas de `Ctrl+S`, pas de point/indicateur "non enregistré" resté affiché
    sur l'onglet après l'annulation).
  - **Limite connue, acceptée sciemment** : le nouveau lanceur `›` du groupe
    "Police" et du groupe "Paragraphe" n'ouvre encore rien (pas de boîte de
    dialogue dédiée existante à brancher) — TODO explicite dans le code, pas
    un oubli.
  - **Correctif de découvrabilité (2026-09-13), remonté par l'utilisateur :
    "je ne trouve plus le paramétrage des titres".** Le lanceur `›` du
    groupe "Styles" ouvre bien `HeadingStyleDialog` (logique inchangée),
    mais sa toute première version était beaucoup trop discrète (10px,
    faible opacité) — visuellement quasi identique aux lanceurs TODO de
    Police/Paragraphe qui, eux, ne font rien : impossible de deviner
    lequel est cliquable. **Fix purement visuel** (`Toolbar.css`,
    `.tb-group-launcher`) : lanceur agrandi (14px, gras, forte opacité) et
    surtout les lanceurs SANS `onClick` sont désormais nettement plus
    ternes (`opacity`/couleur très réduite à l'état désactivé) que les
    lanceurs fonctionnels — la différence de style rend visible, sans texte
    supplémentaire, quels lanceurs mènent réellement quelque part.
  - **Regroupement supplémentaire (2026-09-13), sur suggestion de
    l'utilisateur** ("saut de page et notes à mettre dans paragraphe, juste
    les icônes ?") : les groupes "Pages" et "Notes" — chacun réduit à un
    seul bouton depuis la scission du point 2 ci-dessus — sont supprimés,
    leurs boutons (Saut de page, Note de bas de page) rejoignent
    "Paragraphe" en icônes seules (`.tb-btn-icon`, cohérent avec le reste
    du groupe), à la suite de Puces/Numérotée/Tâches/Citation. Le lanceur
    `›` qui ouvrait `PageSetupDialog` (auparavant sur "Pages") est déplacé
    sur "Paragraphe" — c'est désormais son seul lanceur fonctionnel,
    remplaçant le placeholder TODO qui s'y trouvait. Ordre final des
    groupes de l'onglet Accueil : Police → Paragraphe → Styles → Liens et
    médias → Éléments → En-tête et pied de page → Sommaire. Aucun
    changement de logique (mêmes actions, juste déplacées visuellement).
- **Refonte de l'onglet "Format avancé" (2026-09-13)**, purement
  visuelle/structurelle sur demande explicite de l'utilisateur : aucune
  action n'a changé de comportement, seuls l'emplacement et l'apparence des
  boutons évoluent.
  - **Groupe "Nettoyage" supprimé** : son unique bouton ("Effacer la mise
    en forme", `clearFormatting`) rejoint le groupe "Police", en dernière
    position de sa première ligne.
  - **Groupe "Police" réorganisé sur 2 lignes explicites** (nouveau
    `.tb-group-row`, un `<div>` flex par ligne — pas la répartition
    automatique colonne par colonne de `.tb-group-buttons`, qui n'aurait pas
    permis de choisir précisément quel bouton va sur quelle ligne) :
    ligne 1 = sélecteur Police, sélecteur Taille, puis "Agrandir"/"Réduire
    la police" et "Modifier la casse" (icônes ajoutées à la demande de
    l'utilisateur, qui pensait ces actions déjà existantes — **elles
    n'existaient PAS** : aucune notion de "police actuelle + 1 taille" ni de
    changement de casse côté éditeur avant cette page. Conformément à
    l'instruction explicite de ne pas inventer de logique, ces 3 boutons
    sont posés `disabled`, purs repères visuels avec `title="… (à venir)"`
    et un commentaire TODO — à spécifier avec l'utilisateur avant de les
    câbler), puis "Effacer la mise en forme" (déplacé, voir ci-dessus).
    Ligne 2 = Souligné, Indice, Exposant, Couleur du texte, Surlignage —
    ces deux derniers gagnent un petit chevron `▾` PUREMENT DÉCORATIF
    (`.tb-swatch-caret`, `pointer-events:none`) : toute la surface du
    bouton ouvrait déjà (et ouvre toujours) le même sélecteur de couleur
    natif (`input[type=color]` superposé) — le chevron ne crée pas un
    second contrôle, juste une meilleure affordance visuelle façon Word.
    Pas de choix de style de soulignement existant → bouton Souligné resté
    simple, sans chevron (l'utilisateur avait anticipé cette alternative).
  - **Icônes du groupe "Alignement" remplacées** : les anciens glyphes
    texte (`⯇≡`/`≡`/`≡⯈`/`☰`, peu lisibles à cette taille) laissent place à
    un nouveau composant `AlignIcon` — 4 petites barres en SVG inline
    (`fill="currentColor"`, pas de dépendance à une police système ni à un
    jeu d'icônes externe) positionnées différemment selon la variante
    (gauche/centre/droite/justifié), même principe visuel que les icônes
    d'alignement standard de Word/Google Docs. Mêmes actions
    (`setTextAlign`) qu'avant, seule l'icône change.
  - **Vérification** : `npx tsc --noEmit` propre. Vérification visuelle par
    Playwright/CDP PAS possible cette fois — la session CDP de la fenêtre
    de développement restée ouverte depuis le début de cette session
    (voir plus haut, méthode de test) est bloquée par un bug connu de
    `playwright-core` (`connectOverCDP` échoue sur un target
    `shared_worker` orphelin créé par le HMR de Vite après un `reload()`
    antérieur — `Assertion error` dans `coreBundle.js`, avant même
    d'atteindre le code de l'app). Un redémarrage complet de l'app aurait
    résolu ça mais a été évité pour ne pas fermer la fenêtre sur le vrai
    document de travail de l'utilisateur sans certitude absolue d'absence
    de travail non sauvegardé. **À revérifier visuellement à la prochaine
    session** (ou après un redémarrage propre de `tauri dev` explicitement
    demandé par l'utilisateur) : disposition 2 lignes du groupe Police,
    lisibilité des 4 icônes d'alignement, chevrons décoratifs sur
    Couleur/Surlignage.
- **Bouton Surlignage ajouté aussi dans Accueil/Police (2026-09-13)**, sur
  demande explicite de l'utilisateur — `toggleHighlight` reste disponible
  dans le groupe Police de l'onglet Format avancé (avec son chevron
  décoratif, voir juste au-dessus), et existe maintenant EN PLUS dans le
  groupe Police de l'onglet Accueil (après le bouton "Code en ligne"),
  malgré le fait que le surlignage n'a pas d'équivalent Markdown standard
  (sérialisé en HTML comme le reste du groupe Police de Format avancé) —
  choix assumé de l'utilisateur pour un accès rapide, pas une erreur de
  classement à corriger. Même action, deux emplacements, aucune duplication
  de logique (un seul `toggleHighlight` dans `ToolbarActions`).
- **Correctif (2026-09-13), remonté par l'utilisateur : "quand je sélectionne
  du texte et que je clique sur une commande, les feuilles bougent".**
  Cliquer un bouton du ruban déplace forcément le focus DOM du bouton vers
  l'éditeur invisible (`editor.chain().focus()...run()`, appelé par
  quasiment toutes les actions de `MarkdownEditorHandle` — 42 occurrences).
  Sans option, Tiptap déclenche par défaut `editor.commands.scrollIntoView()`
  juste après avoir repris le focus (`options.scrollIntoView` vaut `true`
  par défaut dans `focus()`, voir `@tiptap/core`) — un vrai
  `tr.scrollIntoView()` de ProseMirror, qui calcule les coordonnées de la
  sélection dans l'éditeur invisible et scrolle le plus proche ANCÊTRE
  SCROLLABLE pour les rendre visibles. Problème : notre éditeur invisible
  (`.xmd-live-editor-host`, `position:absolute; left:-5000px`) est un
  FRÈRE DIRECT de la couche peinte à l'intérieur du même `.xmd-page-wrap`
  — ProseMirror scrolle donc bien ce conteneur, mais pour amener une
  position hors-écran (x=-5000px) dans le viewport, ce qui fait sauter
  visuellement les vraies pages affichées à l'écran (que l'utilisateur
  perçoit comme "les feuilles qui bougent"). Le focus natif du DOM lui-même
  n'est pas en cause (`EditorView.focus()` de ProseMirror utilise déjà en
  interne `focusPreventScroll`, vérifié dans le code source de
  `prosemirror-view`) — seul le `scrollIntoView()` explicite ajouté par
  Tiptap après coup posait problème. **Fix** : toutes les occurrences de
  `.chain().focus()` dans `MarkdownEditor.tsx` (remplacement global,
  `.chain().focus(undefined, { scrollIntoView: false })`) — le curseur/la
  sélection restent corrects (gérés par notre propre `caretPosition.ts`/
  `selectionHighlight.ts` sur la couche peinte, jamais par le scroll natif
  de l'éditeur invisible), seul le scroll parasite est supprimé. **Piège
  méthodologique** : la vérification par Playwright/CDP n'a pas pu être
  faite pour ce correctif précis — la session CDP de la fenêtre ouverte
  depuis le début de cette session de travail restait bloquée par le même
  target `shared_worker` orphelin que pour le correctif précédent (voir
  plus haut), et un redémarrage complet de `tauri dev` a été délibérément
  évité pour ne pas fermer la fenêtre sur le document réel de l'utilisateur
  sans certitude d'absence de travail non sauvegardé. **À revérifier
  visuellement à la prochaine occasion** (sélectionner du texte puis
  cliquer Gras/Italique/un titre… — la vue ne doit plus sauter).
- **Correctif majeur de pagination (2026-09-13), remonté par l'utilisateur :
  "à 100% la mise en page est très propre, mais à 125% et 150% ça se
  décale"** — capture d'écran à l'appui, montrant un nombre de pages total
  qui CHANGE selon le zoom (7 pages à 125%, 6 pages au même endroit à 150%)
  et des en-têtes qui se retrouvent collés au milieu du texte de la page
  précédente plutôt qu'en haut de la bonne page. C'est la limite "connue,
  pas encore comblée" listée depuis la réécriture complète de la pagination
  (voir plus haut) — jamais creusée jusqu'ici car "pas urgente" à l'époque.
  **Cause trouvée en relisant `paintPages.ts`** : la mesure de hauteur de
  chaque bloc (`nodeDom.getBoundingClientRect().height`) était divisée par
  `zoom` — un reliquat de l'ANCIENNE architecture (avant la réécriture
  complète), où les blocs mesurés vivaient directement dans l'élément
  portant `transform: scale()`, ce qui rendait cette division nécessaire à
  l'époque. Depuis la réécriture (éditeur invisible + couche peinte
  séparée), `nodeDom` vient de `view.nodeDOM()` — TOUJOURS dans
  `.xmd-live-editor-host`, l'éditeur invisible, qui ne porte JAMAIS ce
  `transform: scale()` (seule `.xmd-page-canvas`, la couche peinte à part,
  le porte) : sa mesure était donc déjà zoom-indépendante par construction,
  et la diviser par `zoom` INTRODUISAIT une erreur artificielle au lieu
  d'en corriger une — à 150% de zoom, chaque bloc semblait donc ~1,5× plus
  "court" qu'en réalité aux yeux du paginateur, qui casait alors plus de
  blocs par page qu'il n'aurait dû → moins de pages au total, et un
  contenu qui déborde visuellement de sa page (d'où les en-têtes collés en
  plein milieu du texte de la page précédente). **Invisible à 100% par
  construction** (diviser par 1 ne change rien) — d'où le "c'est propre à
  100%" de l'utilisateur, qui a permis de cerner tout de suite qu'il
  s'agissait d'un problème de calcul lié au zoom et pas d'un bug de
  positionnement générique. **Fix** : suppression pure et simple de la
  division (et du paramètre `zoom` devenu inutile dans
  `PaintPagesOptions`/l'appel dans `MarkdownEditor.tsx` — supprimé plutôt
  que laissé mort). Les autres usages de `zoom` dans le module de
  pagination (`caretPosition.ts`, `selectionHighlight.ts`) restent
  corrects et INCHANGÉS : eux MULTIPLIENT par `zoom` pour convertir une
  position mesurée dans l'éditeur invisible (jamais zoomé) vers les
  coordonnées écran RÉELLES du clone peint (qui LUI est bien zoomé) — un
  besoin légitime et différent de celui, erroné, qui existait dans
  `paintPages.ts` (une pure décision de pagination, qui ne doit jamais
  dépendre du zoom d'affichage). **Non revérifié visuellement par
  Playwright/CDP** — même blocage de session CDP que les deux correctifs
  précédents de cette session (target `shared_worker` orphelin). À
  confirmer à la prochaine occasion : le nombre de pages doit maintenant
  rester IDENTIQUE à n'importe quel niveau de zoom (25% à 400%) pour un
  même document.
- **Correctif de positionnement en-tête/pied de page (2026-09-13)**, remonté
  par l'utilisateur avec une capture d'écran : "la marge devrait être
  au-dessus et pas en-dessous" (de l'en-tête). Avant ce correctif,
  `.xmd-page-header`/`.xmd-page-footer` étaient collés au bord PHYSIQUE de
  la page (`top:0`/`bottom:0`), ce qui plaçait tout l'espace vide restant
  de la marge ENTRE l'en-tête et le début du texte du document (visible
  dans la capture : en-tête collé tout en haut, gros espace blanc, puis
  "Chapitre") — l'utilisateur voulait l'inverse : l'en-tête collé contre le
  début du contenu, l'espace vide de la marge repoussé vers le bord de la
  page. **Fix** (`MarkdownEditor.css`) : `top`/`bottom` calculés par rapport
  à la marge plutôt qu'au bord de page —
  `top: calc(var(--xmd-margin-top) - var(--xmd-header-height))` pour
  l'en-tête (son bord bas touche exactement le début de
  `.xmd-page-content`), symétrique pour le pied de page
  (`bottom: calc(var(--xmd-margin-bottom) - var(--xmd-footer-height))`, son
  bord haut touche la fin du contenu). Le champ d'édition flottant
  (`startHeaderFooterEdit`, positionné via `target.getBoundingClientRect()`
  sur l'élément réel) suit automatiquement ce nouveau positionnement sans
  changement de code JS. Même limite qu'avant, symétrique : un en-tête/pied
  de page plus haut que sa marge déborde maintenant côté BORD DE PAGE
  (`top`/`bottom` négatif) plutôt que côté contenu — cohérent avec le
  nouveau sens de collage.
- **Paragraphes vides préservés à la sauvegarde (2026-09-13)**, remonté par
  l'utilisateur : "quand je fais plusieurs Entrée pour espacer deux
  paragraphes, je ne les récupère pas à l'enregistrement — il doit manquer
  une ligne de commentaire pour que je les récupère" (l'utilisateur a
  deviné juste la solution avant même que je regarde le code). Cause :
  `defaultMarkdownSerializer.nodes.paragraph` (utilisé tel quel par
  `tiptap-markdown`) n'écrit RIEN pour un paragraphe vide — juste le
  séparateur de bloc Markdown standard (une ligne blanche), IDENTIQUE que
  le document ait 1 ou 5 paragraphes vides d'affilée : l'information "il y
  avait plusieurs paragraphes vides ici" n'a tout simplement aucune
  représentation en Markdown standard, elle disparaît au premier
  aller-retour. **Fix**, même principe que `PageBreak.ts`/`TocMarker.ts` :
  nouvelle extension `src/ui/Editor/extensions/ParagraphMarkdown.ts`
  (`Paragraph.extend(...)`, remplace le `paragraph` de StarterKit via
  `StarterKit.configure({ paragraph: false })`, même schéma que
  `codeBlock: false` déjà en place) — un paragraphe VIDE (`node.content.size
  === 0`) se sérialise en `<!-- empty-line -->` au lieu de rien ; au
  chargement, une règle de bloc markdown-it (même patron que celle de
  `PageBreak.ts`) reconnaît cette ligne et pousse les mêmes tokens qu'un
  paragraphe vide normal (`paragraph_open`/`inline` vide/`paragraph_close`)
  — pas besoin de règle de RENDU personnalisée comme pour `PageBreak`,
  puisque le rendu par défaut de markdown-it pour ces tokens (`<p></p>`) est
  déjà ce que le `parseHTML()` standard du nœud paragraphe de Tiptap sait
  reconnaître. Un paragraphe non vide n'est pas concerné (repli sur le
  comportement de base, `state.renderInline(node)`). **Dépendance ajoutée**
  : `@tiptap/extension-paragraph` déclarée explicitement dans
  `package.json` (elle n'existait jusqu'ici que comme dépendance
  TRANSITIVE de `@tiptap/starter-kit` — importée directement sans être
  déclarée, ça aurait été un import fragile/« fantôme », même piège que
  celui déjà évité pour `@tiptap/extension-table`/`TableMarkdown.ts`).
  `npm audit` toujours à 0 vulnérabilité après ajout.
- **Correctif générique du "saut de feuille" (2026-09-13)**, remonté par
  l'utilisateur : "saut de feuille quand je fais un Entrée, et décalage de
  curseur quand je fais un zoom" — suite directe du correctif du même jour
  sur les boutons du ruban (`.chain().focus(undefined, {scrollIntoView:
  false})`, voir plus haut). Cette fois le symptôme touchait la frappe
  clavier elle-même (Entrée), pas les boutons — cause : `splitBlock` (la
  commande interne de `@tiptap/core` liée à Entrée) appelle elle-même
  `tr.split(...).scrollIntoView()`, tout comme de nombreuses autres
  commandes internes (`joinBackward`, navigation, etc.) — **impossible à
  corriger commande par commande** comme pour les actions du ruban : il
  aurait fallu patcher chaque commande interne de `@tiptap/core` une par
  une, y compris celles jamais explicitement appelées par notre code. **Fix
  définitif, à la source** : `handleScrollToSelection: () => true` dans
  `editorProps` (`MarkdownEditor.tsx`) — point d'extension OFFICIEL de
  `prosemirror-view` (`EditorView.scrollToSelection()`, voir le code source
  de `prosemirror-view`), appelé par TOUTE tentative de défilement matériel
  vers la sélection, quelle qu'en soit l'origine (clavier, commande,
  ruban) ; retourner `true` indique à ProseMirror "c'est géré, ne fais rien
  toi-même" — bien plus robuste qu'ajouter `{ scrollIntoView: false }} à
  chaque site d'appel (gardés quand même, inoffensifs en double sécurité).
  Explique aussi probablement en bonne partie le "décalage de curseur lors
  du zoom" : un défilement natif intempestif de `.xmd-page-wrap` déclenché
  entre-temps par une frappe pouvait fausser les mesures relatives utilisées
  par `caretPosition.ts` au moment du repaint suivant (déclenché par le
  changement de zoom) — à revérifier si le symptôme persiste malgré ce
  correctif, auquel cas il faudra creuser spécifiquement le calcul
  zoom-dépendant de `caretPosition.ts`/`selectionHighlight.ts` (qui
  MULTIPLIENT par `zoom`, contrairement à l'erreur qui existait dans
  `paintPages.ts` — voir le correctif de pagination du même jour, plus
  haut — logique a priori correcte, mais pas revérifiée visuellement).
  **Non revérifié par Playwright/CDP** (même blocage de session que les
  correctifs précédents de cette session) — à confirmer : Entrée ne doit
  plus faire défiler la vue, et le curseur doit rester bien aligné après un
  changement de zoom.
- **Vrai correctif du décalage de curseur au zoom (2026-09-13)**, suite au
  retour "pour le curseur il n'est pas à la bonne position quand on zoom"
  — le correctif précédent (`handleScrollToSelection`) n'y changeait rien,
  cause DIFFÉRENTE et purement géométrique, trouvée en relisant
  `caretPosition.ts`/`selectionHighlight.ts`. **Le curseur dessiné
  (`.xmd-fake-caret`) et la couche de surbrillance de sélection
  (`.xmd-selection-layer`) sont des FRÈRES de `.xmd-page-canvas`** (pas des
  descendants — voir la structure DOM dans `MarkdownEditor.tsx`,
  `.xmd-canvas-frame` > [`.xmd-page-canvas`, `.xmd-selection-layer`,
  `.xmd-fake-caret`]) : leur position CSS `left`/`top` (absolue) est donc
  relative au coin haut-gauche de `.xmd-canvas-frame`, JAMAIS à celui de
  `.xmd-page-canvas`. Or les deux fichiers calculaient la position en
  utilisant `canvas.getBoundingClientRect()` (le rect de `.xmd-page-canvas`
  lui-même, LE SEUL élément qui porte `transform: scale(zoom)`) comme
  origine — correct par coïncidence à 100% de zoom (les deux rects sont
  alors identiques), mais faux dès qu'on zoome : `transform-origin: top
  center` sur `.xmd-page-canvas` garde son centre-haut fixe et étend la
  boîte symétriquement en largeur, donc son bord GAUCHE rendu s'écarte de
  celui du frame de `(largeurZoomée − largeurRéelle) / 2` (jamais en
  hauteur : l'origine verticale est à 0%, le haut ne bouge pas) — un
  décalage purement horizontal, proportionnel à l'écart avec 100%, qui
  grandit avec le zoom. **Fix** : dans les deux fichiers, l'origine des
  calculs devient `(canvas.parentElement).getBoundingClientRect()`
  (`.xmd-canvas-frame`, le VRAI ancêtre positionné du curseur/de la
  sélection dessinés) au lieu de `canvas.getBoundingClientRect()`. Repose
  sur la structure DOM déjà documentée comme contrat explicite
  ("le curseur dessiné doit être un frère de `.xmd-page-canvas` SANS aucun
  autre ancêtre positionné entre les deux", commentaire déjà présent dans
  `MarkdownEditor.tsx` avant ce correctif) — pas une nouvelle supposition
  fragile. **Non revérifié visuellement** (session Playwright/CDP toujours
  bloquée) — à confirmer : le curseur/la sélection doivent maintenant
  rester exactement au même endroit visuel (dans le mot/la lettre cliqué·e)
  à n'importe quel niveau de zoom, pas seulement à 100%.
- **Investigation du bug "texte tapé au mauvais endroit" (2026-09-13)**,
  suite au retour "c'est reproductible" de l'utilisateur. L'app a dû être
  RELANCÉE proprement (`taskkill` puis `tauri dev` avec le port de debug)
  pour obtenir une session Playwright/CDP fonctionnelle — celle restée
  ouverte depuis le début de la session de travail était bloquée en
  permanence par le bug `shared_worker` documenté plus haut (confirmation
  explicite de l'utilisateur avant redémarrage : rien à perdre, tout était
  enregistré). Repéré au passage en inspectant le fichier réel de
  l'utilisateur (`Nouveau document.md`) : la corruption existe bel et bien,
  déjà enregistrée sur disque, avec un motif clair — des espaces insérés en
  PLEIN MILIEU de mots ("d'ouvrage" devenu "d'o uvra ge", "l'agence" devenu
  "l'a      gence"), y compris DANS UN TITRE ("Contexte" devenu "Con
  texte") — donc pas limité à un seul type de bloc (citation ET titre
  touchés).
  - **Tests de reproduction ciblés (fichier jetable dédié, supprimé après
    coup)** : clic en fin de ligne d'une citation multi-lignes repliée
    (`>`), clic en milieu de mot en 1ère ET 2e ligne d'une citation — TOUS
    corrects, texte tapé exactement à l'endroit cliqué, y compris avec le
    scénario EXACT décrit par l'utilisateur (citation en fin de ligne
    longue). **`resolveClickPosition.ts` ne semble donc PAS en cause** —
    contrairement à `caretPosition.ts`/`selectionHighlight.ts` (le bug de
    zoom corrigé juste avant), aucune anomalie de calcul trouvée ni
    reproduite ici.
  - **Piste retenue, appliquée en prévention** : la zone éditable RÉELLE
    (`.xmd-live-editor-host`) est INVISIBLE (`opacity:0`) — l'utilisateur ne
    peut jamais voir un soulignement de correction orthographique ni un
    menu de suggestion avant qu'il n'agisse. Le motif de corruption observé
    (des espaces insérés au milieu d'un mot, comme "d'ouvrage" → "d'o uvra
    ge") ressemble beaucoup à une correction automatique du système/de la
    WebView appliquée silencieusement sur ce champ invisible. **Fix
    préventif** (`MarkdownEditor.tsx`, `editorProps.attributes`) :
    `spellcheck="false"`, `autocorrect="off"`, `autocapitalize="off"` sur la
    zone éditable — sans risque pour un éditeur qui dessine lui-même
    intégralement son rendu (aucune UI navigateur de correction n'a de
    raison d'exister ici). **Non confirmé comme LA cause exacte** (pas de
    reproduction formelle en environnement de test), mais élimine une
    classe entière de corruption silencieuse plausible, à coût nul.
  - **Le fichier réel de l'utilisateur N'A PAS été modifié** (uniquement
    consulté en lecture pour l'enquête) — la corruption déjà présente
    (`d'o uvra ge`, `l'a      gence`, `Con texte`, `supervisiofffffffffn`,
    et un fond noir/texte blanc inattendu sur un paragraphe) reste à
    nettoyer manuellement par l'utilisateur (ou par moi sur demande
    explicite) — PAS corrigée automatiquement, ne pas toucher au contenu
    réel de l'utilisateur sans son accord.
  - **Suite (2026-09-13, même jour)** : nouvelle précision de l'utilisateur
    — le motif déclencheur serait "2 ou 3 espaces avant de taper le texte",
    en rafale. Piste retenue : sur un document de plusieurs pages, CHAQUE
    frappe déclenche un `repaint()` COMPLET et SYNCHRONE (reconstruction de
    tous les clones de toutes les pages + renumérotation des titres) — sur
    un gros document, assez lent pour qu'une frappe très rapide (plusieurs
    touches en rafale) tombe pendant qu'un repaint précédent est encore en
    cours. Test poussé pour vérifier cette hypothèse (fichier jetable de 3
    pages généré avec un long paragraphe répété 60 fois, supprimé après
    coup) : clic puis frappe de plusieurs espaces + texte À VITESSE
    MAXIMALE (`delay: 0`, aucune pause), y compris juste après un
    changement de défilement — **toujours correct**, aucune corruption
    obtenue sur 8 tentatives à des positions différentes du document (un
    sous-ensemble des tentatives n'a même pas pu cliquer, la recherche du
    mot cible dans mon script de test ayant échoué — limite de l'outil de
    test, pas un plantage de l'app, confirmé par une capture d'écran finale
    montrant l'app toujours saine et fonctionnelle). **Bug non reproduit
    malgré des tests volontairement agressifs** (gros document, frappe la
    plus rapide possible, positions variées). Le correctif préventif
    (spellcheck/autocorrect désactivés, voir ci-dessus) reste en place ;
    faute de reproduction fiable, impossible d'aller plus loin pour
    l'instant sans un nouveau cas précis et récent de l'utilisateur (idéalement
    avec le fichier concerné juste après l'apparition du bug, avant toute
    autre modification).
- **Préparation du premier installeur Windows (2026-09-13)**, sur demande
  explicite de l'utilisateur ("tu peux me faire un installeur, la version
  on peut la pousser à 0.4.5"). Version choisie en accord avec lui après
  discussion (l'app est "déjà bien avancée", pas de saut d'étape injustifié
  malgré le bond depuis 0.1.0) :
  - **Version alignée à `0.4.5`** dans les 3 endroits qui doivent rester
    synchronisés : `package.json`, `src-tauri/tauri.conf.json`,
    `src-tauri/Cargo.toml` (`APP_VERSION` dans `appInfo.ts` reste un import
    direct de `package.json`, donc suit automatiquement).
  - **Rebranding de la configuration Tauri elle-même**, restée sur son nom
    de code interne malgré le rebranding "Pagina" déjà fait côté interface
    (logo, barre de titre, favicon) : `productName` passe de `xmd-editor` à
    `Pagina` (nom de fichier de l'installeur généré, entrée dans le menu
    Démarrer), titre de fenêtre système de `"MBEF Fluides — Éditeur
    Markdown"` à `"Pagina — Mon BE Fluides"` (visible dans la barre des
    tâches/Alt-Tab — la fenêtre étant sans décorations, ce titre système
    n'était de toute façon déjà plus visible directement, voir TitleBar.tsx),
    `Cargo.toml` (`description`/`authors`) alignés pareil. `identifier`
    (`fr.mbef.xmd-editor`) volontairement PAS changé : c'est l'identifiant
    STABLE de l'app pour Windows (associations de fichiers, mises à jour
    futures) — le changer casserait la continuité d'une éventuelle
    installation existante, sans bénéfice réel (invisible à l'utilisateur).
  - **Icônes régénérées depuis le vrai logo Pagina** (`src-tauri/icons/`
    contenait encore les icônes GÉNÉRIQUES du template Tauri par défaut,
    datées d'avant même l'existence des SVG de logo dans `public/`) : `npx
    tauri icon` accepte un SVG directement, mais exige une source CARRÉE —
    `pagina-logo-icon.svg` a un viewBox `680×400` (icône + espace pour un
    futur lockup), donc pas directement utilisable. Un SVG carré
    intermédiaire (400×400, glyphe recentré avec les mêmes chemins/couleurs)
    a été généré, passé à `tauri icon`, puis supprimé (fichier de travail
    jetable, pas conservé dans le dépôt). Tous les PNG/ICO/ICNS Windows
    régénérés ; les dossiers `android/`/`ios/` que la commande génère aussi
    par défaut supprimés (app desktop uniquement, ces plateformes ne sont
    pas dans le périmètre du projet — voir feuille de route produit).
  - **Correction d'URL** : `PUBLISHER_WEBSITE` dans `appInfo.ts` corrigé de
    `https://www.monbefluide.fr` (singulier, faute d'origine) vers
    `https://www.monbefluides.fr` (pluriel, confirmé explicitement par
    l'utilisateur) — cette URL n'apparaît que dans le commentaire
    `pagina:generator` des fichiers `.md` générés, jamais appelée par le
    code (pas de risque de rupture fonctionnelle, uniquement informatif).
  - **Build lancé** : `npx tauri build` (compilation Rust en mode release +
    génération de l'installeur NSIS/MSI Windows via `bundle.targets: "all"`
    déjà configuré) — voir la sortie dans `src-tauri/target/release/bundle/`
    une fois terminé. **Pas de certificat de signature de code configuré**
    (aucune section `bundle.windows.certificateThumbprint`/signature dans
    `tauri.conf.json`) : Windows SmartScreen affichera un avertissement
    "éditeur non reconnu" au premier lancement chez un nouvel utilisateur —
    acceptable pour un usage interne MBEF, à revoir si distribution plus
    large envisagée un jour (nécessiterait l'achat d'un certificat de
    signature de code).
- Explorateur de fichiers : ouverture d'un dossier, arborescence `.md`/`.xmd`,
  watcher filesystem, mémorisation du dernier dossier ouvert.
- Onglets multi-fichiers : ouverture/fermeture, indicateur non-sauvegardé (•),
  confirmation à la fermeture si modifié, persistance de session (localStorage).
- Éditeur WYSIWYG Tiptap : gras/italique/souligné, titres H1-H6 (sélecteur avec
  aperçu de taille façon Word), listes, citations, code, liens, tableaux,
  séparateurs, sérialisation Markdown propre à la sauvegarde.
- Bouton "Nouveau" dans le ruban (avant "Enregistrer", comme Word) — crée un
  `.md` à la racine du workspace et l'ouvre.
- Saut de page manuel via `<!-- pagebreak -->` (nœud Tiptap custom
  `PageBreak.ts`), raccourci Ctrl+Entrée, rendu visuel en pointillés à l'écran.
- Charte graphique MBEF appliquée sur le ruban et les composants (couleurs,
  Arial).
- **Pagination visuelle en direct dans l'éditeur** (2026-09-11) — **REMPLACÉE
  le 2026-09-12 par le moteur CasualOffice/docs, voir plus bas.** Description
  historique conservée pour mémoire (l'extension `PaginationDecorations.ts`
  existe toujours dans le code mais n'est plus utilisée par la vue Pages) :
  pendant la
  frappe, le document s'affiche comme plusieurs feuilles A4 empilées avec un
  vrai espace (marge blanche + fine jointure grise + marge blanche, avec
  ombres) inséré dans le flux dès que le contenu dépasse une hauteur de page.
  Implémenté via `src/ui/Editor/extensions/PaginationDecorations.ts` (widgets
  ProseMirror, jamais sérialisés en Markdown) + la logique de calcul dans
  `MarkdownEditor.tsx` (recherche par dichotomie des points de coupure,
  toujours arrondis au début d'un bloc pour ne jamais couper une phrase).
  Approximatif par nature (dérive un peu du rendu print/export réel), mais
  donne une vraie impression de pages multiples en édition, comme demandé.
  Chaque "trou" entre deux feuilles est une simple bande grise fixe de 20px
  pleine largeur (pas de marges blanches autour — demande explicite de
  l'utilisateur, qui trouvait que de grandes zones blanches autour d'une fine
  jointure donnaient l'impression de "trous" plutôt qu'un séparateur net) +
  une étiquette "Page N". Voir `GAP_HEIGHT_PX` dans `PaginationDecorations.ts`.
  **Pièges rencontrés à ne pas reproduire** :
  - Ne jamais appeler `view.dispatch` de Tiptap pour ces mises à jour de
    décorations — son `dispatchTransaction` peut avaler silencieusement une
    transaction sans jamais appeler `view.updateState` (mécanisme de capture
    de transaction interne aux commandes), sans la moindre erreur. Il faut
    appliquer la transaction directement sur la vue
    (`view.updateState(view.state.apply(tr))`).
  - Si on vide les décorations pour mesurer le flux brut puis qu'on ne les
    réinsère que "si le résultat a changé depuis la dernière fois", la
    réinsertion finit par être sautée en permanence dès que le calcul se
    stabilise — il faut mettre les décorations calculées en cache et toujours
    réappliquer quelque chose (le cache ou un nouveau calcul), jamais laisser
    l'état "vidé" être la dernière chose appliquée.
  - **`.xmd-page-wrap` doit avoir `align-items: flex-start`.** Sans ça (comme
    ça a été le cas un moment), un enfant flex sans hauteur explicite est
    étiré (`align-items: stretch`, comportement par défaut) et se retrouve
    figé à sa `min-height` au lieu de grandir avec son contenu réel — tout ce
    qui dépasse déborde silencieusement hors de la boîte blanche, sans
    erreur, en donnant l'impression que "les pages suivantes n'ont pas de
    fond blanc". Repéré en faisant écrire à l'app un dump de
    `outerHTML`/`offsetHeight`/`scrollHeight` dans un fichier lu directement
    (`page.offsetHeight` collé exactement à `min-height` alors que
    `scrollHeight` était bien plus grand) — bien plus rapide que deviner sur
    des captures d'écran. Réflexe à avoir plus tôt la prochaine fois qu'un bug
    de layout résiste à plusieurs hypothèses CSS.
- **Correctif critique d'édition (2026-09-12)** : chaque frappe faisait
  sauter le curseur en fin de document (et un double Entrée ne créait pas de
  second paragraphe). Cause : `onUpdate` remonte le Markdown vers le store
  (`onChange`), qui redescend en prop `initialContent` ; un autre effet
  (censé recharger le contenu uniquement au changement d'onglet) comparait
  cette prop à `loadedContentRef.current`, jamais mise à jour dans
  `onUpdate` — donc `editor.commands.setContent()` était rappelé sur CHAQUE
  caractère tapé, réinitialisant tout le document. Corrigé en mettant à jour
  `loadedContentRef.current = markdown` directement dans `onUpdate`. Diagnostiqué
  en quelques minutes grâce à l'automatisation Playwright/CDP (voir plus haut)
  plutôt qu'en devinant sur des captures d'écran.
- **Épisode CasualOffice/docs (2026-09-12, ABANDONNÉ le même jour, gardé pour
  mémoire).** Suite à la demande d'un vrai WYSIWYG écran = impression, on a
  intégré un temps le moteur complet de
  [CasualOffice/docs](https://github.com/CasualOffice/docs) (MIT) — composant
  `<DocxEditor>` React entier, avec conversion Markdown ⇄ `.docx` en mémoire
  via un convertisseur WASM (`docxBridge.ts`), forké et élagué dans
  **`../pagina-docx-engine`**. Ça fonctionnait (voir historique de session
  pour le détail des 4 bugs rencontrés et corrigés : listes non numérotées
  côté convertisseur WASM, `ref`/`onReady` peu fiable, `ArrayBuffer` détaché,
  Ctrl+S ne sauvegardant que dans l'autosave du fork). **Mais** : ça faisait
  perdre l'identité de l'app (leur ruban/menus complets, juste reskinnés en
  vert) ET le principe "la feuille reflète directement le `.md`" (un
  aller-retour par un format `.docx` intermédiaire est une source de dérive
  qui n'existe pas si on édite directement le modèle Markdown). Revert
  complet le 2026-09-12 : la vue Pages utilise à nouveau `MarkdownEditor.tsx`
  (Tiptap) comme avant. Seule chose gardée de cet épisode : la **technique**
  de pagination de leur `layout-engine/paginator.ts` (voir juste en dessous),
  réécrite pour notre propre document ProseMirror. Le code du fork et les
  fichiers `DocxPagedEditor.tsx`/`docxBridge.ts`/`docxListFix.ts` restent
  dans le dépôt (non branchés, non supprimés) : la coédition Yjs qu'ils
  embarquent pourrait redevenir utile plus tard.
- **Vraie pagination par mesure de blocs (2026-09-12), remplace l'ancienne
  recherche par dichotomie sur les coordonnées écran.** Technique reprise de
  l'algorithme de `paginator.ts` de CasualOffice/docs (voir épisode
  ci-dessus) — mais leur fichier est en réalité totalement générique : il ne
  connaît que des hauteurs de blocs abstraits, aucun lien avec leur format
  `.docx`. On l'a donc réécrit en beaucoup plus simple pour nos besoins
  (une seule colonne/section, pas d'en-tête/pied de page) :
  `src/ui/Editor/pagination/paginator.ts`. Principe : au lieu de chercher
  après coup, par dichotomie sur `coordsAtPos`, où couper dans un flux déjà
  rendu (fragile, comme documenté plus haut sous "pagination visuelle
  approximative"), on mesure directement la hauteur RÉELLE déjà rendue de
  chaque bloc de premier niveau du document (`view.nodeDOM(offset).offsetHeight`
  — le navigateur a déjà fait tout le travail de mise en ligne du texte) et on
  les fait défiler un par un dans une petite machine à états
  (`createPaginator`) qui décide "ça tient encore sur cette page ou pas",
  avec le cumul d'espacement façon Word (spaceAfter d'un bloc + spaceBefore
  du suivant, jamais juste le max des deux) et le support des sauts de page
  manuels (`<!-- pagebreak -->`). Plus simple, plus robuste (pas de recherche
  itérative, pas de garde anti-boucle nécessaire), et plus facile à faire
  évoluer (en-têtes/pieds de page, marges par section...) que l'ancienne
  version. `.offsetHeight` plutôt que `getBoundingClientRect()` : le premier
  n'est jamais affecté par `transform: scale()` (utilisé pour le zoom, voir
  ci-dessous), donc le calcul de pagination reste correct à n'importe quel
  niveau de zoom.
- **Zoom (2026-09-12)**, inspiré des paliers de CasualOffice/docs
  (`25/50/75/100/125/150/200/300/400%`, voir `src/ui/Editor/pagination/zoom.ts`)
  mais implémenté nous-mêmes en quelques lignes plutôt que d'importer leur
  hook (417 lignes, dépend de leur design system) : Ctrl+molette sur la zone
  d'édition + boutons `-`/`+` dans la barre de statut, appliqué par un simple
  `transform: scale(var(--xmd-zoom))` sur `.xmd-page`.
- **Tests effectués (2026-09-12)**, tous via Playwright/CDP contre l'app
  réelle (voir méthode en haut de ce fichier) : document de 170 lignes
  forçant plusieurs pages (vérifié : 4 pages, jointures propres, pas de
  coupure en plein milieu d'une phrase), stabilité du curseur pendant la
  frappe (position de `window.getSelection()` vérifiée avant/après plusieurs
  caractères), double-Entrée (crée bien un second paragraphe), zoom (+/-,
  page reste correctement rendue à 125% et 50%), saut de page manuel
  (Ctrl+Entrée crée bien une jointure de page supplémentaire).
- **Correctif "les pages n'ont pas toutes la même hauteur" (2026-09-12),
  remonté par l'utilisateur juste après le point ci-dessus.** Deux bugs dans
  `paginator.ts` :
  1. Le curseur d'une nouvelle page démarrait à `margins.top` au lieu de `0`
     (et la limite basse à `pageHeight - margins.bottom` au lieu de
     `contentHeight`) — comptait une marge de trop par page, puisque dans
     notre rendu les marges de chaque page sont déjà entièrement portées par
     le "trou" qui la précède (`createGapDecoration`), pas par un padding sur
     la page elle-même. **Fix** : coordonnées purement relatives à la zone de
     contenu (0 → `contentHeight`), les marges n'interviennent que dans la
     formule du trou (`marginsPx + leftover`), jamais dans le suivi du
     curseur.
  2. Un saut de page **manuel** ne comblait pas la page qui se termine
     (`previousPageLeftover` restait à 0 dans cette branche) — elle
     apparaissait donc plus courte que les pages coupées naturellement.
     **Fix** : même formule de comblement pour les deux cas (comme dans Word,
     où une page qui se termine par un saut manuel reste quand même affichée
     pleine hauteur, juste avec de l'espace vide en bas).
  Revérifié en mesurant le contenu + trou de chaque page dans le débogueur
  (page 1 ≈ page 2 à 11px près sur ~1120px, negligeable) et visuellement
  (espace vide bien visible en bas des pages qui se terminent tôt, avant la
  jointure grise suivante).
- **Suite du correctif ci-dessus (2026-09-12) — l'utilisateur ne voyait
  toujours pas des pages de hauteur identique.** Deux causes supplémentaires
  trouvées en mesurant précisément (distance entre jointures grises
  consécutives, qui doit être exactement la hauteur de page) :
  1. La marge du haut de la toute première page venait du `padding-top` CSS
     de `.xmd-page` — correcte en soi, mais l'existence même de cette
     approche laissait courir le risque de la recompter (elle avait été
     comptée une deuxième fois pendant le débogage du point précédent,
     d'où la confusion). **Fix**, plus sûr conceptuellement : un vrai widget
     dédié `createTopMarginSpacer` (voir `PaginationDecorations.ts`) fournit
     cette marge, exactement comme le "trou" en fournit une à chaque
     page suivante — une seule et même logique pour toutes les pages, plus
     de padding CSS spécial à la première.
  2. La vraie cause de l'écart visible : `.offsetHeight` (utilisé pour
     mesurer chaque bloc) **arrondit à l'entier**. Sur une page qui empile
     20+ blocs, l'arrondi de chacun s'accumule et peut désynchroniser la
     hauteur totale d'une page de plusieurs dizaines de pixels (mesuré :
     jusqu'à 46px d'écart entre jointures consécutives, largement visible à
     l'œil). **Fix** : `getBoundingClientRect().height` (précision
     sub-pixel) à la place — mais celle-ci EST affectée par
     `transform: scale()` (le zoom), donc on la divise par le zoom courant
     pour rester dans le même espace de pixels "logique" quel que soit le
     niveau de zoom affiché (`zoom` ajouté aux dépendances de l'effet de
     pagination pour recalculer proprement si le niveau de zoom change).
  Revérifié : distance entre jointures grises consécutives sur un document
  de 5 pages — écart ramené de 46px à 10px (page attendue ≈1122px), sur trois
  transitions. Reste un résidu de quelques px (accumulation de sous-pixels
  sur ~20 blocs par page) mais indétectable à l'œil.
- **RÉÉCRITURE COMPLÈTE de la pagination (2026-09-12) — remplace tout ce qui
  précède dans cette section.** Même après le correctif ci-dessus, la
  hauteur de page restait "élastique" par construction : un seul flux
  continu avec un espace calculé pour compenser, donc redimensionné à chaque
  frappe. L'utilisateur a explicitement demandé la vraie architecture (des
  feuilles à taille FIXE, comme des cartes espacées, jamais recalculées) et
  a autorisé à s'inspirer de la technique de CasualOffice/docs sans copier
  leur code. Vérification utile avant de se lancer : leur `DocExtension.ts`
  ne restructure PAS le schéma du document en nœuds "page" — confirme que la
  seule voie robuste est un éditeur invisible + une couche peinte séparée
  (leur techniques réelle, dans `PagedEditor.tsx`/`layout-painter/`).
  - **Architecture retenue** (voir `src/ui/Editor/pagination/`) :
    1. Tiptap édite un document dans une zone **invisible**
       (`.xmd-live-editor-host` — `opacity:0`, hors flux via
       `height:0;overflow:hidden`, mais reste focusable et mesurable). C'est
       la SEULE source de vérité éditable : curseur, sélection, undo/redo,
       IME restent 100% natifs ProseMirror, aucun hack.
    2. À chaque modification, `paintPages.ts` répartit les blocs de premier
       niveau en pages (même algorithme `paginator.ts` qu'avant, réutilisé
       tel quel) et reconstruit la couche visible : une boîte `.xmd-page`
       par page, **hauteur CSS fixe** (jamais `min-height`), contenant des
       **clones** (`cloneNode(true)`) en lecture seule des blocs — jamais les
       vrais nœuds ProseMirror (les déplacer casserait le suivi interne
       DOM ↔ document de ProseMirror).
    3. `resolveClickPosition.ts` traduit un clic sur un clone en position
       réelle dans l'éditeur invisible : un clone étant visuellement
       identique à son original (même largeur ⇒ même mise en ligne), la
       position RELATIVE du clic à l'intérieur du clone s'applique telle
       quelle à l'original, puis `view.posAtCoords` fait le reste. Glisser
       (mousedown + mousemove) étend la sélection de la même façon.
    4. `caretPosition.ts` fait le chemin inverse : calcule où dessiner un
       curseur À LA MAIN (`.xmd-fake-caret`, un `<div>` positionné en
       absolu, CSS `@keyframes` pour le clignotement) à partir de la vraie
       position de sélection (invisible) — sans lui, taper ou naviguer au
       clavier ne montrerait aucun retour visuel.
  - **Pourquoi les clones et pas un déplacement réel des nœuds** : ProseMirror
    gère lui-même le DOM de sa zone éditable ; sortir des nœuds de cette
    zone pour les poser ailleurs casserait son suivi interne. Les clones ne
    sont jamais édités directement — `user-select:none` en CSS empêche même
    la sélection navigateur native dessus, pour ne pas la confondre avec le
    vrai curseur dessiné à la main.
  - **Classe CSS partagée** : les clones portent `xmd-prosemirror` en plus de
    `xmd-page-content`, exactement comme la vraie zone éditable — sans ça,
    toutes les règles de mise en forme (`.xmd-prosemirror p`, tableaux,
    listes de tâches...) ne s'appliqueraient plus puisque les clones ne sont
    plus descendants du `.xmd-prosemirror` d'origine.
  - **Bug corrigé le jour même : le curseur dessiné apparaissait décalé par
    rapport à l'endroit cliqué** (l'utilisateur a remarqué que taper au
    clavier atterrissait au bon endroit — donc `resolveClickPosition`
    fonctionnait — mais l'AFFICHAGE du curseur, lui, était ailleurs). Cause :
    `.xmd-fake-caret` et `.xmd-page-canvas` étaient frères directs de
    `.xmd-page-wrap`, qui est `position: relative` avec du padding — le
    curseur (`position: absolute`) se positionnait donc réellement par
    rapport à `.xmd-page-wrap`, alors que `caretPosition.ts` calculait ses
    coordonnées par rapport à `.xmd-page-canvas` (un élément différent, avec
    une origine différente à cause du padding du wrap). **Fix** : un nouveau
    conteneur `.xmd-canvas-frame` (position: relative, sans aucun padding)
    englobe désormais UNIQUEMENT `.xmd-page-canvas` et `.xmd-fake-caret`,
    pour qu'ils partagent exactement la même origine. Revérifié
    numériquement (position du curseur calculée = position réelle du clic,
    au dixième de pixel près) et visuellement (capture d'écran, curseur
    visible exactement dans le mot cliqué).
  - **Bug corrigé le jour même, plus grave : du texte pouvait être scindé au
    mauvais endroit après un clic en fin de ligne longue** (ex. clic après
    "...prête à confusion", Entrée → coupure en fait entre "prê" et "te",
    des dizaines de caractères plus tôt). Repéré par l'utilisateur sur un
    vrai document, très difficile à reproduire au début (plusieurs clics
    "précis" fonctionnaient correctement). Cause trouvée en comparant les
    largeurs mesurées des deux côtés : `originalRect.width` (zone invisible,
    643 largeur `mmToPx()` calculée en JS) et `cloneRect.width` (couche
    peinte, largeur issue du calcul CSS natif du navigateur pour le padding
    en mm) différaient de **0.0125px** — un écart totalement invisible à
    l'œil, mais qui suffit à faire retomber un mot de fin de ligne d'un côté
    et pas de l'autre : dès qu'un mot est à la limite, TOUT le retour à la
    ligne du reste du paragraphe diverge entre l'original et le clone, et
    `resolveClickPosition.ts` traduit alors le clic vers une position
    complètement différente (même ligne visuelle, mot différent). **Fix** :
    au lieu de calculer indépendamment la largeur de la zone invisible
    (`mmToPx`), on la corrige pour qu'elle corresponde EXACTEMENT (au
    centième de pixel) à la largeur réellement rendue de `.xmd-page-content`,
    mesurée après le premier rendu — tout écart, même infime, est éliminé
    plutôt que toléré. Revérifié : le cas exact du bug (clic après "confusion")
    ne coupe plus le texte, et une frappe normale insère toujours au bon
    endroit ("AFNOR" → "AFNORXYZ" exactement à la bonne position).
  - **Bug corrigé le jour même, le plus important des trois : `view.posAtCoords`
    (l'API native de ProseMirror "quelle position document est sous ce pixel")
    ÉCHOUE SILENCIEUSEMENT dès que l'éditeur invisible est hors du viewport
    visible — quelle que soit la distance testée (-100000px, -5000px, même en
    SUPERPOSITION exacte avec la couche visible où elle accroche alors le
    mauvais élément).** Ça ne se voyait quasiment pas sur un simple
    paragraphe (probablement un début de résultat qui "avait l'air correct"
    par coïncidence sur du texte court), mais éclatait complètement sur tout
    contenu structuré : clic dans une cellule de tableau → atterrissait
    systématiquement dans la cellule tout en haut à gauche, quelle que soit
    la cellule visée. Cause probable : `posAtCoords` s'appuie en interne sur
    du hit-testing navigateur (type `elementFromPoint`), qui ne fonctionne
    QUE pour des coordonnées dans la fenêtre visible — un élément positionné
    hors écran via CSS existe bien "en mise en page" mais n'est jamais
    trouvable par point. **Fix** : abandon de `posAtCoords`, remplacé par une
    recherche géométrique maison dans `resolveClickPosition.ts`
    (`findPosNearCoords`) — balaie toutes les positions du bloc et garde
    celle dont `coordsAtPos` (position → coordonnées, le sens INVERSE, qui
    lui fonctionne très bien hors écran — déjà utilisé pour le curseur
    dessiné) tombe le plus près de la cible, avec une forte pondération sur
    l'écart vertical pour bien choisir la ligne avant la colonne. Un
    deuxième bug a été trouvé au passage sur le chemin vers celui-ci :
    `.xmd-live-editor-host` avec `height:0;overflow:hidden` faisait
    déborder un `<table>` dedans à la pleine largeur de PAGE au lieu de la
    largeur de contenu contrainte (un tableau en layout auto ne respecte
    apparemment pas une largeur de conteneur à hauteur nulle) — remplacé par
    un simple décalage hors écran (`position:absolute; left:-5000px`), sans
    `height:0`. Testé et confirmé fonctionnel sur : paragraphe, tableau
    (clic précis dans une cellule au milieu de la grille), bloc de code,
    citation, lien, case à cocher de liste de tâches.
  - **Corrigé (2026-09-12), même jour** : le clic imprécis en frontière de
    ligne dans un bloc de code (`<pre><code>`, texte continu avec retours à
    la ligne internes, pas des éléments DOM séparés par ligne comme un
    tableau) — une position document à une frontière de ligne est ambiguë
    (elle désigne à la fois "fin de la ligne précédente" et "début de la
    ligne suivante"), et `coordsAtPos(pos)` sans précision de côté ne
    renvoyait qu'une seule des deux interprétations, parfois la mauvaise.
    Fix dans `findPosNearCoords` (`resolveClickPosition.ts`) : on teste
    désormais `coordsAtPos(pos, -1)` ET `coordsAtPos(pos, 1)` pour chaque
    position candidate et on garde le meilleur des deux. Vérifié par
    Playwright/CDP : clic en fin de ligne ("return 42;|") et clic en tout
    début de ligne (juste après le `\n`) atterrissent désormais tous les
    deux exactement là où visé.
  - **Limites connues, pas encore comblées** :
    - ~~Signalé par l'utilisateur, pas encore regardé : un souci de
      pagination lors du zoom~~ **Corrigé (2026-09-13)** — voir plus haut,
      section "Correctif majeur de pagination".
    - ~~Pas de surbrillance visuelle pour une sélection étendue~~ **Fait
      (2026-09-12)** : `src/ui/Editor/pagination/selectionHighlight.ts`
      (`computeSelectionRects`) calcule, pour une sélection étendue, un
      rectangle par LIGNE VISUELLE via `Range.getClientRects()` du
      navigateur (contrairement à `coordsAtPos`, qui ne donne qu'un point —
      la sélection peut couvrir plusieurs lignes voire plusieurs blocs).
      Même principe que le curseur dessiné (caretPosition.ts) : mesurer
      dans l'éditeur invisible ORIGINAL, reporter le décalage relatif sur le
      clone peint correspondant. Une sélection qui traverse plusieurs blocs
      de premier niveau (donc potentiellement plusieurs pages) est d'abord
      découpée bloc par bloc (les mêmes blocs que `paintPages.ts` clone un
      par un) avant de calculer les rects de chacun. Rendu dans
      `.xmd-selection-layer` (un `<div class="xmd-selection-rect">` par
      rect), le curseur clignotant est masqué tant que la sélection n'est
      pas collapsed. Vérifié par Playwright/CDP : sélection dans un
      paragraphe avec gras/italique/lien (plusieurs rects contigus dus aux
      marques, se fondent visuellement), et sélection traversant un
      paragraphe puis un tableau entier (cellules partiellement/entièrement
      couvertes correctement surlignées).
    - **Un crash de l'appli a été observé une fois pendant les tests**
      (fenêtre fermée sans trace d'erreur JS ni panique Rust dans les logs),
      non reproduit malgré plusieurs tentatives ciblées (bascules de vue
      répétées, glisser-sélectionner + mise en forme). À surveiller ; si ça
      se reproduit, capturer les logs `tauri dev` au moment exact du crash.
  - **Tests effectués (2026-09-12)**, tous via Playwright/CDP contre l'app
    réelle : hauteur de page vérifiée strictement identique entre deux pages
    (`getBoundingClientRect().height` égal au bit près, plus une histoire de
    "quelques px d'écart"), clic en plein milieu d'un mot (texte inséré
    exactement au bon endroit, vérifié caractère par caractère), glisser-
    sélectionner puis Ctrl+B (gras appliqué exactement sur la plage
    sélectionnée), bascule Pages/Markdown/Code répétée (5 allers-retours),
    saut de page manuel (page précédente correctement figée à hauteur
    pleine avec l'espace vide visible), sauvegarde réelle par Ctrl+S ET par
    le bouton "Enregistrer" (le raccourci clavier ne fonctionne que si le
    focus est resté dans l'éditeur — sinon utiliser le bouton), suivi de la
    page courante au défilement.

- **Ruban façon Word (2026-09-13).** Sur demande explicite de l'utilisateur
  (capture d'écran de Word comme référence), le ruban plat à 2 lignes fixes
  est remplacé par une vraie structure à onglets :
  1. **Barre d'accès rapide** (`.tb-quickbar`, toujours visible quel que soit
     l'onglet actif) : bouton ☰ repliant/dépliant l'explorateur, nom du
     document actif, Nouveau/Enregistrer/Imprimer en icônes.
  2. **Barre d'onglets** (`.tb-tabbar`) : "Accueil" (styles de titre, police
     complète y compris gras/italique/couleur/surlignage, paragraphe/listes/
     alignement) et "Insertion" (liens/images, tableau/séparateur/bloc de
     code, saut de page).
  3. **Groupes légendés** (`.tb-group` + `.tb-group-caption`) dans le
     contenu de l'onglet actif — icônes en haut, nom du groupe en petit en
     dessous, séparateur vertical entre groupes, comme "Presse-papiers /
     Police / Paragraphe" dans Word. Toujours 3 lignes maximum au total
     (accès rapide + onglets + un seul rang de groupes par onglet).
  - `src/ui/Toolbar/Toolbar.tsx` : composant `RibbonGroup` réutilisable,
    état local `tab` (`"accueil" | "insertion"`), mêmes `ToolbarActions`
    qu'avant (aucun changement de contrat avec `App.tsx` côté actions).
  - `src/App.tsx` : nouvel état `sidebarOpen` — l'aside `.app-sidebar` n'est
    monté que si `true` ; `Toolbar` reçoit `onToggleSidebar`/`sidebarOpen`/
    `documentTitle` (nom de l'onglet actif, affiché dans la barre d'accès
    rapide).
  - `src/ui/FileExplorer/FileExplorer.tsx` : bouton ✕ optionnel
    (`onClose`) dans l'en-tête, à côté de "Ouvrir…".
  - Vérifié par Playwright/CDP contre le vrai document de travail de
    l'utilisateur : bascule Accueil/Insertion, repli puis redépli de
    l'explorateur (l'espace éditeur se redimensionne correctement),
    toutes les actions restent fonctionnelles (aucun changement de logique,
    seulement de disposition visuelle).
  - **Correctif de disposition (2026-09-13), suite à un retour immédiat de
    l'utilisateur** : le ruban ne devait pas s'arrêter au bord de
    l'explorateur (comme dans la première version) mais occuper toute la
    largeur de la fenêtre, l'explorateur venant EN DESSOUS de lui (à gauche),
    exactement comme dans Word où le ruban ne connaît pas le volet de
    navigation. `App.tsx` restructuré : `.app-shell` est maintenant une
    colonne `[Toolbar (pleine largeur), .app-body]`, `.app-body` étant la
    ligne `[aside .app-sidebar, .app-main-column]` qui portait auparavant
    toute la disposition (`Toolbar` en est sortie). CSS : `.app-shell`
    passe de `display:flex` (ligne) à `flex-direction:column`, nouvelle
    classe `.app-body` reprend l'ancien `display:flex` de `.app-shell`.
    Revérifié visuellement par Playwright/CDP.
  - **Réorganisation Accueil/Format avancé (2026-09-13), toujours sur retour
    direct de l'utilisateur.** Onglet "Insertion" supprimé en tant que tel :
    tout ce qui produit du Markdown standard (ou un commentaire HTML
    universel comme le saut de page) est regroupé dans l'onglet "Accueil",
    sur DEUX lignes (`tb-ribbon-rows`/`tb-ribbon-row`) — ligne 1 : styles de
    titre, gras/italique/barré, listes/citation ; ligne 2 : lien/image,
    tableau/séparateur/code, saut de page. Tout ce qui n'a pas d'équivalent
    Markdown standard (police/taille/couleur/souligné/surlignage/indice-
    exposant/alignement/nettoyage, sérialisé en HTML dans le .md) est
    regroupé dans un second onglet renommé "Format avancé". Un gros bouton
    (`.tb-big-icon`, façon bouton "Coller" de Word) bascule l'explorateur —
    déplacé depuis la petite icône ☰ de la barre d'accès rapide, qui ne
    porte plus que le nom du document + Nouveau/Enregistrer/Imprimer.
    Toujours 3 lignes maximum au total : barre d'onglets + les 2 lignes de
    commandes de l'onglet actif. Revérifié par Playwright/CDP : bascule de
    l'explorateur depuis le gros bouton (masque/réaffiche correctement),
    contenu des deux onglets conforme.
  - **Correctif de regroupement (2026-09-13), sur retour avec capture
    d'écran de Word comme référence exacte.** Le découpage en 2 LIGNES DE
    RUBAN complètes (une ligne de groupes, puis une deuxième ligne de
    groupes en dessous) faisait apparaître deux légendes à des hauteurs
    différentes ("au milieu" après la 1ère ligne, "en bas" après la 2e) —
    pas ce que fait Word : chez eux, TOUS les groupes d'un onglet sont sur
    UNE seule rangée, et c'est à l'intérieur d'un même groupe que les
    boutons se répartissent sur 2 lignes (ex. groupe "Police" : Police/
    Taille en haut, G/I/S/couleur/surlignage en bas), la légende du groupe
    restant collée tout en bas, à la même hauteur pour tous les groupes
    quel que soit leur contenu. Fix dans `Toolbar.css` : `.tb-group-buttons`
    passe de `display:flex` à une grille CSS 2 lignes
    (`grid-template-rows: repeat(2, 1fr); grid-auto-flow: column`) qui
    remplit colonne par colonne, `.tb-group` passe à
    `justify-content: flex-end` pour coller sa légende en bas quel que soit
    le nombre de boutons. Tous les groupes d'un onglet (Accueil : Styles,
    Police, Paragraphe, Liens et médias, Éléments, Mise en page) sont
    redevenus une seule rangée (`Toolbar.tsx` simplifié, plus de
    `tb-ribbon-rows`/`tb-ribbon-row` imbriqués). Revérifié visuellement par
    Playwright/CDP : légendes alignées à l'identique sur toute la largeur
    du ruban, boutons bien répartis sur 2 lignes par groupe.
  - **Polish visuel (2026-09-13)**, sur retour "pas très joli et pratique" :
    la plupart des boutons texte (`• Liste`, `🔗 Lien`, `▦ Tableau`...)
    remplacés par des boutons carrés icône seule (nouvelle classe
    `.tb-btn-icon`, 26×26px, info-bulle au survol) — élimine les largeurs de
    colonne disparates dans la grille 2 lignes qui rendaient le ruban
    "brouillon". Groupes à un seul bouton (Styles, Mise en page) : la grille
    passait de `grid-template-rows: repeat(2, 1fr)` (2 lignes de taille
    FIXE, laissant un grand vide sous un bouton seul) à
    `repeat(2, auto)` + `align-content: center` sur `.tb-group-buttons`
    (`flex:1` ajouté) — un groupe à un seul élément se centre maintenant
    verticalement au lieu de coller en haut avec du vide en dessous. Icône
    "barré" changée de `<s>B</s>` (lettre B barrée, prêtait à confusion à
    côté de G) à `<s>S</s>`. Revérifié : rendu visuel nettement plus
    compact/net sur les deux onglets, et la commande Gras (nouveau bouton
    icône) fonctionne toujours correctement (`<strong>` appliqué à la bonne
    sélection).

### En cours / cassé — à reprendre en priorité
- **~~Aperçu avant impression (PrintPreview + Paged.js) : NE FONCTIONNAIT
  PAS.~~ RÉSOLU (2026-09-13) en abandonnant Paged.js entièrement**, sur
  demande explicite de l'utilisateur ("il faut que l'export PDF marche,
  c'est le PDF qu'on imprimera"). Diagnostic a posteriori : Paged.js est un
  moteur de pagination HTML tiers pensé pour un vrai navigateur ; son
  comportement dans la WebView2 de Tauri n'a jamais été fiable, et de toute
  façon il était **redondant** avec la pagination déjà construite pour la
  vue Pages (voir `src/ui/Editor/pagination/`) — pourquoi repaginer une
  deuxième fois avec un moteur différent alors qu'on a déjà, à l'écran,
  des boîtes `.xmd-page` à taille A4 EXACTE ?
  **Nouvelle solution, beaucoup plus simple** : on imprime directement la
  couche déjà peinte par `paintPages.ts`. `App.tsx` : `handlePrint` appelle
  juste `window.print()` (plus d'état `previewHtml`, plus de composant
  `PrintPreview` — supprimé avec `printPreview.print.css`,
  `src/types/pagedjs.d.ts`, et la dépendance npm `pagedjs`). Le wrapper de
  la vue Pages porte une classe `xmd-pages-mount` que la règle `@media
  print` (voir `App.css`) force à `display:contents !important` — ainsi
  l'impression fonctionne même si l'utilisateur est en vue Markdown/Code
  au moment de cliquer sur "Imprimer" (le style inline React posé par
  `viewMode` ne peut pas gagner contre un `!important`). Le CSS
  d'impression masque tout le chrome (ruban, explorateur, onglets, barre
  de statut) et les couches non visuelles (curseur dessiné, surbrillance,
  éditeur invisible), place `.xmd-page-canvas` en `position:fixed` sans
  transform de zoom ni espacement, et applique `break-after: page` sur
  chaque `.xmd-page` (`@page { size: A4; margin: 0; }`) — les marges sont
  déjà portées par le padding interne de `.xmd-page-content`, donc marge
  de page CSS à 0. "Enregistrer au format PDF" dans la boîte de dialogue
  d'impression système EST maintenant l'export PDF : mêmes pages, même
  police, mêmes sauts de page manuels, rien de plus à construire côté Rust
  pour l'instant (repoussé si un besoin plus fin apparaît — voir feuille de
  route). **Vérifié avec un vrai PDF généré via CDP**
  (`page.pdf({printBackground:true})`, voir méthode de test en haut de ce
  fichier) sur le document de travail réel de l'utilisateur (7 pages) : les
  7 pages du PDF correspondent exactement aux 7 pages affichées à l'écran,
  sauts de page manuels respectés (page 6, vide, correctement comblée à
  pleine hauteur comme deux sauts de page consécutifs le veulent), mise en
  forme intacte (titres, tableaux, listes, citations).
- **Correctif critique (2026-09-13), remonté par l'utilisateur juste après
  le point ci-dessus : "le bouton impression ne marche plus".** La
  vérification par `page.pdf()` (CDP) avait validé le CSS d'impression,
  mais pas le VRAI chemin utilisateur (`window.print()` déclenché par un
  vrai clic) — un `window.print()` réel dans cette version de Tauri/wry
  (Windows/WebView2) **ne fait absolument rien de visible, sans la moindre
  erreur**. Cause trouvée en lisant le code source de Tauri/wry
  directement (voir `src-tauri/src/print_commands.rs` pour l'explication
  complète et commentée) : Tauri réinjecte sa propre implémentation de
  `window.print` dans chaque page (script interne
  `webview/scripts/print.js`), qui invoque la commande IPC
  `plugin:webview|print` ; côté Rust, cette commande appelle
  `wry::WebView::print()`, qui sur le backend WebView2 de wry 0.55.1 n'est
  lui-même qu'un `eval("window.print()")` — sauf que `window.print` a
  DÉJÀ été réécrit par Tauri au moment de cet eval. Résultat : une boucle
  JS → IPC → Rust → eval → JS → IPC → ... qui ne s'arrête jamais mais ne
  plante pas non plus (chaque maillon est asynchrone et se résout tout de
  suite), et qui n'atteint JAMAIS un vrai appel natif de la boîte de
  dialogue. **Fix** : abandon complet de `window.print()` ; nouvelle
  commande Tauri `print_window` (`src-tauri/src/print_commands.rs`) qui
  récupère le handle natif WebView2 via `WebviewWindow::with_webview`
  (nécessite la feature Cargo `unstable` sur `tauri`, ajoutée), caste
  `ICoreWebView2` vers `ICoreWebView2_16` et appelle directement
  `ShowPrintUI(COREWEBVIEW2_PRINT_DIALOG_KIND_SYSTEM)` — l'API COM native,
  sans passer par le DOM/JS de la page, donc sans jamais retomber dans le
  piège ci-dessus. Dépendances ajoutées côté Windows uniquement
  (`[target.'cfg(windows)'.dependencies]`) : `windows = "0.61"` et
  `webview2-com = "0.38"`, alignées sur les versions déjà résolues
  transitivement par wry (vérifié dans `Cargo.lock`) pour éviter deux
  copies incompatibles des mêmes types COM. Le frontend appelle
  `printWindow()` (nouvelle fonction dans `fileService.ts`, seul module
  autorisé à faire des `invoke`) depuis `App.tsx` au lieu de
  `window.print()`. **Vérifié en conditions réelles** (pas seulement via
  CDP) : instrumentation temporaire (`eprintln!`) confirmant l'exécution
  jusqu'à `ShowPrintUI` avec un résultat `Ok(())`, puis confirmation par
  énumération des fenêtres Windows visibles (`EnumWindows` via PowerShell)
  qu'une fenêtre "Microsoft Edge WebView2 – Imprimer" apparaît bien après
  un clic réel sur le bouton "Imprimer" du ruban — l'instrumentation de
  debug a ensuite été retirée. **Piège à ne pas retomber dedans** : ne
  JAMAIS réintroduire `window.print()` dans ce projet (ni dans un futur
  export PDF), tant que ce bug amont Tauri/wry n'est pas corrigé — vérifier
  au préalable dans le changelog de `tauri`/`wry` si une version plus
  récente le corrige avant de revenir en arrière.
- **Mise en page configurable par document (2026-09-13)**, sur demande
  explicite de l'utilisateur : format papier (A4/Letter), orientation,
  marges, en-tête et pied de page (texte + hauteur) sont désormais
  réglables PAR FICHIER — `DEFAULT_PAGE_LAYOUT` reste la valeur de repli
  pour tout fichier qui n'a pas encore de config (nouveaux fichiers créés
  avant cette fonctionnalité, fichiers créés par un autre outil).
  - **Stockage : un commentaire HTML invisible en tête de fichier**
    (`<!-- pagina:config {"configVersion":1,"layout":{...}} -->`,
    `src/core/pageLayout.ts`), plutôt qu'un front-matter YAML — invisible
    dans n'importe quel autre outil Markdown (GitHub, VS Code, Obsidian…),
    contrairement à un front-matter qui s'afficherait comme du texte brut
    dans un rendu qui ne le comprend pas. `configVersion` est la version du
    SCHÉMA du commentaire (pour distinguer plus tard un ancien format à
    migrer d'un format inconnu à ignorer) — **pas** un historique des
    versions du document lui-même : l'utilisateur a mentionné vouloir un
    suivi de versions "pour plus tard", idée notée mais volontairement PAS
    développée maintenant (pas assez spécifiée : suivi de quoi, à quelle
    granularité, avec quelle UI ? à redéfinir avec lui avant de coder quoi
    que ce soit).
  - **Piège découvert et contourné** : un commentaire HTML n'a pas de nœud
    de schéma ProseMirror dédié — le faire porter par l'éditeur Tiptap (le
    laisser dans le texte donné à `setContent`) le fait purement et
    simplement disparaître au premier aller-retour markdown (constaté en
    testant : un fichier neuf rouvert perdait son commentaire dès la
    première sauvegarde). **Fix** : le commentaire est extrait AVANT que le
    contenu n'atteigne jamais l'éditeur (`extractDocumentConfig` dans
    `tabsStore.openFile`) et réinjecté seulement au moment d'écrire sur
    disque (`withDocumentConfig` dans `tabsStore.saveTab`) — l'éditeur ne
    voit et ne manipule jamais que le corps du document, la config vit
    entièrement dans `EditorTab.layout` (nouveau champ), à côté du
    contenu, jamais mélangée à lui.
  - **Repli silencieux** : JSON corrompu, champ manquant, format
    totalement absent → toujours `DEFAULT_PAGE_LAYOUT` (fusion champ par
    champ pour les configs partielles/anciennes), jamais d'erreur ni de
    blocage à l'ouverture.
  - `MarkdownEditor.tsx` ne connaît plus de constantes de format papier
    codées en dur : `layout` (prop, `PageLayoutSettings`) pilote la
    géométrie (`resolvePageSizeMm(layout)` dans `pageLayout.ts`, table
    `PAPER_SIZES_MM`), les variables CSS de la page, et les textes d'en-
    tête/pied de page transmis à `paintPages.ts`.
  - ~~En-tête/pied de page : un texte STATIQUE, pas de numéro de page ni de
    variable dynamique~~ **Variables ajoutées le jour même, voir plus bas.**
    Rendu par `paintPages.ts` (`.xmd-page-header`/`.xmd-page-footer`, un par
    page peinte) et positionné en `position:absolute` DANS la zone de marge
    de `.xmd-page` (comme Word), pas en plus de la marge — à la charge de
    l'utilisateur de garder une marge ≥ hauteur d'en-tête/pied de page (pas
    de validation automatique).
  - **UI** : nouveau bouton ⚙ dans le groupe "Mise en page" du ruban
    (Accueil), ouvre `PageSetupDialog` (`src/ui/PageSetup/`) — formulaire
    simple (pas de zones gauche/centre/droite, pas de galerie de modèles),
    Annuler/Appliquer, aucune prévisualisation en direct dans le dialogue
    lui-même (l'utilisateur voit le résultat une fois appliqué, sur la
    vraie page).
  - **Vérifié par Playwright/CDP** sur un fichier de test dédié (jamais
    sur un document réel de l'utilisateur, supprimé après le test) : format
    Letter + en-tête/pied de page personnalisés appliqués → page
    effectivement redimensionnée (816×1056px, cohérent avec 8.5×11in à
    96dpi) et texte d'en-tête/pied affiché ; sauvegarde → commentaire JSON
    correctement écrit en tête de fichier, corps du document intact en
    dessous (sans le commentaire mélangé dedans) ; fermeture + réouverture
    de l'onglet → format ET textes d'en-tête/pied de page correctement
    restaurés depuis le disque (round-trip complet vérifié).
- **Extension en-tête/pied de page (2026-09-13, même jour), sur nouvelle
  demande de l'utilisateur** : variables dynamiques, édition en place dans
  l'éditeur, masquage sur la première page, et un second commentaire
  d'identité de l'outil. Trois points clarifiés avec l'utilisateur avant de
  coder (`AskUserQuestion`) plutôt que de deviner : la variable "version"
  = version du DOCUMENT saisie à la main (pas la version de Pagina) ;
  "éditeur/rédacteur" = nom de l'auteur du document (pas le nom de
  l'outil) ; "première page différente" = deux cases à cocher
  indépendantes (en-tête et pied de page réglables séparément), pas une
  case unique.
  - **Variables** (`resolveHeaderFooterText` dans `pageLayout.ts`) :
    `{{page}}`, `{{pages}}`, `{{date}}` (JJ/MM/AAAA fixe, pas dépendant de
    la locale du navigateur), `{{filename}}`, `{{version}}`
    (`layout.documentVersion`, saisie manuelle), `{{author}}`
    (`layout.author`, saisie manuelle). Une variable mal orthographiée
    (`{{pgae}}`) est laissée telle quelle plutôt qu'effacée silencieusement
    — plus facile à repérer pour l'utilisateur. Substitution faite PAR
    PAGE dans `paintPages.ts` (le numéro de page et le total dépendent de
    la page en cours de peinture, calculés après la répartition en pages).
  - **Première page différente** : `HeaderFooterSettings.showOnFirstPage`
    (`boolean`, une valeur par en-tête ET une par pied de page,
    indépendantes) — quand `false`, l'élément n'est simplement pas peint
    du tout sur la page 1 (`paintPages.ts`), le reste du document garde
    son en-tête/pied de page normalement.
  - **Édition en place, directement sur la page** (demande explicite :
    "il faudrait pouvoir les éditer directement dans l'éditeur") : cliquer
    sur `.xmd-page-header`/`.xmd-page-footer` (n'importe quelle page) fait
    apparaître un `<input>` flottant (`startHeaderFooterEdit` dans
    `MarkdownEditor.tsx`), positionné exactement par-dessus via
    `getBoundingClientRect()`, PRÉ-REMPLI avec le MODÈLE BRUT (variables
    non résolues) — pas le texte déjà substitué affiché, qui n'aurait pas
    de sens à réécrire tel quel. Le modèle brut est retrouvé via un
    attribut posé sur l'élément peint par `paintPages.ts`
    (`HEADER_TEMPLATE_ATTR`/`FOOTER_TEMPLATE_ATTR`, valeur =
    `header.text`/`footer.text` avant substitution). Entrée = valide,
    Échap = annule, perte de focus = valide. Le dialogue `PageSetupDialog`
    reste disponible pour tout régler d'un coup (hauteurs, cases à cocher
    première page, version/auteur) — les deux chemins écrivent dans le
    même `PageLayoutSettings` via le même callback (`onLayoutChange`).
  - **Second commentaire d'identité de l'outil**, sur demande explicite
    ("décrire notre éditeur Pagina... licence... dépôt GitHub public") :
    `<!-- pagina:generator {"app":"Pagina","appVersion":"0.1.0",
    "publisher":"Mon BE Fluides","website":"...","license":"Dépôt GitHub
    public"} -->` (`serializeGeneratorComment` dans `pageLayout.ts`,
    constantes dans le nouveau `src/core/appInfo.ts`). Réécrit à neuf à
    CHAQUE sauvegarde (jamais relu, purement informatif — comme la balise
    `<meta name="generator">` d'une page web) ; `appVersion` importe
    directement `package.json` (`resolveJsonModule` déjà activé dans
    `tsconfig.json`) pour rester synchronisé sans y penser à chaque bump
    de version.
  - **Fichier `.md` gardé propre** (préoccupation explicite de
    l'utilisateur) : toujours EXACTEMENT deux lignes de commentaire en tête
    de fichier (generator + config), jamais plus — toute information
    future doit rejoindre le JSON existant, pas ajouter une troisième
    ligne. `extractDocumentConfig` dépouille maintenant les DEUX
    commentaires en boucle (peu importe leur ordre) avant de donner le
    contenu à l'éditeur — piège identifié à la conception : ne dépouiller
    que le premier aurait laissé le second traîner dans le corps du
    document (visible dans la vue Markdown brute, et DUPLIQUÉ à chaque
    sauvegarde suivante puisque `withDocumentConfig` en réécrit toujours un
    neuf en tête).
  - **Vérifié par Playwright/CDP** sur un fichier de test dédié (supprimé
    après coup) : dialogue avec variables + case "première page" décochée
    pour l'en-tête → en-tête absent sur la page 1, pied de page substitué
    correctement ; clic direct sur le pied de page → champ flottant
    pré-rempli avec le MODÈLE brut (pas le texte affiché) → nouvelle
    valeur tapée et validée (Entrée) → substitution appliquée
    immédiatement ; sauvegarde → exactement deux lignes de commentaire en
    tête de fichier, corps intact en dessous ; fermeture + réouverture →
    tout restauré (texte du pied de page ET substitution de `{{date}}`
    recalculée au jour courant) ; deuxième sauvegarde sans changement →
    toujours exactement deux lignes `pagina:*` (pas de duplication).
- **Correctif (2026-09-13), remonté par l'utilisateur juste après :
  "je n'arrive pas à cliquer sur l'en-tête ou le pied de page".** Cause
  simple mais non anticipée : `paintPages.ts` ne peignait
  `.xmd-page-header`/`.xmd-page-footer` QUE SI leur texte n'était pas vide
  (`header.text && ...`) — tant que l'utilisateur n'était jamais passé par
  le dialogue "Mise en page" pour taper un premier texte, l'élément
  n'existait tout simplement PAS dans le DOM : rien à cliquer, nulle part.
  **Fix** : l'élément est maintenant TOUJOURS peint dès que la page
  l'autorise (`header.showOnFirstPage || !isFirstPage`), qu'il soit vide ou
  non — vide, il reste invisible en fonctionnement normal (pas de bordure
  ni de fond), mais devient cliquable, et un contour pointillé +
  info-bulle apparaît au survol sur la première page pour indiquer qu'on
  peut cliquer là (`:empty:hover` en CSS, `MarkdownEditor.css`). En plus de
  ce correctif, sur demande explicite ("rajouter une commande dans mise en
  page, pour que ce soit plus facile") : deux nouveaux boutons "En-tête"/
  "Pied de page" dans le groupe "Mise en page" du ruban, qui ouvrent le
  même éditeur en place qu'un clic direct sur la page (nouvelles méthodes
  `editHeader`/`editFooter` sur `MarkdownEditorHandle`, `startHeaderFooterEdit`
  rendue accessible depuis `useImperativeHandle` via une ref intermédiaire
  — `startHeaderFooterEditRef` — le même schéma que `repaintRef`/
  `repaintCaretRef` déjà utilisé dans ce fichier, nécessaire car la fonction
  est définie physiquement après `useImperativeHandle` dans le fichier).
  Revérifié par Playwright/CDP : clic sur un en-tête totalement vide (jamais
  configuré via le dialogue) ouvre bien l'éditeur en place ; les deux
  nouveaux boutons du ruban aussi.
- **Menu "Variable" dans le ruban (2026-09-13, même jour)**, sur demande
  explicite ("rajouter dans le ruban des commandes pour ajouter les numéros
  de page, nombre de pages...") : un bouton "Variable ▾" (même composant
  menu que le sélecteur de titres) dans le groupe "Mise en page", listant
  les 6 variables (numéro de page, nombre de pages, date, nom de fichier,
  version, auteur — voir `HEADER_FOOTER_VARIABLES` dans `Toolbar.tsx`).
  Insère dans le champ d'en-tête/pied de page ACTUELLEMENT OUVERT (au
  point du curseur, pas en écrasant le texte existant) ; s'il n'y en a
  aucun d'ouvert, ouvre celui de l'en-tête par défaut et insère à la fin.
  - **Deux pièges résolus pendant l'implémentation** :
    1. Cliquer un bouton de menu déclenche `mousedown` AVANT `click` — sur
       un champ `<input>` flottant déjà focus (l'édition en place de
       l'en-tête/pied de page), ce `mousedown` lui aurait fait perdre le
       focus (`blur`), qui LE REFERME (`commit()`) avant même que le
       `onClick` du bouton n'ait eu la moindre chance de s'exécuter — la
       variable se serait donc insérée dans un champ déjà fermé, pour
       rien. **Fix** : `onMouseDown={(e) => e.preventDefault()}` sur
       chaque option du menu ET sur son bouton déclencheur — empêche le
       changement de focus sans empêcher le `click` de se produire ensuite.
    2. Le champ flottant (`z-index: 50`) et le menu déroulant du ruban
       (`z-index: 20` à l'origine) peuvent se chevaucher à l'écran (le
       champ d'en-tête est juste sous le ruban) — le champ, par-dessus,
       interceptait alors les clics destinés aux options du menu en
       dessous (constaté via Playwright : `<input> intercepts pointer
       events`). **Fix** : `z-index: 60` sur `.tb-heading-menu` (toujours
       au-dessus du champ flottant, quelle que soit leur position relative
       à l'écran).
  - `insertHeaderFooterVariable` (nouvelle méthode sur
    `MarkdownEditorHandle`, comme `editHeader`/`editFooter`) suit le même
    schéma de ref intermédiaire (`insertHeaderFooterVariableRef`) que
    `startHeaderFooterEditRef` pour la même raison (définie après
    `useImperativeHandle` dans le fichier).
  - **Vérifié par Playwright/CDP** : insertion sans aucun champ ouvert
    (ouvre l'en-tête, insère `{{page}}`) puis une deuxième insertion juste
    après avoir tapé du texte supplémentaire (`{{page}} — {{filename}}`,
    dans le bon ordre, sans perdre ce qui avait déjà été tapé) → affichage
    final correctement substitué ("1 — var-test.md").
- **Styles de titres + numérotation automatique + sommaire (2026-09-13,
  même jour)**, sur demande explicite de l'utilisateur ("il faudrait
  pouvoir écrire les styles de titre... rajouter des puces de
  numérotation... construire ou reconstruire un sommaire"). Trois points
  clarifiés avec lui avant de coder (`AskUserQuestion`) plutôt que de
  deviner sur une fonctionnalité aussi structurante :
  1. La numérotation ("1.1.", "A."...) est ÉCRITE EN DUR dans le texte du
     titre (pas un simple affichage calculé comme les variables d'en-tête)
     — reste donc correcte dans n'importe quel autre outil Markdown.
  2. Le schéma de numérotation est réglable INDÉPENDAMMENT par niveau de
     titre (comme les listes multi-niveaux de Word), pas un seul réglage
     global pour tout le document.
  3. Les styles (police/taille/couleur/gras/italique) sont réglables par
     document, mais dans un DIALOGUE SÉPARÉ de "Mise en page" (comme le
     panneau de styles de Word) — un import/export de cette config entre
     documents est prévu comme évolution future, PAS développé maintenant.
  4. Le sommaire s'insère via un marqueur `<!-- toc -->` (même principe que
     `<!-- pagebreak -->`), remplacé par la vraie liste Markdown au clic sur
     "Générer".
  - **`src/core/pageLayout.ts` étendu** : `HeadingLevel` (1-6),
    `NumberingScheme` ("none"/"decimal"/"upperRoman"/"lowerRoman"/
    "upperAlpha"/"lowerAlpha"), `HeadingLevelStyle`, `headingStyles:
    Record<HeadingLevel, HeadingLevelStyle>` ajouté à `PageLayoutSettings`
    (donc dans le même commentaire `pagina:config` — seule l'interface est
    séparée, pas le stockage, conformément à la réponse de l'utilisateur).
    Numérotation DÉSACTIVÉE par défaut sur tous les niveaux ("none") :
    réécrire le texte des titres est une transformation bien trop visible
    du contenu pour être un comportement par défaut. `toRoman`/`toAlpha`/
    `formatCounter` : conversion numéro → représentation textuelle.
  - **`src/ui/Editor/extensions/HeadingAutoNumber.ts`** — PIÈGE rencontré et
    corrigé pendant l'implémentation : la première version était un plugin
    ProseMirror `appendTransaction`, qui ne se déclenche que sur une
    transaction modifiant le DOCUMENT — activer la numérotation depuis le
    dialogue "Styles de titres" ne touche que `layout` (React), jamais le
    document, donc le plugin ne se redéclenchait JAMAIS dans ce cas
    (numérotation apparaissant seulement après la frappe suivante, jamais
    immédiatement après avoir coché l'option — repéré par test). **Fix** :
    abandon du plugin, remplacé par une fonction simple
    (`applyHeadingNumbering(view, headingStyles)`) appelée explicitement
    dans `repaint()` de `MarkdownEditor.tsx` — `repaint()` étant déjà
    invoquée à chaque frappe ET à chaque changement de `layout`, un seul
    point d'appel couvre tous les déclencheurs utiles. Reconnaissance de
    l'ancien préfixe à remplacer via une regex STATELESS (pas un attribut
    de nœud ProseMirror, qui ne survivrait pas à une sauvegarde/réouverture
    puisque le Markdown ne connaît que le texte) — limite acceptée : un
    titre dont le vrai texte commencerait par hasard par "1.5. " serait à
    tort traité comme un ancien préfixe auto-généré (risque qui n'existe
    que si l'utilisateur a explicitement activé la numérotation). Seule la
    portion "préfixe" du texte est modifiée par la transaction (jamais le
    reste du titre), pour ne jamais perdre de mise en forme (gras, lien)
    appliquée dans le titre par l'utilisateur. `tr.setMeta("addToHistory",
    false)` : cette correction automatique n'apparaît pas comme une étape
    Ctrl+Z séparée.
  - **`src/ui/Editor/extensions/TocMarker.ts`** (même principe que
    `PageBreak.ts`) : nœud atome persisté en `<!-- toc -->`, rendu comme un
    encart "Sommaire — cliquer sur Générer..." tant qu'il n'est pas
    généré. Commande `generateToc` : construit une liste à puces IMBRIQUÉE
    (JSON de nœuds ProseMirror, algorithme à pile pour respecter la
    hiérarchie des niveaux) à partir de tous les titres du document, et
    remplace TOUS les marqueurs présents (ou insère directement au curseur
    s'il n'y en a aucun, par confort). **Limite acceptée** (le choix retenu
    par l'utilisateur l'implique) : une fois généré, le marqueur a disparu
    (remplacé par la vraie liste) — pour régénérer un sommaire à jour après
    avoir ajouté des titres, il faut supprimer l'ancienne liste et insérer
    un nouveau `<!-- toc -->`. Pas de marqueur de fin caché pour retrouver
    automatiquement les bornes d'un sommaire déjà généré (aurait ajouté de
    la complexité et un risque de corruption non demandés).
  - **UI** : bouton 🎨 "Styles de titres" à côté du sélecteur de titres
    (groupe "Styles", onglet Accueil) ouvre `HeadingStyleDialog`
    (`src/ui/HeadingStyles/`, dialogue séparé de `PageSetupDialog` comme
    demandé) — un tableau de 6 lignes (Titre 1 à 6) × police/taille/
    couleur/gras/italique/numérotation. Nouveau groupe "Sommaire" (onglet
    Accueil) : bouton insertion du marqueur + bouton génération/mise à jour.
  - **Vérifié par Playwright/CDP** sur un fichier de test dédié (supprimé
    après coup) : document à 4 titres (2×Titre 1, 2×Titre 2 imbriqués),
    numérotation décimale activée sur les niveaux 1 et 2 → titres
    correctement préfixés IMMÉDIATEMENT après avoir coché l'option dans le
    dialogue (sans avoir besoin de taper quoi que ce soit après) ; sommaire
    généré avec la bonne hiérarchie imbriquée (liste à puces, niveau 2 sous
    son niveau 1 parent) ; sauvegarde → fichier `.md` propre (toujours
    exactement 2 lignes de commentaire en tête), numéros ET sommaire présents
    comme texte Markdown réel et standard en dessous.
- **Complément de couverture Markdown (2026-09-13, même jour)**, sur demande
  de l'utilisateur qui a fourni un pense-bête complet de la syntaxe
  Markdown pour identifier ce qui manquait encore. Après audit, implémenté
  dans cette session : code en ligne, coloration syntaxique des blocs de
  code, alignement de colonnes de tableau. Clarifié au préalable avec lui
  (`AskUserQuestion`) que Mermaid/LaTeX/emoji restaient d'intérêt réel (pas
  juste mentionnés pour la forme) et devaient vivre dans un ONGLET DE RUBAN
  séparé d'Accueil/Format avancé — construits dans la foulée le même jour,
  voir la section "Onglet Extras" plus bas ; notes de bas de page et
  ancres de sommaire cliquables également faites le même jour (sections
  dédiées plus haut).
  - **Code en ligne** : bouton dédié (groupe "Police", Accueil) —
    jusqu'ici le bouton "Code" n'activait qu'un BLOC entier
    (`toggleCodeBlock`), aucun moyen d'avoir `` `code` `` au milieu d'une
    phrase. Nouvelle commande `toggleCode` (marque `code`, déjà présente
    dans le schéma via StarterKit, juste jamais exposée dans le ruban).
  - **Coloration syntaxique des blocs de code** :
    `@tiptap/extension-code-block-lowlight` + `lowlight` (`createLowlight(common)`
    — le sous-ensemble de langages courants de lowlight, pas les ~190
    langages disponibles, pour ne pas alourdir le bundle). Remplace le
    `codeBlock` de StarterKit (`StarterKit.configure({ codeBlock: false })`,
    même technique que pour désactiver un module par défaut et le
    remplacer par une extension plus riche). Sélecteur de langage dans le
    ruban (groupe "Éléments", Accueil) à côté du bouton "Bloc de code" —
    liste figée dans `Toolbar.tsx` (PAS un import direct des clés de
    `common` depuis `MarkdownEditor.tsx`, pour ne pas coupler ce fichier à
    la config interne de l'éditeur ; les deux listes doivent rester
    synchronisées manuellement si les langages `common` changent). Thème de
    coloration fait main dans `MarkdownEditor.css` (classes `.hljs-*` que
    lowlight produit réellement) plutôt qu'importer une feuille de style
    highlight.js complète. Sérialisation Markdown vérifiée : un bloc de
    code avec langage se sauvegarde en fenced code block GFM standard
    (```` ```javascript ````), lisible partout.
  - **Alignement de colonnes de tableau** — PIÈGE DÉCOUVERT ET CORRIGÉ :
    étendre `TextAlign.configure({ types: [...] })` avec `"tableCell"` et
    `"tableHeader"` suffit pour que l'alignement s'applique VISUELLEMENT
    (attribut `textAlign` posé sur la cellule, `style="text-align:…"`
    hérité par son contenu) — mais `tiptap-markdown` (lu directement dans
    `node_modules/tiptap-markdown/src/extensions/nodes/table.js`) sérialise
    TOUJOURS la ligne de séparation GFM en `---` pour chaque colonne, sans
    jamais lire cet attribut ("align" n'apparaît nulle part dans tout le
    paquet). Résultat sans le fix : alignement visible à l'écran, mais
    PERDU à la sauvegarde (fichier .md toujours sans indication
    d'alignement). **Fix** : nouvelle extension
    `src/ui/Editor/extensions/TableMarkdown.ts`, qui étend le VRAI `Table`
    de `@tiptap/extension-table` (`Table.extend({ addStorage() {...} })` —
    pas un nœud bâti de zéro comme `PageBreak`/`TocMarker`, ceux-là
    définissent un nœud entièrement NOUVEAU alors qu'ici il fallait
    conserver tout le schéma/comportement du VRAI tableau et seulement
    remplacer sa sérialisation) et réécrit la ligne de séparation avec
    `:---`/`:---:`/`---:` selon `cell.attrs.textAlign` de la première
    ligne de chaque colonne. Le PARSING (Markdown → document, au
    chargement) n'a rien demandé de spécial : markdown-it restitue déjà
    l'alignement via `style="text-align:…"` sur les cellules, que
    `TextAlign` sait lire nativement (`parseHTML: element.style.textAlign`).
  - **Vérifié par Playwright/CDP** sur un fichier de test dédié (supprimé
    après coup) : bloc de code JavaScript avec mots-clés/chaînes/nombres
    correctement colorés à l'écran ET fenced code block correct sur
    disque ; tableau 3 colonnes avec gauche/centré/droite appliqués →
    ligne de séparation `| :--- | :---: | ---: |` dans le fichier
    sauvegardé, alignement bien restauré après fermeture/réouverture de
    l'onglet.
- **Ancres de sommaire cliquables (2026-09-13, même jour)**, sur choix de
  l'utilisateur parmi les items restants ("notes de bas de page" et
  "onglet Mermaid/LaTeX/emoji" repoussés à la suite). Cliquer une ligne du
  sommaire généré fait défiler jusqu'au titre correspondant, dans
  l'éditeur paginé (pas une simple ancre de navigateur classique — nos
  pages sont une couche peinte, pas un document HTML normal).
  - **`src/ui/Editor/pagination/slug.ts`** (nouveau, partagé) :
    `slugifyHeading`/`uniqueHeadingSlug` — anchors façon GitHub (minuscules,
    espaces → tirets, ponctuation retirée, suffixe `-1`/`-2` en cas de
    titres identiques). DOIT être utilisé avec le MÊME ordre de parcours
    des titres aux deux endroits qui s'en servent (`paintPages.ts` pour
    poser les `id`, `TocMarker.ts` pour générer les `href`), sinon les
    liens généreraient des ancres qui ne correspondent à aucun `id` réel.
  - **`paintPages.ts`** : après avoir cloné chaque bloc, si le clone EST un
    titre ou en CONTIENT un, lui pose un `id` unique (`Set` partagé sur
    toute la boucle de peinture, jamais réinitialisé par page — les slugs
    doivent être uniques sur le document entier).
  - **`TocMarker.ts`** : chaque entrée du sommaire généré est maintenant un
    vrai LIEN (marque `link`, `href="#slug"`) au lieu d'un texte brut —
    cliquable dans Pagina ET dans n'importe quel rendu Markdown→HTML
    classique (ancre standard, fonctionne aussi hors de l'app).
  - **`MarkdownEditor.tsx`** : le gestionnaire de clic sur la couche peinte
    reconnaît maintenant un lien `href="#…"` (`closest('a[href^="#"]')`) et
    fait défiler (`scrollIntoView({behavior:"smooth"})`) jusqu'à l'élément
    portant l'`id` correspondant, AVANT la résolution habituelle de
    position de clic (sinon le clic aurait juste positionné le curseur à
    l'endroit du lien, comme pour n'importe quel autre lien). Un lien
    EXTERNE classique (`https://...`) n'est pas concerné par ce nouveau
    chemin — seul `#…` est intercepté, le reste garde son comportement
    inchangé (positionnement du curseur, pas de navigation).
  - **Vérifié par Playwright/CDP** sur un fichier de test dédié (supprimé
    après coup) : sommaire généré sur un document de 2 pages, clic sur la
    deuxième entrée → défilement confirmé visuellement jusqu'à la page 2
    (indicateur de page passé de "1 sur 2" à "2 sur 2", titre ciblé bien
    visible en haut de la zone visible).
- **Correctif critique (2026-09-13), remonté par l'utilisateur : "quand je
  suis dans l'éditeur Markdown, ça m'ouvre une page dans Chrome".** Cliquer
  un vrai lien (`<a href="https://…">`, inséré via le bouton "Lien")
  faisait naviguer le SYSTÈME (fenêtre Chrome ouverte par-dessus l'appli)
  au lieu de simplement positionner le curseur, comme n'importe quel autre
  clic sur la couche peinte en lecture seule. Cause : Tauri
  (`tauri-plugin-opener`) redirige toute tentative de navigation qui
  s'échapperait de la WebView vers le navigateur système par défaut
  (mesure de sécurité) — et `e.preventDefault()` posé sur l'événement
  `mousedown` (déjà en place dans `onMouseDown`) ne suffit PAS à annuler la
  navigation par défaut déclenchée par l'événement `click` natif du lien
  qui suit. **Fix** : nouvel écouteur `click` (pas seulement `mousedown`)
  sur le canvas peint, qui appelle `preventDefault()` dès que la cible est
  (ou est contenue dans) un `<a>` — filet de sécurité simple et
  inconditionnel, plutôt que d'essayer de couvrir chaque chemin
  (`resolveClickPosition` qui renverrait `null`, ancre `#…`, lien externe...)
  un par un. Revérifié par Playwright/CDP : clic sur un lien externe réel
  → aucune nouvelle fenêtre/onglet (vérifié à la fois côté CDP et par
  énumération des fenêtres Windows visibles), curseur positionné
  normalement comme n'importe quel autre clic sur la page.
- **Notes de bas de page (2026-09-13, même jour)** — en réalité des notes de
  FIN DE DOCUMENT, comme convenu avec l'utilisateur (une vraie note en bas
  de CHAQUE page serait bien plus complexe avec notre pagination : il
  faudrait savoir sur quelle page atterrit chaque référence). Syntaxe
  Markdown standard identique à Pandoc/GFM-footnotes : `[^1]` dans le texte,
  `[^1]: Contenu.` en fin de document.
  - **`src/ui/Editor/extensions/Footnote.ts`** (nouveau) : deux nœuds,
    `FootnoteReference` (inline, atome, rendu en exposant cliquable) et
    `FootnoteDefinition` (bloc, contenu RÉELLEMENT éditable — `content:
    "inline*"`, pas juste un texte opaque comme `PageBreak`/`TocMarker` qui
    n'ont aucun contenu interne). La règle de bloc markdown-it pour la
    définition pousse donc TROIS tokens (ouverture/inline/fermeture, comme
    le fait markdown-it pour un paragraphe normal) plutôt qu'un seul token
    auto-fermant, pour que son contenu devienne du vrai texte ProseMirror
    éditable (gras, liens... possibles dans une note) au lieu d'une chaîne
    figée.
  - **PIÈGE DÉCOUVERT ET CORRIGÉ, le plus coûteux en debug de cette
    fonctionnalité** : `[^1]` se sauvegardait et se ré-affichait comme
    `<sup>1</sup>` NU après fermeture/réouverture du fichier — tous nos
    attributs (`data-type`, `data-id`, classe) disparus. Après avoir
    instrumenté (`console.log` temporaire) chaque étape du pipeline
    (règle inline markdown-it → rendu HTML → conversion HTML→ProseMirror),
    confirmé que markdown-it produisait bien le HTML correct
    (`<sup data-type="footnote-ref" data-id="1" class="xmd-footnote-ref">`)
    — la perte se produisait dans la conversion HTML→ProseMirror. Cause :
    `@tiptap/extension-superscript` déclare AUSSI une règle `parseHTML`
    pour la balise `<sup>`, SANS condition d'attribut — et
    `Superscript` est déclaré AVANT `FootnoteReference` dans la liste
    d'extensions de `MarkdownEditor.tsx`. ProseMirror essaie les règles de
    schéma dans l'ordre d'enregistrement des extensions par défaut : la
    règle générique de Superscript ("n'importe quel `<sup>`") matchait
    donc EN PREMIER et gagnait systématiquement, transformant notre nœud
    personnalisé en simple marque exposant, tous attributs perdus. **Fix**
    : `priority: 100` (défaut ProseMirror : 50) sur la règle `parseHTML` de
    `FootnoteReference` — une règle plus spécifique doit toujours porter
    une priorité plus haute que les règles génériques susceptibles
    d'intercepter la même balise, peu importe l'ordre de déclaration des
    extensions. **À RETENIR pour toute future extension basée sur une
    balise HTML DÉJÀ utilisée ailleurs dans le schéma** (`sup`, `sub`,
    `div`, `span`...) : vérifier si une autre extension du projet déclare
    aussi cette balise sans condition d'attribut, et poser `priority` si
    oui — ce piège est invisible tant qu'on ne teste pas le VRAI
    aller-retour sauvegarde/réouverture (l'insertion via commande directe,
    elle, fonctionnait très bien dès le début, puisqu'elle ne passe jamais
    par le parsing HTML).
  - **UI** : bouton `[^]` (nouveau groupe "Notes", onglet Accueil) —
    calcule le prochain id disponible (max des ids déjà utilisés + 1),
    insère la référence au curseur, ajoute la définition en fin de
    document et y déplace le curseur pour taper directement le contenu de
    la note. Clic sur une référence dans la couche peinte → défilement
    jusqu'à sa définition (même mécanisme que les ancres de sommaire).
    Numérotation NON automatiquement recalculée si une note est supprimée
    au milieu (comportement simple et prévisible, à l'inverse de la
    numérotation des titres qui, elle, se recalcule en continu).
  - **Vérifié par Playwright/CDP** sur un fichier de test dédié (supprimé
    après coup) : insertion → référence en exposant + définition en fin de
    document avec curseur bien positionné dedans ; sauvegarde → syntaxe
    `[^1]`/`[^1]: …` standard ; fermeture + réouverture → attributs
    correctement restaurés (piège ci-dessus confirmé résolu) ; clic sur la
    référence → aucune erreur.
- **Onglet "Extras" — Mermaid / LaTeX / emoji (2026-09-13, même jour)**,
  dernier morceau de l'ide-mémoire Markdown fourni par l'utilisateur.
  Confirmé au préalable (`AskUserQuestion`) que ces trois familles étaient
  un vrai besoin (pas juste mentionnées pour la forme) et devaient vivre
  dans un ONGLET DE RUBAN séparé d'Accueil/Format avancé. Dépendances
  ajoutées : `mermaid` (**version 11.17.2, PAS la 12.x** — la 12 tire une
  dépendance transitive de `chevrotain`/`lodash-es` avec une vulnérabilité
  de sécurité connue, `npm audit` en a alerté immédiatement après
  installation ; downgrade fait sur-le-champ, `npm audit` propre depuis) et
  `katex` (rendu LaTeX, synchrone).
  - **Mermaid** (`src/ui/Editor/extensions/MermaidDiagram.ts`) : persisté
    comme un bloc de code fenced Markdown STANDARD (```mermaid ... ```, la
    convention GitHub/GitLab/Obsidian) — pas un format propriétaire. Pas de
    règle markdown-it dédiée pour le PARSING : un bloc ```mermaid est un
    fence tout à fait normal, déjà pris en charge par `CodeBlockLowlight` ;
    le hook `updateDOM` de tiptap-markdown (déjà utilisé par leur propre
    extension `codeBlock` pour nettoyer le HTML généré — un point
    d'extension prévu pour ce genre de post-traitement) transforme après
    coup `<pre><code class="language-mermaid">` en notre
    `<div data-type="mermaid">`. Rendu via un NodeView Tiptap manuel :
    `<textarea>` pour la source (édition directe, un `input` redéclenche le
    rendu), `<div>` pour le SVG produit par `mermaid.render()` (asynchrone) —
    une syntaxe invalide affiche un message d'erreur à la place, jamais de
    blocage.
  - **LaTeX** (`src/ui/Editor/extensions/Math.ts`) : `$formule$` en ligne,
    `$$formule$$` en bloc (convention Pandoc/GFM la plus répandue), rendu
    STATIQUE via `katex.renderToString` (synchrone, contrairement à
    Mermaid — pas besoin de NodeView asynchrone, mais un NodeView reste
    nécessaire quand même car `renderHTML` de Tiptap ne permet pas
    d'injecter du HTML déjà construit comme enfant, seulement du texte brut
    ou d'autres nœuds). Édition : clic sur une formule déjà rendue → invite
    (`window.prompt`, même schéma que `setLink`/`insertImage`) pré-remplie
    avec la source actuelle, en réutilisant `resolveClickPosition`
    (`posFromEvent`) déjà fiable sur du contenu en ligne — pas de nouveau
    mécanisme de résolution de position à inventer. Une formule invalide se
    rend quand même (KaTeX en mode `throwOnError:false`), erreur affichée
    en rouge à la place du résultat.
  - **Emoji** : liste figée d'emoji courants dans `Toolbar.tsx`
    (`EMOJI_LIST`), insérés comme caractère Unicode RÉEL (pas un code
    `:smile:` à interpréter) — lisibles tels quels dans n'importe quel
    autre outil, sans dépendance à un rendu spécial.
  - **Limite connue, pas corrigée** : insérer une formule/diagramme (des
    nœuds de GROUPE BLOC) alors que le curseur est au milieu du contenu en
    ligne d'un paragraphe déjà rempli peut échouer silencieusement
    (`insertContent` ne trouve pas toujours de point de scission valide) —
    fonctionne de façon fiable quand le curseur est sur sa propre ligne
    (paragraphe vide ou fin de document). Pas encore creusé plus loin
    (contournement simple : insérer sur une ligne à part).
  - **Piège méthodologique découvert PENDANT la vérification** (pas un bug
    Pagina, mais à connaître pour la suite) : un test Playwright utilisant
    `dialog.accept('...\\sum...')` avec des antislashs semblait révéler une
    corruption de la source LaTeX à la sauvegarde (`\sum` → `sum`, `\frac`
    → un caractère de saut de page invisible + `rac`) — après une session
    de debug complète (instrumentation à chaque étape du pipeline), la
    cause s'est avérée être **l'outil d'édition utilisé pour écrire les
    scripts de test eux-mêmes** : un antislash doublé (`\\`) tapé dans un
    heredoc Bash (`cat > script.mjs << 'EOF'`) atterrissait parfois comme
    un seul antislash dans le fichier réellement écrit sur disque, AVANT
    même que Playwright ou l'application n'entrent en jeu. Confirmé en
    comparant le contenu réel du `.mjs` généré (lu directement) à ce qui
    avait été demandé, puis en réécrivant le même script via l'outil
    `Write` (qui n'a pas ce problème) — le round-trip s'est alors avéré
    PARFAITEMENT correct au premier essai. **À RETENIR** : pour tout futur
    test contenant des antislashs (regex, chemins Windows, LaTeX...),
    préférer l'outil `Write` à un heredoc Bash pour écrire le script de
    test, et si un résultat semble corrompu de façon suspecte, vérifier le
    contenu du script de test LUI-MÊME (via l'outil Read) avant de
    soupçonner le code de l'application.
  - **Vérifié par Playwright/CDP** (scripts écrits avec `Write` après la
    découverte ci-dessus) : emoji inséré comme caractère réel ; formule en
    ligne et en bloc rendues via KaTeX (classes `.katex` présentes) ;
    diagramme Mermaid avec source éditable + SVG rendu en direct
    (capture d'écran) ; sauvegarde → syntaxe Markdown standard
    (```mermaid, `$$...$$`) avec antislashs intacts ; fermeture +
    réouverture → tout correctement restauré (formule bloc avec `\sum`/
    `\frac` confirmée caractère pour caractère via l'outil Read directement
    sur le fichier).
- Bug de doublon d'onglet corrigé dans `tabsStore.openFile` (race condition sur
  appels concurrents, protection par `Map` de promesses en cours) mais **non
  revérifié en conditions réelles** après le correctif — le store zustand
  garde son état en mémoire entre les rechargements HMR, donc un état corrompu
  observé avant le fix peut persister jusqu'à un vrai redémarrage de l'app.

### Pas commencé
- **~~En-têtes/pieds de page, marges, format papier/orientation~~ ET
  ~~variables dynamiques/édition en place/première page différente~~ FAIT
  (2026-09-13)** — voir section "Mise en page configurable par document"
  et son extension juste après, plus haut. Ce qui reste hors périmètre :
  zones gauche/centre/droite dans l'en-tête/pied de page (un seul texte
  centré pour l'instant — trois champs distincts serait l'évolution
  naturelle si demandé), et un modèle par défaut au niveau du WORKSPACE
  (chaque fichier a sa propre config, pas de réglage global pour l'instant
  — `DEFAULT_PAGE_LAYOUT` sert de valeur de repli commune, mais rien n'est
  encore configurable "pour tout le dossier" en une fois).
- Numérotation de page dans un format autre que `{{page}}`/`{{pages}}` brut
  (variantes i,ii,iii ou 1,2,3 avec préfixe configurable) — la variable de
  base existe déjà (voir ci-dessus), il manque juste le choix du format.
- **~~Sommaire automatique~~ ET ~~cliquable à l'écran~~ FAIT (2026-09-13)**
  — voir section "Styles de titres + numérotation automatique + sommaire"
  et "Ancres de sommaire cliquables" plus haut. Reste hors périmètre : pas
  de numéro de page réel affiché dans le sommaire (nécessiterait une
  résolution de page PAR titre, pas encore implémentée) — seul le lien
  cliquable existe, pas un rendu "Titre .... 3" à la Word.
- **~~Styles de titres~~ FAIT (2026-09-13)** — voir section dédiée plus
  haut. Reste hors périmètre : import/export de la config de styles entre
  documents (mentionné par l'utilisateur comme besoin futur, pas encore
  spécifié — format du fichier exporté, sélection partielle des niveaux à
  importer, etc. à définir avec lui le moment venu).
- Gestion des images mode "atelier" (dossier `images/` par fichier, copie
  automatique au collage/glisser) — actuellement `insertImage` ne fait qu'un
  prompt d'URL, aucune copie de fichier local.
- Mode "paquet" `.mdpack` (ZIP fichier + images/ + settings.json).
- Bascule automatique `.md` → `.xmd` à l'ajout d'une ressource, avec toast de
  notification.
- Thème sombre.
- Renommer / dupliquer / supprimer / déplacer (drag & drop) dans l'explorateur
  (seule l'ouverture et la création à la racine sont implémentées).
- Détachement d'onglet en fenêtre séparée (explicitement optionnel/bonus dans
  le cahier des charges).

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
   (2026-09-13)** — voir section "Impression / export PDF" plus haut.
2. ~~En-têtes/pieds de page + marges/format papier/orientation
   configurables~~ **Fait (2026-09-13)** — voir section "Mise en page
   configurable par document" plus haut.
3. Numérotation de page configurable.
4. Sommaire automatique.
5. Gestion des images mode atelier (copie réelle dans `images/`).
6. Mode paquet `.mdpack` + bascule automatique `.xmd`.
7. Actions manquantes de l'explorateur (renommer/dupliquer/supprimer/déplacer).
8. Thème sombre.

## Feuille de route produit (hors périmètre V1, ne pas développer maintenant)

Documentée dans `README.md` — module IA, multi-fenêtres, autres formats
d'export, licence.

- **Import `.docx` (idée de l'utilisateur, pas encore détaillée/décidée,
  2026-09-13)** : l'utilisateur a mentionné avoir "une petite idée" de
  comment s'y prendre, à discuter avec lui avant de commencer quoi que ce
  soit — ne pas partir sur une implémentation (ex. réutiliser le fork
  `pagina-docx-engine`/CasualOffice mis de côté, ou un convertisseur externe
  type Pandoc) sans validation explicite de son approche.
