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
- **Couleurs UI** : nuancier officiel MBEF (anciennement `src/ui/theme/tokens.ts`, supprimé : jamais importé, les couleurs vivent dans les CSS)
  (Mon BE Fluides), référence de couleurs : `sapin`
  #003F2B (primaire : ruban, en-têtes de panneaux, éléments actifs),
  `prairie` #24AC6E (accents : onglet actif, cases cochées, boutons
  d'action), `ocean` #2F52A0 (liens, sommaire, titres), `charbon`
  #343334 (texte), `carotte` #EB5B1F (erreurs), `sable` #F7AE37
  (avertissements), `azur` #DFEFF8 (fonds informatifs). Toute nouvelle
  UI doit reprendre ces couleurs — ne pas inventer de teintes (le
  dialogue Mise en page les applique, voir « État d'avancement »).

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

### À reprendre en priorité à la prochaine session (le plus récent — voir aussi « En cours / cassé » plus bas)
- **Sommaire : le découpage entre pages ne déborde plus, mais retour
  explicite de l'utilisateur en fin de session (2026-10-20) : "il faut que
  l'on améliore ça encore, ce n'est pas très lisible à l'utilisation. pour
  aujourd'hui on arrête".** Pas de précision donnée sur CE QUI est peu
  lisible exactement — à clarifier avec lui en priorité à la prochaine
  session (`AskUserQuestion` plutôt que deviner) avant de coder quoi que ce
  soit. Pistes à explorer SANS présumer laquelle est la bonne :
  - La coupure d'un sommaire entre deux pages, même sans déborder, reste
    peut-être visuellement confuse (une sous-liste qui reprend en haut
    d'une page sans que son titre PARENT soit rappelé/visible — voir le
    "scaffolding" vide de `buildNestedFragment` dans `paintPages.ts`, qui
    préserve l'indentation mais pas le contexte).
  - Le sommaire lui-même (une fois généré) est peut-être juste visuellement
    dense/indigeste à lire (pas d'espacement entre niveaux, pas de style
    différent par niveau de titre, tout en bleu souligné uniforme).
  - Le PANNEAU latéral "Sommaire" (Mettre à jour/Supprimer) est peut-être
    ce qui est jugé peu lisible/pratique, pas le sommaire généré lui-même —
    voir la discussion du 2026-10-19 sur un panneau de CONFIGURATION plus
    riche (niveaux de titre à inclure, etc.), jamais implémentée au-delà
    des deux boutons actuels.
  - Voir aussi la section "Panneau latéral « Sommaire »" plus bas pour
    l'état actuel exact de ce qui existe déjà.

### Entrées plus récentes que ce journal

Depuis le 2026-10-22 le détail vit dans `CLAUDE.md` (sections « Passe de test
fonction par fonction », « Impression et export PDF », « Audit de code ») et
dans `ROADMAP-PAGINA.md` / `ROADMAP-CASUALOFFICE.md`. Ce journal reste
l'historique des sessions précédentes (non réécrit).

### Fait et fonctionnel

- **Sections + Pages de garde (2026-10-22)** — les deux chantiers
  validés en conception avec l'utilisateur :
  - **Sections** (une section = un sous-document : numérotation et
    sommaire propres) : extension `SectionBreak.ts` — marqueur
    `<!-- section: <JSON URI-encodé> -->` (titre + reprise), séparateur
    peint « Section — Titre » avec `id` slug (mêmes ancres que les
    titres, paintPages). Numérotation : `HeadingAutoNumber` remet les
    compteurs à zéro aux sauts avec `restart`. Sommaires :
    `collectTocTargets(doc, pos)` — un sommaire AVANT la première
    section liste les SECTIONS (table des parties), un sommaire DANS
    une section ne liste que SES titres ; les slugs sont calculés sur
    la séQUENCE COMPLÈTE du document (collectAllTargets) pour rester
    alignés avec les ancres peintes même pour un sous-ensemble.
    **PIÈGE CORRIGÉ** : la première regex de parsing exigeait du JSON
    littéral alors que la sérialisation écrit de l'URI-encodé — un
    saut de section sauvegardé ne se RELISAIT PAS (silencieusement
    supprimé au prochain enregistrement) ; le décodeur accepte
    maintenant les deux formes.
  - **Pages de garde — ZONE TRANSPARENTE** (refonte 2026-10-22, demande
    utilisateur : « une page comme les autres, traitée comme une zone code,
    début et fin de zone, transparente ») : extension `CoverZone.ts` — deux
    marqueurs atomes `coverZoneStart`/`coverZoneEnd` encadrant du CONTENU
    NORMAL (`<!-- coverzone-start -->` / `<!-- coverzone-end -->` dans le
    .md, commentaire HTML invisible ailleurs). TOUT l'éditeur fonctionne
    dans la zone (ruban, tableaux, curseur — plus de mini-éditeur ni de
    nœud spécial). Le marqueur de début porte `headerFooter` (false =
    en-tête/pied MASQUÉS sur les pages couvertes — géré dans
    `paintPages.ts` via un Set de pages calculé pendant la répartition ;
    sérialisé `<!-- coverzone-start header -->`). Panneau contextuel
    (CoverPagePanel, front montant sur `stats.coverZone` comme le panneau
    Tableau) : case en-tête/pied, champs insérables, « Enregistrer comme
    type » (extrait le Markdown de la zone via
    `extractCoverZoneMarkdown`), suppression.
  - **Champs de document `{{variable}}`** : extension `DocField.ts` —
    nœud INLINE atomique (`{{name}}` dans le .md), valeur RÉSOLUE par
    NodeView au rendu (même contexte que les en-têtes/pieds —
    `setDocFieldContext`/`refreshAllDocFields`), utilisable PARTOUT.
    **PIÈGE** : les variables vivent DANS des blocs HTML (`<p style=…>`)
    que markdown-it ne tokenise PAS — le hook `updateDOM` de
    tiptap-markdown transforme le DOM rendu (le span garde le texte
    `{{name}}` pour que les gabarits d'en-tête/pied, qui passent par le
    MÊME parseur puis par `resolveHeaderFooterText`, continuent de
    substituer). **PIÈGE** : `ParagraphMarkdown` sérialise les
    paragraphes stylés (centrage…) en HTML brut — les spans docField y
    sont remplacés par `{{name}}` avant écriture, sinon les variables
    des pages de garde étaient PERDUES au premier enregistrement.
  - **Migration** : `migrateCoverMarkdown` (CoverZone.ts) convertit à
    l'ouverture l'ancien bloc atomique `coverPage` (`<!-- coverpage … -->`
    multi-lignes ou URI-encodé) en zone + contenu normal ; l'extension
    `CoverPage.ts` reste enregistrée comme repli de lecture.
  - Galerie (`ui/Cover/CoverGalleryDialog.tsx`) : 5 modèles intégrés
    charte MBEF (Classique/Moderne/Technique/Minimal/Chantier), aperçu
    papier, saut de page optionnel après ; les types utilisateur
    (localStorage `pagina.coverTemplates`) ; export/import JSON par
    dialogues natifs (fileService). PAS D'IMAGES pour l'instant
    (décision utilisateur — avec le format .xmd).
  - Vérifié dans l'app (fichier de test dédié zz-test-sections.md,
    créé puis supprimé) : numérotation 1,2 puis REPRISE 1,2 après le
    saut de section ; sommaire global = [Partie B] ; sommaire de
    section = [1. Titre trois, 2. Titre quatre] ; séparateur peint avec
    titre et ancre ; galerie → insertion → page peinte avec variables
    résolues → clic → panneau → modèle enregistré dans localStorage.
    tsc, 38 tests, build verts.

- **Diagrammes Mermaid : exemples métier BTP + couleurs configurables
  (2026-10-22)** — deux évolutions de l'éditeur de diagrammes :
  - **Les 7 onglets de modèles remplacés par des scripts métier BTP**
    (tels quels, demandés par l'utilisateur) : organigramme de visa
    (dossier d'études → DCE → DIUO/DOE), séquence MOA/BE/MOE/entreprise,
    planning Gantt « Lot 2 CVC », camembert de chiffrage, classes
    Dossier/Plan/Réserves, états de visa, relations AFFAIRE/DOSSIER/PLAN.
  - **Nouveau module `src/core/diagramTheme.ts`** — la persistance est
    isolée derrière `getDiagramTheme`/`setDiagramTheme` + hook
    `useDiagramTheme` (useSyncExternalStore) + `buildMermaidConfig()` :
    la phase .xmd pourra déplacer ces réglages dans les métadonnées du
    conteneur en ne réécrivant QUE ce fichier. localStorage
    `pagina.diagramTheme`, RÈGLE ABSOLUE : les couleurs ne JAMAIS dans
    la source `.md` — uniquement au rendu (mermaid.initialize,
    themeVariables), pour TOUS les diagrammes.
  - **Panneau Diagramme** : rangée « Thème ▾ » (Pagina — socle neutral
    teinté charte MBEF, palette camembert en tons moyen-foncés pour le
    texte blanc —, Clair, Sombre, Forêt, Neutre) + « Personnaliser… »
    (3 nuanciers Principale/Secondaire/Accent + Réinitialiser). Mapping
    des couleurs perso par TYPE (mainBkg/actorBkg/taskBkgColor/pie1-12/
    gradientStop…) car chaque type lit des variables différentes ; le
    TEXTE est choisi par luminance (blanc/charbon) comme Word.
  - **MermaidDiagram.ts** : registre des NodeViews vivantes +
    `refreshAllMermaidDiagrams()` (au changement de thème, la page doit
    RE-RENDRE ses SVG — le repaint ne fait que CLONER l'existant) +
    rappel débouncé `setMermaidRenderedCallback` branché sur
    `repaintRef` par MarkdownEditor : le re-rendu mermaid est
    ASYNCHRONE, la couche peinte ne peut être rafraîchie qu'APRÈS.
  - Vérifié : 70/70 rendus (7 types × 5 thèmes + 7×5 avec couleurs
    perso) dans un Edge headless isolé contre le même serveur Vite (une
    page de test dans public/, supprimée ensuite ; PIÈGE : les pages
    publiques statiques ne résolvent PAS les imports nus — charger
    `/node_modules/.vite/deps/mermaid.js` ; et Edge headless ouvre un
    dialogue de profil → naviguer par CDP après le lancement) ;
    couleurs perso présentes dans le SVG brut sur les 35 combinaisons
    (les couleurs de flowchart/gantt/séquence vivent dans le <style> CSS
    du SVG, PAS dans des attributs fill — ne pas "prouver" en lisant
    les attributs) ; dans l'app réelle : page peinte suit le thème et
    les couleurs en direct, persistance vérifiée à travers un reload
    (thème forêt conservé puis remis par défaut).
  - **INCIDENT de test (à retenir)** : l'utilisateur travaillait EN
    MÊME TEMPS que les tests ; sa sauvegarde de 08:08 a capturé mon
    diagramme de test dans son document démo. Nettoyage chirurgical :
    retrait du bloc ```mermaid en tête via la vue Code + enregistrement
    — TOUJOURS vérifier le dirty AVANT de manipuler, et stasher le
    contenu réel si un reload est inévitable pendant que l'utilisateur
    est susceptible de travailler.

- **Fenêtres « Paramétrage » (roadmap 1.4) et « Utilisateur » V1
  (roadmap 1.5), 2026-10-22** — les préférences GLOBALES de l'app et le
  profil local, toutes deux indépendantes des documents (contrairement
  à la mise en page `pagina:config`) :
  - Nouveau store `src/core/store/settingsStore.ts` (Zustand +
    localStorage `pagina.settings` / `pagina.user`, même try/catch
    silencieux que `pagina.defaultPageLayout`) :
    `useSettingsStore` (showRulers, autoSave, autoSaveIntervalSec —
    intervalles proposés 30 s/1 min/2 min/5 min) et `useUserStore`
    (prénom + nom, V2 connexion MBEF/Ingenerix explicitement HORS
    périmètre de ce store) + `userInitials()` (initiales de l'avatar,
    « ? » si vide).
  - `src/ui/Settings/SettingsDialog.tsx` (préfixe `st-`) : sections
    Affichage (règles — roadmap 1.2 débloquée par la même occasion),
    Interface (langue/thème VERROUILLÉS « à venir » — français et clair
    sont les seules valeurs existantes, les débloquer viendra avec le
    thème sombre et l'i18n sans changer la fenêtre), Édition
    (correction auto verrouillée = roadmap 4.3), Sauvegarde
    (auto-sauvegarde + intervalle). Brouillon local, application au
    OK. Ouverte par le NOUVEAU bouton ⚙ de la barre de titre.
  - `src/ui/User/UserDialog.tsx` (préfixe `usr-`) : prénom + nom.
    Ouverte par clic sur l'AVATAR de la barre de titre — qui n'est plus
    le placeholder figé « KM » mais un bouton vivant : initiales
    calculées, « ? » si non renseigné (l'utilisateur renseigne son nom
    lui-même, ne pas préremplir au nom de l'utilisateur).
  - Auto-sauvegarde : effet d'interval dans App.tsx — enregistre
    l'onglet actif SEULEMENT s'il est `dirty` (refs sur
    activeTab/handleSave pour un timer stable, reprogrammé uniquement
    si les réglages changent). NON testée en direct (elle écrirait du
    contenu de test sur un document réel) — logique simple à relire si
    un bug remonte.
  - `MarkdownEditor` : nouvelle prop `showRulers` (défaut vrai) — les
    deux règles disparaissent COMPLÈTEMENT du layout (rendu
    conditionnel, pas juste cachées) ; recomputeVRuler est déjà
    gardé (`return` si `.xmd-ruler-v` absente).
  - Vérifié par CDP dans l'app réelle : ⚙ ouvre la fenêtre (4 sections),
    décocher « Afficher les règles » + OK retire les deux règles du
    DOM en direct et recocher les ramène ; avatar → fenêtre Utilisateur,
    saisie « Test/Uuid » → initiales « TU », effacement → « ? » et
    localStorage propre ; `pagina.settings` persisté ; tsc, 38 tests,
    build verts. Piège de méthode : après le rechargement HMR le
    sélecteur `.tbar-avatar` est un BOUTON désormais — les vieux
    scripts de test qui le cherchaient comme <span> ne le trouvent plus.

- **Grosse journée « comme Word » (2026-10-21, 13 commits sur main)** —
  sur la roadmap ROADMAP-PAGINA.md établie la veille à la demande de
  l'utilisateur (« il faut que l'on ait bout de ce projet ») :
  - **Panneau Équation complété puis allégé** : palette de symboles
    (point ② de la maquette `docs/maquettes/panneau-equation.html`) +
    édition directe sur la page (point ①) — puis, sur retour explicite
    de l'utilisateur (« trop grossier »), le clavier virtuel MathLive
    du bas a été SUPPRIMÉ : `EquationPanel.tsx` ne garde que le champ
    WYSIWYG + la palette de symboles (`eq-palette`, ouverte par défaut,
    bouton ⌨ de l'en-tête partagé pour la replier).
  - **Tabulation ± (roadmap 2.1)** : boutons du groupe Paragraphe du
    ruban, pas de 1,25 cm (0,5" comme Word), extension custom
    `ParagraphMarkdown.ts` (repli HTML sur le `<p>`).
  - **Interligne + espacements (roadmap 2.2, deux temps)** : d'abord au
    ruban (groupe Paragraphe) et PAR NIVEAU DE TITRE dans le panneau
    Styles de titres ; PUIS sur demande « reprends le fonctionnement de
    Word, plus la fenêtre retrait et espacement » : menu Interligne
    déroulant façon Word (1,0/1,15/1,5/2,0/2,5/3,0 avec coche,
    « Options d'interligne… », « Ajouter de l'espace avant » (+6 pt),
    « Supprimer l'espace après ») et NOUVELLE fenêtre
    `src/ui/Paragraph/ParagraphDialog.tsx` (« Retrait et espacement » :
    alignement, retraits gauche/droite cm, espacement avant/après pt,
    interligne Multiple, aperçu live 3 mini-paragraphes, « Définir par
    défaut », OK/Annuler). Le lanceur du groupe Paragraphe du ruban
    ouvre cette fenêtre (plus Mise en page).
  - **Modèle de retrait en CENTIMÈTRES** (`ParagraphMarkdown.ts`) :
    attributs `indentCm`/`indentRightCm`, migration transparente des
    anciens fichiers, borne 12,5 cm, nouvelle commande
    `setParagraphIndent(leftCm, rightCm)` ; handles
    `getActiveParagraphFormat()` (alignement + retraits du paragraphe
    sous le curseur) et `setParagraphIndent` dans MarkdownEditor.tsx.
    **NOUVEAU retrait DROITE** (n'existait pas avant cette journée).
  - **BUG important corrigé (piège de closure)** : régler l'interligne
    PUIS l'espacement écrasait l'interligne — les actions du ruban
    capturaient `activeTab.layout` (une CAPTURE) dans une closure
    React, périmée au moment du clic. Nouvelle méthode
    `tabsStore.patchLayout(path, patch)` qui lit TOUJOURS le layout
    courant du store : à privilégier pour TOUT réglage unitaire de
    mise en page, ne jamais passer un layout capturé.
  - **Mémorisation couleur (roadmap 2.3)** : les boutons Couleur du
    texte / Surlignage retiennent la dernière couleur — re-cliquer
    sur le bouton seul (sans ouvrir le nuancier) applique, comme Word.
  - **Règles glissantes (roadmap 1.1 terminée)** :
    `pagination/Ruler.tsx` — triangles de marge tirables à la souris,
    document mis à jour EN DIRECT (mêmes bornes que le dialogue Mise
    en page), graduation mm, zones de marge grisées. Horizontale
    sticky en haut, verticale sticky à gauche calée sur les pages via
    variables CSS `--xmd-ruler-v-offset`/`--xmd-ruler-v-stride`
    (période = hauteur de page + espace entre pages, motif répété).
  - **Rechercher/Remplacer (roadmap 2.4, trois itérations)** :
    `src/ui/FindReplace/FindReplacePanel.tsx` — panneau latéral ouvert
    par Ctrl+F ; champ de la BARRE DE TITRE fonctionnel (porte sa
    requête dans le panneau en direct, seed) ; champ du panneau en
    pleine largeur ; liste des résultats avec contexte cliquable ;
    « Remplacer par… » + Remplacer / Tout remplacer ; options
    Respecter la casse / Mots entiers. Iterations sur retour
    utilisateur : « champ trop petit » puis « plus comme Word, on
    garde le remplacer » puis suppression de l'onglet « Titres »
    (retour utilisateur) — le panneau reste un volet de navigation.
  - **Fenêtre Propriétés du document (roadmap 1.3)** :
    `src/ui/PageSetup/DocumentPropertiesDialog.tsx`, bouton
    « Propriétés » du ruban Accueil (grosse icône à côté de Mise en
    page) — titre, sujet, auteur, mots-clés, commentaires, dates,
    + CHAMPS PERSONNALISÉS libres. Stockage dans `pagina:config`.
  - **Variables d'en-tête/pied enrichies (roadmap 1.6)** :
    `resolveHeaderFooterText` reconnaît désormais `{{title}}`,
    `{{subject}}`, `{{keywords}}`, `{{created}}`, `{{modified}}` ET
    chaque champ personnalisé par son propre nom (`{{Chantier}}`…) —
    alimentés par la fenêtre Propriétés.
  - **Panneau Diagramme (Mermaid dédié)** :
    `src/ui/Mermaid/DiagramPanel.tsx` — édition de la source Mermaid
    dans un panneau latéral avec rendu live, ouvert au clic sur un
    diagramme peint / à l'insertion (front montant de `stats.mermaid`,
    même cycle que le panneau Équation).
  - **INCIDENT disque (2026-10-21 soir) — retour arrière accidentel de
    l'arborescence + récupération intégrale** : vers 19h12, des
    fichiers du disque ont été remplacés par un état ancien (fichiers
    récents supprimés : Ruler, FindReplace, Mermaid, PanelHeader,
    ROADMAPs… ; d'autres écrasés par des versions plus vieilles) —
    cause inconnue (pas git : HEAD était intact). Le travail non
    committé (fenêtre Paragraphe) n'existait plus nulle part sur le
    disque. RÉCUPÉRÉ À L'IDENTIQUE grâce au serveur Vite encore en
    mémoire dans le navigateur : les modules transformés gardent leur
    SOURcemap AVEC `sourcesContent` → `Debugger.getScriptSource` par
    CDP, base64 décodé, sources TSX originales restaurées au texte
    près (y compris les .css via la chaîne `__vite__css`). Pièges
    rencontrés : playwright-core plantait en attach sur une cible
    `shared_worker` (contourner par CDP brut via WebSocket natif de
    Node) ; un module .css re-servi par HMR ÉCRASE la version
    précédente dans le debugger — filtrer par horodatage `?t=` et
    garder la PLUS ANCIENNE (= la bonne) ; vérifier la propreté des
    onglets (pas de « • ») AVANT tout reload. Leçons : COMMITTER
    souvent (le travail perdu n'était pas dans git), et si un
    incident de ce type survient, NE PAS fermer l'app : les sources
    survivent dans le module graph du serveur de dev.

- **Panneau « Styles de titres » REFAIT (2026-10-17, remontée : « il y a
  des problèmes, à revoir » + « plus propre, plus net comme Word : le
  formatage exact du titre, il manque la numérotation »)** :
  - Le fichier était CORROMPU : la liste Normal+Titre 1-6 apparaissait
    DEUX FOIS et le bouton « Régler les styles… » traînait encore en bas
    (restes de patchs antérieurs) — réécriture propre de
    HeadingStylesPanel.tsx.
  - Façon Word : chaque entrée rendue avec le FORMATAGE EXACT du style
    (police, taille, couleur, gras/italique du document) ET le préfixe
    de NUMÉROTATION que porterait le titre — calculé avec les mêmes
    règles que HeadingAutoNumber.ts (formatCounter + concaténation des
    niveaux parents numérotés, compteurs à 1) : « 1. Titre 1 », « 1.1.
    Titre 2 »… Vide si le niveau n'est pas numéroté (défaut = none,
    cohérent avec le document).
  - Vérifié par CDP : 7 entrées uniques, styles exacts (taille/couleur/
    gras réels), engrenage en haut, rien en bas. tsc, build, 38 tests
    verts.

- **En-têtes de panneaux HARMONISÉS : commandes en icônes (2026-10-17,
  point ③ de la maquette validée docs/maquettes/panneau-equation.html)** :
  - Nouveau composant PARTAGÉ ContextualPanels/PanelHeader.tsx (+ classes
    ctx-ph dans ContextualPanelHost.css) : filet vertical sapin devant le
    titre, puce de type éventuelle, COMMANDES DU PANNEAU EN ICÔNES à
    droite (26px, tooltip obligatoire, survol gris, danger = survol rouge,
    actif = fond prairie), ✕ en dernier.
  - Application aux 5 panneaux latéraux : **Tableau** (corbeille =
    supprimer le tableau, bouton du bas retiré), **Équation** (puce En
    bloc/En ligne + ⌨ palette de symboles DÉSACTIVÉE — arrive avec le
    point ② — + corbeille supprimer la formule, footer retiré),
    **Sommaire** (⟳ mettre à jour + corbeille supprimer, gros boutons du
    bas retirés), **Styles de titres** (engrenage = régler les styles,
    bouton bas retiré), **En-tête/Pied** (titre seul + ✕).
  - Nouvelles icônes dans icons.tsx : IconTrash, IconGear, IconKeyboard.
    CSS d'en-têtes morts retiré des 5 feuilles de style.
  - Vérifié par CDP : les 3 panneaux testés (Tableau/Équation/En-tête)
    portent l'en-tête partagé, boutons en icônes fonctionnels, anciens
    boutons du bas disparus. tsc, build, 38 tests verts.

- **Mini-barre flottante de mise en forme à la sélection (2026-10-20)**,
  demandée d'après CasualOffice. `src/ui/Editor/SelectionBar.tsx/.css` : G I S
  S̶ x² x₂, lien, couleur du texte (`ColorPicker`), surlignage ; état actif
  lu sur l'éditeur. Positionnée par l'effet `selBarSync` de
  `MarkdownEditor.tsx` (rectangles de `computeSelectionRects` → coordonnées
  écran, au-dessus de la première ligne visible, en dessous si elle sortirait
  de la zone ; recalée au repaint/défilement/resize via `selBarSyncRef`).
  Masquée pendant le glisser de souris (affichée au relâchement), sans
  sélection, en sélection de cellules, bloc de code/Mermaid, lecture seule,
  édition d'en-tête/pied. Boutons : `mousedown preventDefault` (piège du
  focus). Vérifié CDP : apparition au double-clic, Gras (actif/inactif),
  surlignage, couleur rouge appliquée, masquage au clic ailleurs/flèche/
  glisser. Non testé : bouton Lien (prompt), sélection multi-pages.
- **Bouton « Caractères spéciaux » (2026-10-20)**, onglet Insertion, demandé
  « comme Emoji ». Nouveau groupe **« Symboles »** (Emoji + Caractères
  spéciaux, 2 lignes) à côté d'Éléments (qui garde Séparateur + Bloc de code).
  `EmojiPicker` (`Toolbar.tsx`) est généralisé (libellé/icône/catégories en
  props) ; `SPECIAL_CHAR_CATEGORIES` : unités et technique (°, ², µ, Ω, ±, ⌀,
  ㎥…), maths, lettres grecques, flèches, ponctuation, monnaies/fractions/
  exposants, lettres accentuées, formes. Insère un caractère Unicode réel via
  `insertEmoji` (mêmes actions, rien à câbler dans App/PaginaLight).
  Caractères à sens Markdown/HTML volontairement exclus (l'insertion passe
  par le parseur Markdown). Popup recalée aussi à gauche. Vérifié CDP :
  240 cases, insertion « ° » et « ² », emoji toujours OK.
- **Menu contextuel clic-droit sur tout le texte (2026-10-20)**, demandé
  d'après le menu de CasualOffice (`TextContextMenu.tsx`) — SANS « Traduire »
  ni « Commenter » (commentaires prévus plus tard avec le format .xmd).
  `TableContextMenu` (`MarkdownEditor.tsx`) devient le menu général : Couper,
  Copier, Coller, Coller en texte brut, Supprimer, Tout sélectionner
  (désactivés selon sélection/lecture seule, raccourcis affichés) + les
  actions de tableau SEULEMENT si le clic est dans un tableau. Opérations
  presse-papiers factorisées (`copyEditorSelection`/`cutEditorSelection`/
  `pasteIntoEditor`) et partagées avec les boutons du ruban. Le clic droit ne
  modifie plus la sélection au `mousedown` (garde `e.button !== 0`) : une
  sélection existante est conservée si le clic tombe dedans. Menu recalé dans
  la fenêtre. Vérifié CDP : états du menu, Copier+Coller (+1 occurrence),
  Tout sélectionner, menu tableau. Non fait : la mini-barre flottante de mise
  en forme à la sélection (autre capture CasualOffice), « Coller en texte
  brut » non testé en clic réel.
- **Correctif : sélection/curseur dessinés décalés après redimensionnement de
  la fenêtre ou d'un panneau (2026-10-20)**, capturé par l'utilisateur
  (sélection de cellules décalée d'~100px vers la gauche après avoir agrandi
  la fenêtre). Le curseur et les rectangles de sélection sont en coordonnées
  de `.xmd-canvas-frame`, mais seul l'éditeur invisible était observé par un
  `ResizeObserver` : quand le cadre change de largeur, la page (centrée) bouge
  sans recalcul. Fix : second `ResizeObserver` sur le cadre →
  `repaintCaretRef` (`MarkdownEditor.tsx`, effet de repaint). Vérifié CDP :
  écart 0 px après masquage/affichage de l'explorateur (le bug n'a pas été
  reproduit AVANT le fix, déduit des captures).
- **Panneau latéral « Styles de titres » (2026-10-20)**, demandé par
  l'utilisateur (« on ne voit que 3 niveaux sur 6, on n'est pas sûr du niveau
  sous le curseur »). `src/ui/HeadingStyles/HeadingStylesPanel.tsx` : le
  chevron de la galerie de styles du ruban ouvre/ferme (à la main, pas
  automatiquement) un onglet « Styles » de `ContextualPanelHost` à la place
  de l'ancien menu déroulant (conservé seulement si `onToggleHeadingPanel`
  est absent, ex. PaginaLight). Liste Normal + Titre 1-6 rendus avec leur
  VRAIE mise en forme (`layout.headingStyles`), niveau actif surligné +
  ligne « Style actuel », clic = `toggleHeading`/`setParagraph`, bouton
  « Régler les styles… » = dialogue existant. `onMouseDown preventDefault`
  sur les items (piège du focus). Vérifié CDP : ouverture, niveau actif,
  clic Titre 4 → `<h4>`, annulation propre. Non fait : réglage des styles
  directement dans le panneau.
- **Correctif : pagination dépendante du zoom (2026-10-20)**, remonté par
  l'utilisateur avec captures ("lors d'un zoom on perd la zone de texte").
  Mesuré par CDP : 15 pages à 100 %, 12 à 200 %, et des blocs qui débordent
  de leur page selon le zoom. **Cause** : l'alignement de la largeur de
  l'éditeur invisible sur `.xmd-page-content` (`MarkdownEditor.tsx`, bloc
  `liveHost.style.width`) lisait `getBoundingClientRect().width` d'un
  élément DANS `.xmd-page-canvas` (donc multiplié par `scale(zoom)`) mais
  retranchait un padding en px logiques → zone invisible `zoom`× trop large,
  autre retour à la ligne, mauvaise pagination. **Fix** : division par
  `zoomRef.current`. Vérifié : 15 pages à tous les zooms (25 %-400 %).
  **Tableau plus haut qu'une page (2026-10-20, même jour)** : débordait de sa
  page (recouvrait le pied de page). `planTableSplit`/`buildTableFragment`
  (`paintPages.ts`) répartissent désormais un tel tableau LIGNE PAR LIGNE
  (jamais au milieu d'un rowspan) ; un tableau qui tient sur une page reste
  un bloc atomique comme avant. Fragment : colonnes figées (`table-layout:
  fixed`), chaque `<tr>` porte son `SRC_POS_ATTR` ; `caretPosition.ts` et
  `selectionHighlight.ts` gèrent ce cas. Vérifié CDP : 0 débordement à tous
  les zooms, clic + frappe + curseur OK dans un fragment. Limites : pas de
  ligne d'en-tête répétée sur chaque page, pas de poignées de
  redimensionnement colonne/ligne sur un tableau coupé.
- **Correctif du débordement de sommaire à imbrication PROFONDE (2026-10-20,
  même jour)**, remonté par l'utilisateur avec capture d'écran : "le
  sommaire se génère à peu près correctement [...] mais quand il déborde de
  la page la suite se retrouve en fin de document et pas sur la page
  suivante [...] est-ce que le bloc Sommaire n'est pas généré comme du
  texte ?". Le correctif du 2026-10-19/20 ("Débordement de page d'un
  sommaire généré", voir plus bas) ne découpait qu'ENTRE deux items de
  PREMIER niveau d'une liste — insuffisant dans ce cas précis : le document
  n'a qu'UN SEUL vrai titre de niveau 1, donc la liste de premier niveau
  générée n'a elle-même qu'UN SEUL item (rien à découper "entre"), et TOUT
  le reste (niveaux 2, 3…) est imbriqué À L'INTÉRIEUR de cet unique item —
  exactement la "limite acceptée" documentée hier, qui s'est révélée être le
  cas RÉEL le plus courant plutôt qu'un cas pathologique marginal.
  - **Fix, bien plus général** : le découpage opère désormais sur une
    séquence APLATIE de TOUTES les entrées du sommaire, à N'IMPORTE QUEL
    niveau d'imbrication (`flattenListEntries`, nouvelle fonction
    récursive dans `paintPages.ts`, remplace `collectListItemUnits`) —
    chaque entrée ne porte que SA PROPRE ligne (son paragraphe/titre
    propre, jamais sa sous-liste), ce qui permet de couper entre N'IMPORTE
    QUELLES deux entrées consécutives, à la même profondeur ou non.
  - **Reconstruction de la structure imbriquée par page**
    (`buildNestedFragment`, nouvelle fonction) : à partir des entrées
    aplaties qui reviennent à UNE page, reconstruit une hiérarchie
    `<ul>`/`<ol>` imbriquée correcte — y compris quand la coupure tombe en
    PLEIN MILIEU d'une sous-liste (le fragment de la page suivante
    commence alors directement à une profondeur > 0, sans item "parent"
    visible sur cette page : des conteneurs `<ul>` "scaffold" vides sont
    recréés pour préserver le bon niveau d'INDENTATION visuelle, clonés
    depuis la liste d'origine correspondante pour garder la même classe/
    attributs).
  - **`caretPosition.ts`/`selectionHighlight.ts` généralisés en
    conséquence** : hier, ces deux fichiers supposaient que le "granule"
    peint portant `SRC_POS_ATTR` était toujours exactement à la profondeur
    2 (l'item direct d'une liste de premier niveau, pas plus profond) —
    plus vrai avec une imbrication à PLUSIEURS niveaux. `caretPosition.ts`
    cherche désormais le `listItem`/`taskItem` ANCÊTRE LE PLUS PROFOND
    (pas une profondeur fixe) ; `selectionHighlight.ts` descend
    RÉCURSIVEMENT dans les sous-listes (pas une seule fois).
  - **Vérifié par Playwright/CDP** sur un fichier fixture jetable (un seul
    titre de niveau 1 + 60 titres de niveau 2, tous imbriqués dessous —
    61 entrées au total, créé/supprimé pour l'occasion) : le sommaire
    généré se répartit sur DEUX pages (11 entrées puis 50), AUCUNE des deux
    ne débordant de sa page (marge de plusieurs centaines de pixels dans
    les deux cas) ; l'indentation de la deuxième page est bien le DOUBLE de
    la première (80px vs 40px) — confirmant que la continuation reprend
    correctement au bon niveau d'imbrication malgré la coupure en plein
    milieu de la liste. `npx tsc --noEmit` propre, `npm test` 38/38 verts.
  - **Piège méthodologique rencontré pendant cette vérification** :
    rouvrir un fichier déjà ouvert via double-clic dans l'Explorateur ne
    relit PAS son contenu depuis le disque si l'onglet est déjà ouvert
    (focus simplement l'onglet existant, contenu en mémoire inchangé) —
    un premier essai avec un fichier RÉÉCRIT sur disque (15 → 60 titres)
    a donc testé l'ANCIEN contenu en mémoire sans que rien ne le signale.
    **À RETENIR** : pour forcer une vraie relecture depuis le disque
    pendant un test, soit fermer l'onglet avant de rouvrir, soit (plus
    simple si l'onglet refuse de se fermer à cause d'un état "modifié"
    laissé par un test précédent) utiliser un NOM DE FICHIER différent à
    chaque itération plutôt que de réécrire le même fichier sur place.
- **Correctifs du panneau « Sommaire » (2026-10-20, même jour, remontés par
  l'utilisateur avec capture d'écran)** : "il faut modifier les boutons
  (changer le nom et supprimer Mettre à jour), de plus le marqueur de
  sommaire n'ouvre pas le panneau".
  - **Ruban** : le groupe « Sommaire » (onglet Insertion) n'a plus qu'un
    SEUL bouton — l'ancien « Marqueur » renommé **« Sommaire »** (confirmé
    avec l'utilisateur), l'ancien bouton « Mettre à jour » (qui appelait
    `generateToc` sans tenir compte d'un sommaire déjà en place) est
    SUPPRIMÉ : le panneau latéral couvre désormais ce rôle.
  - **Cliquer sur le marqueur `<!-- toc -->` peint génère directement le
    sommaire** (nouveau cas dans le routeur de clics de
    `MarkdownEditor.tsx`, même famille que le clic sur en-tête/pied de
    page ou une ancre de sommaire) — jusqu'ici rien ne se passait au clic
    dessus, SEUL le bouton ruban supprimé pouvait générer.
  - **`generateToc` repositionne désormais le curseur DANS le sommaire
    généré** (même technique que le correctif `updateTocAtCursor` de la
    veille — `positions[0]` reste valide sans `tr.mapping`, puisque les
    remplacements plus tardifs dans la boucle ne touchent jamais les
    positions qui les précèdent) : sans ça, `insideToc` restait `false`
    après un clic sur le marqueur et le panneau ne s'ouvrait jamais —
    exactement le "n'ouvre pas le panneau" remonté.
  - Vérifié par Playwright/CDP sur un fichier fixture jetable (créé/
    supprimé pour l'occasion) avec un VRAI `<!-- toc -->` dans la source :
    groupe ruban réduit à un seul bouton "Sommaire", clic sur le marqueur
    peint → 3 liens générés + panneau ouvert immédiatement. `npx tsc
    --noEmit` propre, `npm test` 38/38 verts.
- **Panneau latéral « Sommaire » (2026-10-20)**, sur demande explicite de
  l'utilisateur : "il faut que l'on rajoute le panneau pour édité un
  sommaire, il est déjà compliqué de cliquer dans un sommaire et impossible
  à supprimer". Même principe que les panneaux Tableau/En-tête-pied : un
  panneau contextuel (`src/ui/Toc/TocPanel.tsx`) qui s'ouvre automatiquement
  quand le curseur entre dans un sommaire déjà généré, avec deux actions —
  **Mettre à jour** (régénère en place avec les titres actuels) et
  **Supprimer le sommaire** (efface la liste entière).
  - **Détection SANS marqueur ni attribut persisté** (`isTocList` dans
    `TocMarker.ts`) : un sommaire généré n'a plus de `<!-- toc -->` à
    proximité une fois créé (remplacé par la vraie liste) — pour le
    retrouver après coup (y compris après fermeture/réouverture du
    fichier, où un éventuel attribut personnalisé ne survivrait pas à
    l'aller-retour Markdown), la liste est reconnue par sa FORME : chaque
    item commence par un paragraphe réduit à un seul lien `#slug`
    (exactement ce que `buildTocContent` génère). `EditorStats.insideToc`
    pilote l'ouverture automatique du panneau, même mécanisme de "front
    montant" que `insideTable`.
  - **Deux nouvelles commandes** `updateTocAtCursor`/`deleteTocAtCursor`
    (`TocMarker.ts`) : retrouvent la liste de sommaire englobant le
    curseur via `findTocListAt`, puis remplacent/suppriment son étendue
    `[pos, pos+nodeSize)`.
  - **Bug trouvé et corrigé pendant la vérification, pas anecdotique** :
    `findTocListAt` s'arrêtait au PREMIER ancêtre de type liste satisfaisant
    `isTocList` en remontant depuis le curseur — or un sommaire généré est
    IMBRIQUÉ (chaque titre de niveau N contient une sous-liste de ses
    titres de niveau N+1, qui satisfait ELLE AUSSI `isTocList`) : cliquer
    sur l'entrée de PREMIER niveau (ex. un sommaire à 1 titre racine + 3
    sous-titres) retrouvait la SOUS-liste imbriquée (3 items) plutôt que le
    sommaire ENTIER (4 items) — confirmé par un test ciblé (sélection
    exacte retournée : `childCount: 3` au lieu de l'attendu `childCount: 1`
    pour la liste racine) : "Supprimer" ne retirait alors que les
    sous-titres, laissant le titre racine orphelin (un item de sommaire
    tout seul, sans ses enfants) — exactement le "impossible à supprimer"
    remonté par l'utilisateur. **Fix** : `findTocListAt` ne s'arrête plus
    au premier match, il continue de remonter tous les ancêtres et garde
    le PLUS ENGLOBANT — cible désormais toujours le sommaire dans son
    ensemble, quel que soit le niveau de titre cliqué pour y entrer.
  - **Second correctif, découvert au même endroit** : juste après
    `updateTocAtCursor`, ProseMirror replace la sélection à la position
    valide la plus proche après un `replaceWith` qui couvre l'ancienne
    position du curseur — souvent JUSTE APRÈS le nouveau sommaire plutôt
    que dedans, ce qui faisait retomber `insideToc` à `false` et refermait
    le panneau immédiatement après avoir cliqué "Mettre à jour" (constaté
    en test : le panneau disparaissait, empêchant d'enchaîner avec
    "Supprimer" depuis la même session). **Fix** : `updateTocAtCursor`
    replace désormais explicitement la sélection À L'INTÉRIEUR du sommaire
    régénéré (`TextSelection.near(tr.doc.resolve(found.pos + 1))`).
  - **Piège méthodologique rencontré PENDANT cette vérification, à
    RETENIR** : le fichier `Démonstration des fonctionnalités Pagina.md`
    (créé par moi plus tôt comme démo, pas un document de l'utilisateur)
    portait des sommaires et titres de test RÉSIDUELS d'une session
    antérieure jamais nettoyés — tester dessus donnait des comptages de
    liens incohérents d'un run à l'autre (contamination croisée entre
    essais), rendant le diagnostic illisible pendant un bon moment avant
    que je ne m'en rende compte. **Basculé sur un fichier fixture CRÉÉ
    EXPRÈS pour ce test** (4 titres connus, jetable, supprimé après coup)
    — a immédiatement rendu le bug net et reproductible. À refaire
    systématiquement pour tout futur diagnostic nécessitant un comptage
    précis : ne jamais réutiliser un fichier de démo/test qui a déjà
    accumulé plusieurs sessions de manipulations.
  - **Autre piège méthodologique, plus général** : dans cette même session
    de vérification, le bouton "Titre 1" du ruban (StyleGallery) semblait
    ne plus avoir aucun effet après plusieurs manipulations (typer du
    texte, Entrée, flèches, sélection) — mais fonctionnait PARFAITEMENT
    juste après un rechargement complet de page suivi d'un clic DIRECT
    (sans frappe préalable). Non élucidé avec certitude (plusieurs essais
    de correctifs — garde `onMouseDown preventDefault` sur les boutons
    de la galerie de styles, ajoutée par prudence même si elle ne semble
    pas être la cause isolée — n'ont pas permis de reproduire le problème
    à volonté par la suite) ; probablement encore une variante de la
    staleness déjà documentée ailleurs dans ce fichier, cette fois
    sensible à l'ENCHAÎNEMENT precis des manipulations plutôt qu'au seul
    temps écoulé. À surveiller si un comportement similaire revient.
  - `npx tsc --noEmit` propre, `npm test` 38/38 verts. Vérifié de bout en
    bout avec de VRAIS clics/frappes clavier (pas de hook de debug dans la
    version finale) sur un fichier fixture jetable : génération (4 liens),
    ouverture automatique du panneau au clic dans le sommaire, "Mettre à
    jour" (4 liens, pas de doublon, panneau reste ouvert), "Supprimer" (0
    lien, panneau se referme), annulation complète (retour aux 4 titres
    d'origine, onglet non modifié).
- **Débordement de page d'un sommaire généré (2026-10-19/20)**, remonté par
  l'utilisateur ("dans un sommaire il déborde de la pages tu peut
  vérifier?"). Confirmé par mesure directe (`getBoundingClientRect()`) : un
  sommaire généré trop long débordait le bas de sa page de plus de 1600px,
  sans jamais être réparti sur la page suivante. **Cause** : la pagination
  (`paintPages.ts`) ne découpe le document qu'entre BLOCS DE PREMIER NIVEAU
  — un sommaire généré est un SEUL bloc (`bulletList`) ; s'il est plus haut
  que l'espace restant sur la page, il ne peut pas être coupé en deux et
  déborde purement et simplement (même limite qu'un très long tableau ou
  un très long paragraphe — pas spécifique au sommaire).
  - **Fix, accepté comme solution PARTIELLE mais suffisante en pratique** :
    une liste (`bulletList`/`orderedList`/`taskList`, nouvelle constante
    partagée `LIST_NODE_NAMES` dans `paintPages.ts`) est désormais paginée
    **item par item** (nouvelle fonction `collectListItemUnits` +
    restructuration de la boucle principale de `paintPages`), pas comme un
    bloc unique — elle peut donc se couper ENTRE deux de ses items de
    premier niveau pour passer à la page suivante, comme n'importe quel
    autre contenu. **Limite acceptée, documentée en commentaire** : la
    coupure se fait seulement ENTRE deux items de PREMIER niveau d'une
    liste, jamais À L'INTÉRIEUR d'un item ni de sa sous-liste imbriquée —
    un item (avec tout son sous-arbre, ex. un titre H1 avec des dizaines de
    sous-titres nichés) plus haut qu'une page entière déborde quand même,
    comme n'importe quel bloc atomique trop grand. Un découpage récursif
    à l'intérieur même d'un item n'a pas été fait (complexité/risque
    disproportionnés pour un gain marginal — la plupart des sommaires
    réels ont plusieurs titres de premier niveau, pas un seul titre
    géant).
  - **Pièges de compatibilité résolus** : trois autres fichiers du module
    de pagination supposaient "un bloc de premier niveau = un seul clone
    portant `SRC_POS_ATTR`, de la taille du bloc entier" — tous les trois
    corrigés pour reconnaître la nouvelle granularité "item de liste" :
    - `caretPosition.ts` (`computeCaretScreenPosition`) : calculait le
      "bloc contenant la position" via `resolved.before(1)` (toujours
      l'ancêtre de PROFONDEUR 1, donc la liste ENTIÈRE) — désormais, si cet
      ancêtre est une liste (`LIST_NODE_NAMES`), c'est l'ITEM (profondeur 2,
      `resolved.before(2)`) qui est utilisé, puisque c'est LUI qui porte
      `SRC_POS_ATTR` maintenant. Sans ce correctif, le curseur dessiné
      aurait disparu dès qu'il se trouve dans N'IMPORTE QUELLE liste, même
      une liste courte jamais coupée entre deux pages.
    - `selectionHighlight.ts` (`computeSelectionRects`) : la boucle
      générique sur les blocs de premier niveau cherchait le clone par la
      position de la LISTE entière — remplacée par une récursion dans les
      items d'une liste (même principe que `caretPosition.ts`), sinon la
      surbrillance de sélection aurait disparu dans n'importe quelle liste.
    - Le rendu de chaque fragment (`paintPages.ts`) clone un wrapper
      `<ul>`/`<ol>` NEUF (même balise/attributs que l'original — préserve
      puces/numérotation/`data-type="taskList"`) contenant les clones des
      SEULS items qui reviennent à cette page ; **chaque `<li>` cloné porte
      SON PROPRE `SRC_POS_ATTR`** (pas le wrapper) — c'est ce qui permet au
      reste du module de continuer à fonctionner SANS adaptation
      supplémentaire (clic, glisser-sélection) : un item cloné correspond
      toujours à UN SEUL nœud, exactement comme n'importe quel bloc de
      premier niveau avant cette fonctionnalité.
  - **`resolveClickPosition.ts` n'a nécessité AUCUN changement** : il
    retrouve déjà le clone par recherche du plus proche ancêtre portant
    `SRC_POS_ATTR` (`findClonedBlock`), qui tombe désormais naturellement
    sur le `<li>` plutôt que sur la liste — comportement correct sans
    modification.
  - **Vérification PARTIELLE seulement, piège méthodologique important** :
    `npx tsc --noEmit` et `npm test` (38/38) restent propres. La
    vérification VISUELLE en conditions réelles (Playwright/CDP) s'est
    heurtée à une panne plus grave que la staleness HMR déjà documentée
    plusieurs fois : dans la session `tauri dev` en cours (ouverte et
    modifiée de très nombreuses fois dans la même journée), **AUCUNE
    repaint ne se déclenchait plus du tout**, même pour une VRAIE frappe
    clavier réelle (pas seulement pour des commandes appelées via le hook
    de debug `window.__paginaEditor`) : `canvas.innerHTML.length` restait
    identique au caractère près avant/après insertion d'un paragraphe
    canari, et le nombre de pages affiché ne changeait jamais quelle que
    soit la quantité de contenu ajoutée. Un `page.reload()` (recharge
    frontend) n'a pas suffi à corriger ça cette fois — contrairement aux
    occurrences précédentes de staleness (boutons du ruban) qui se
    corrigeaient avec un simple rechargement. **Vérifié malgré tout, par
    inspection DIRECTE du document ProseMirror** (pas du rendu) : la
    structure générée par `generateToc()` est correcte (ex. avec un
    document ayant 1 titre niveau-1 existant + 20 nouveaux titres
    niveau-1 ajoutés à la fin, le sommaire généré a bien 6+ items DIRECTS
    à la racine de son `bulletList`, pas tout imbriqué sous un seul
    parent) — donc le problème rencontré est dans le PIPELINE DE REPAINT
    de cette session précise, pas dans la logique de pagination
    elle-même. **À refaire dès qu'un redémarrage COMPLET de `tauri dev`
    (pas juste un rechargement de page) aura eu lieu** : générer un
    sommaire avec suffisamment de titres de premier niveau pour dépasser
    une page, confirmer qu'il se répartit sur plusieurs pages sans
    déborder, et revérifier curseur/sélection dans une liste courte restée
    sur une seule page (non régression).
  - Hook de debug temporaire (`window.__paginaEditor`) et tous les scripts
    de test jetables utilisés pendant cette investigation retirés/supprimés.
- **Ruban réactif à la mise en forme sous le curseur, façon Word (2026-10-19)**,
  sur demande explicite de l'utilisateur ("quand je sur sur [suis sur] du
  texte gras j'ai le bouton gras activé, quand je suis sur du texte j'ai la
  police d'afficher et la taille") — jusqu'ici seul le style de bloc
  (Normal/Titre 1-6, `activeBlockStyle`) se mettait à jour automatiquement ;
  les boutons Gras/Italique/Souligné/Barré/Indice/Exposant/Code en
  ligne/Surlignage, les boutons d'alignement, les boutons de liste/citation,
  et les sélecteurs Police/Taille restaient figés quelle que soit la
  sélection.
  - **`EditorStats` étendu** (`MarkdownEditor.tsx`) : `activeMarks`
    (8 booléens, `editor.isActive("bold")` etc.), `activeAlign`
    (`"left"|"center"|"right"|"justify"|null`), `activeList`
    (`"bullet"|"ordered"|"task"|"blockquote"|null`), `activeFontFamily`
    (attribut `fontFamily` de la marque `textStyle`, `null` si absent),
    `activeFontSizePt` (réutilise `currentFontSizePt`, qui existait déjà
    pour Agrandir/Réduire — replie sur 12pt). Calculés par 4 nouvelles
    fonctions (`getActiveMarks`/`getActiveAlign`/`getActiveListType`/
    `currentFontFamily`) et ajoutés aux 5 points d'émission de stats déjà
    en place pour `activeBlockStyle` (même convention : `onUpdate`,
    `getStats()`, `onSelectionUpdate`, et les deux émissions liées au
    repaint/suivi de page — un oubli à un seul des 5 aurait laissé le
    ruban "en retard" uniquement dans ce cas précis, piège déjà identifié
    pour `activeBlockStyle`/`insideTable` par le passé).
  - **`Toolbar.tsx`** : nouvelles props (toutes avec une valeur par défaut
    neutre, comme `activeBlockStyle`) répercutées sur les boutons concernés
    via un nouveau helper `activeBtnClass(active)` (classe
    `tb-btn-icon-active` en plus de `tb-btn-icon`) et sur les deux
    `<select>` Police/Taille, rendus CONTRÔLÉS (`value={...}` au lieu de
    `defaultValue=""`) — si la police/taille de la sélection ne correspond à
    AUCUNE option de la liste fixe, le sélecteur retombe sur le placeholder
    plutôt que d'afficher une valeur fausse.
  - **`App.tsx`/`PaginaLight.tsx`** (même contrat `EditorStats`, doivent
    rester synchronisés) : `EMPTY_STATS`/`STATS_INITIALES` complétés avec
    les valeurs neutres, nouvelles props transmises au `<Toolbar>`.
  - **Couleur de l'état actif** : accent Prairie (#24ac6e, couleur MBEF des
    éléments actifs) — cohérent avec l'onglet actif/les cases cochées
    ailleurs dans l'app, mais DIFFÉRENT du blanc+vert Sapin déjà utilisé par
    la galerie de styles (`tb-style-btn-active`) — choix délibéré : les deux
    conventions coexistaient déjà dans Word (bouton de ruban simple en
    bleu accentué, galerie de styles en blanc) sans qu'aucune règle commune
    n'ait été demandée par l'utilisateur ici.
  - **Vérifié par Playwright/CDP** sur le document réel
    `GUIDE-NF-C-15-100-2024-VERSION-ANNOTEE-VERIFIEE.md` (texte de test
    "demotest" tapé en fin de document, jamais sauvegardé, annulé
    intégralement par `Ctrl+Z` en boucle puis confirmé : onglet sans point
    "non enregistré", texte de test absent de la page) : bouton Gras
    inactif avant toggle, actif après toggle sur la sélection, actif avec un
    simple curseur dans le mot (sans sélection), inactif avec le curseur
    replacé hors du mot ; sélecteur "Taille" affichant bien `18pt` après
    l'avoir choisi. `npx tsc --noEmit` propre, `npm test` 38/38 verts.
- **Correctif : impossible de changer la couleur/le style de bordure via le
  schéma interactif (2026-10-19)**, remonté par l'utilisateur ("je n'arrive
  plus à changer couleur et forme" — en précisant que la suppression du
  bouton "Appliquer" était volontaire, pas le bug à chercher). Causé par le
  **même piège déjà documenté trois fois dans ce fichier** (glisser de
  fenêtre, panneau `ColorPicker`, menu "Variable" d'en-tête/pied de page) :
  les groupes SVG cliquables du schéma de bordure (`<g className="tp-bd-
  edge-group">`, `TablePropertiesPanel.tsx`, `BorderDiagram`) n'avaient
  **aucun garde `onMouseDown={(e) => e.preventDefault()}`**, contrairement
  au panneau `ColorPicker` qui, lui, l'a déjà (ajouté plus tôt dans cette
  même session pour exactement ce problème). Un clic RÉEL de souris émet
  `mousedown` AVANT `click` — ce `mousedown` fait perdre le focus DOM de
  l'éditeur invisible, ce qui vide la sélection de cellule(s) en cours
  avant même que `onClick`/`toggleLine` ne s'exécute : le clic sur une
  ligne du schéma retombait alors sur une sélection vide, sans effet
  visible — exactement le symptôme "je n'arrive plus à changer couleur et
  forme" (le changement de Style/Couleur se réapplique bien aux lignes
  actives via l'effet `[style, width, color]`, mais si la première
  activation d'une ligne n'a jamais pris, il n'y a toujours aucune ligne
  active à réappliquer quoi que ce soit).
  - **Piège de méthode de test rencontré pendant le diagnostic** : mes
    scripts de test Playwright utilisaient `element.dispatchEvent(new
    MouseEvent("click", {bubbles:true}))` — qui ne simule PAS un vrai clic
    de souris (aucun `mousedown` préalable émis). Résultat : ces tests
    passaient tous avec succès (poser une bordure, changer le style,
    changer la couleur, tout fonctionnait "en synthétique"), masquant
    totalement le bug réel — qui ne se manifeste QUE sur un vrai
    `mousedown`+`click`. **À RETENIR** : pour tester tout composant
    interactif qui agit sur la sélection de l'éditeur (menu, panneau,
    schéma cliquable...), ne jamais se contenter d'un `dispatchEvent`
    `click` seul — ce type de test ne peut PAS détecter cette classe de
    bug, qui est pourtant déjà survenue 4 fois dans ce projet.
  - **Fix** : ajout de `onMouseDown={(e) => e.preventDefault()}` sur le
    `<g>` de chaque ligne du schéma, même remède que pour `ColorPicker`.
  - **Découverte annexe pendant le diagnostic, sans lien avec le bug** : le
    fichier de test jetable "Nouveau document.md" du dossier de travail
    de l'utilisateur porte déjà, réellement enregistré sur disque, des
    bordures `3px solid` sur une cellule de tableau — confirmé par lecture
    directe du fichier (pas un résidu de test, un contenu réel déjà
    présent). Non modifié (lecture seule pendant l'enquête).
  - `npx tsc --noEmit` propre, 38 tests Vitest verts. Script de
    vérification final nettoyé, hook de debug temporaire
    (`window.__paginaEditor`) retiré du code source.
- **Redimensionnement de colonne de tableau à la souris (2026-10-19)**, sur
  demande explicite de l'utilisateur après avoir remarqué que "la sélection
  des bordures pour réduire ou agrandir la taille des colonnes ou lignes"
  ne marchait pas — diagnostic confirmé : cette fonction n'a en réalité
  **jamais** fonctionné dans Pagina, pour une raison structurelle (la vraie
  zone éditable ProseMirror est invisible/hors écran — `.xmd-live-editor-
  host`, `position: fixed; left: -5000px` — la souris de l'utilisateur ne
  la survole donc jamais, et la poignée native `ColumnResizing` de
  `prosemirror-tables` n'apparaît que sur SURVOL de la vraie zone
  éditable). Confirmé en regardant comment le projet de référence
  CasualOffice/docs (`../pagina-docx-engine`) contourne exactement le même
  problème structurel : ils ne s'appuient PAS non plus sur le plugin
  natif — ils peignent leurs PROPRES poignées directement dans la couche
  visible (`layout-painter/renderTable.ts`) et gèrent le glisser à la main
  dans `PagedEditor.tsx` (mousedown sur la poignée → suivi visuel pendant
  `mousemove` → une seule vraie transaction ProseMirror au `mouseup`).
  **Repris pour la seule largeur de COLONNE** (la hauteur de LIGNE est
  notée en suite logique plus bas, pas encore faite — notre schéma de
  ligne de tableau n'a aujourd'hui aucun attribut `height`, contrairement
  à CasualOffice qui en a un).
  - **Poignées peintes** (`paintPages.ts`, `injectColumnResizeHandles`) :
    à chaque frontière de colonne, un petit `<div>` (6px de large,
    `cursor: col-resize`) ajouté dans la couche peinte, positionné en
    mesurant les éléments `<col>` du tableau ORIGINAL (déjà attaché au
    document invisible, donc mesurable) — PAS la première ligne de
    cellules, qui donnerait de fausses frontières dès qu'une cellule
    fusionnée (`colspan`) apparaît ailleurs dans le tableau. `.tableWrapper`
    (généré par `Table.configure({resizable:true})`) passe à
    `position: relative` pour que ces poignées (position:absolute)
    s'alignent dessus plutôt que sur un ancêtre positionné plus haut dans
    la page. Exclues explicitement de `@media print` (même piège déjà
    rencontré une fois avec `.tbar` — ajouté dès l'écriture cette fois,
    pas après coup).
  - **Glisser géré dans `MarkdownEditor.tsx`**, même effet que le
    glisser-sélection de cellules existant (`onMouseDown`/`onMouseMove`/
    `onMouseUp` sur le canvas peint) : au `mousedown` sur une poignée,
    mesure la largeur de départ via le `<col>` de la table ORIGINALE
    (`view.nodeDOM(tablePos)`) ; au `mousemove`, ne déplace QUE
    visuellement la poignée (`style.left`, converti écran→logique via
    `/ zoomRef.current` — sans ça, glisser à 150% de zoom déplacerait la
    poignée 1,5× trop vite) ; au `mouseup`, UNE seule vraie transaction
    (`applyColumnWidth`, nouvelle fonction utilisant `TableMap` — même
    outil déjà utilisé par `applyBorderPreset`/`setGridLineBorder`) pose
    la largeur sur l'attribut `colwidth` de chaque cellule qui touche
    cette colonne (déduplique les cellules vues deux fois via un
    `rowspan`, gère le bon index local si la cellule est elle-même
    fusionnée horizontalement via `colspan`). `colwidth` est un attribut
    DÉJÀ existant sur nos cellules (hérité de `@tiptap/extension-table-
    cell` par `TableCellStyle.ts`, jamais exploité jusqu'ici) — aucun
    nouveau schéma à écrire, juste une nouvelle façon de le renseigner.
  - **Piège méthodologique rencontré PENDANT la vérification, encore le
    même que d'habitude** : le tout premier test de glisser réel
    (`page.mouse.down/move/up` de Playwright, pas un simple clic) n'a
    RIEN déplacé du tout — poignée immobile, `colwidth` resté `null`.
    Après un redémarrage COMPLET et propre de `tauri dev` (les modifs de
    `MarkdownEditor.tsx` dans cette même session avaient déclenché
    plusieurs cycles de Fast Refresh), le même test a fonctionné
    parfaitement du premier coup (largeur passée de ≈486px à 547px pour
    un glisser de +60px). **Confirme une fois de plus le piège déjà
    documenté deux fois aujourd'hui** : après une succession de modifs sur
    `MarkdownEditor.tsx` pendant une session de travail, un redémarrage
    complet (pas juste HMR) est nécessaire avant de conclure qu'une
    interaction souris/clic ne fonctionne pas.
  - **Vérifié par Playwright/CDP** avec un VRAI glisser de souris (pas un
    `dispatchEvent` synthétique) sur le document de test habituel : la
    poignée suit la souris, `colwidth` posé sur la bonne cellule avec la
    bonne valeur arrondie, le `<col>` du tableau réel change de largeur en
    conséquence. Annulé via l'API (`editor.commands.undo()`, plusieurs
    fois jusqu'à épuisement de la pile) — confirmé qu'aucune trace ne
    persiste et que l'indicateur "non enregistré" de l'onglet disparaît.
    `npx tsc --noEmit` propre, `npm test` 38/38 verts.
  - **Redimensionnement de LIGNE (hauteur), fait dans la foulée (même
    jour)**, sur confirmation de l'utilisateur ("on le fait aussi pour les
    lignes?") : même technique, miroir vertical exact. Nouvel attribut
    `height` ajouté via une nouvelle extension `TableRowStyle.ts` (étend
    `@tiptap/extension-table-row`, même schéma que `TableCellStyle.ts` —
    aucun attribut de ce type n'existait avant sur nos lignes de tableau).
    Poignées peintes (`injectRowResizeHandles`, horizontales cette fois,
    mesurées sur les `<tr>` du tableau original) + glisser/relâcher dans
    `MarkdownEditor.tsx` (`applyRowHeight`, plus simple que la colonne :
    une ligne n'a pas de `rowspan` à gérer à SON propre niveau). Vérifié
    par un vrai glisser de souris Playwright, du PREMIER coup cette fois
    (redémarrage propre fait AVANT de tester, piège HMR évité d'emblée) :
    hauteur appliquée correctement (106px pour un glisser de +40px),
    annulation propre.
  - **Correctif découvert en cours de route (pas une régression du jour,
    un oubli du tout premier correctif de colonne)** : `colwidth` (posé
    par `applyColumnWidth`) n'était PAS pris en compte par
    `hasAdvancedStyle` dans `TableMarkdown.ts` — une colonne redimensionnée
    aurait donc été **silencieusement réenregistrée en GFM standard**,
    perdant la largeur personnalisée au premier aller-retour (GFM n'a
    aucune notion de largeur de colonne). Ajouté au même test que
    couleur de fond/bordures/alignement vertical, plus une nouvelle
    fonction symétrique `hasRowHeight` pour la hauteur de ligne. Vérifié
    par Playwright : après un redimensionnement de colonne OU de ligne,
    `editor.storage.markdown.getMarkdown()` contient bien `<table` (repli
    HTML), pas la syntaxe `|---|` qui aurait perdu l'info.
  - `npx tsc --noEmit` propre, `npm test` 38/38 verts après l'ajout du
    redimensionnement de ligne et du correctif de repli HTML.
- **Audit de code après la grosse session de refonte du 2026-10-17
  (2026-10-19)**, demandé explicitement par l'utilisateur ("j'ai fait pas
  mal de modification tu peux faire un audit, pour faire un point") après
  le lot de changements ruban/panneaux contextuels/en-tête-pied riche
  documenté juste en dessous. Vérifications techniques : `git status`
  propre (24 commits locaux d'avance sur `origin`, rien en attente),
  `npx tsc --noEmit` propre, `npm test` (Vitest) 38/38 verts, `npm run
  build` propre (seul l'avertissement de taille de chunk préexistant,
  Tiptap/mermaid), `cargo check` propre.
  - **Audit structurel délégué à un agent** (balayage code mort,
    cohérence `ToolbarActions`/`MarkdownEditorHandle`/`App.tsx`/
    `PaginaLight.tsx`, exports/CSS orphelins, `any`/`@ts-expect-error`
    récents, couverture de tests) : **résultat très propre**. Aucun hook
    de debug oublié (`window.__paginaEditor` etc.), aucun `console.log`
    résiduel, aucun `TODO`/`FIXME`, les composants que CLAUDE.md dit
    supprimés (`ContextualRibbonPanel`, `TableBorderDialog`,
    `VariablePicker`/`HEADER_FOOTER_VARIABLES`, `src/ui/PrintPreview/`)
    sont bien absents du code (pas seulement désactivés). Les 59 méthodes
    de `ToolbarActions` sont exactement répercutées dans
    `MarkdownEditorHandle`/`App.tsx`/`PaginaLight.tsx` (3 stubs no-op
    volontaires et documentés dans PaginaLight pour Mermaid/LaTeX,
    absents de la version légère). Aucun export de panneau/icône inutilisé
    (`ContextualPanelHost`, `HeaderFooterPanel`, `TablePropertiesPanel`,
    les 50 icônes de `icons.tsx`). Aucun `any`/`@ts-expect-error` dans le
    code du nouveau lot (ruban, panneaux) — les seuls présents dans tout le
    projet sont dans les extensions ProseMirror/markdown-it préexistantes
    (API amont non typées) ou dans `MarkdownEditor.tsx` (accès à
    `storage.markdown`, pattern déjà établi).
  - **Deux reliquats mineurs trouvés et corrigés** : CSS mort dans
    `Toolbar.css` (`.tb-stack-select`/`.tb-heading-option-token`, restes du
    sélecteur de langage déplacé vers la pastille flottante et de l'ancien
    menu Variable supprimé), et un commentaire dans `App.tsx` citant encore
    `TableBorderDialog` par son nom alors que ce dialogue n'existe plus
    (reformulé). `npx tsc --noEmit` revérifié propre après ces deux
    retouches.
  - **Écart de couverture de tests confirmé mais DÉJÀ connu** (pas une
    découverte) : aucun test pour l'éditeur riche d'en-tête/pied de page,
    `ContextualPanelHost`, le schéma de bordures/lignes de grille du
    panneau Tableau, Signet/Renvoi, la pastille de langage de bloc de code,
    ni les catégories du sélecteur d'emoji — CLAUDE.md note déjà que
    plusieurs de ces lots ont été construits explicitement "sans séance de
    tests" sur demande de l'utilisateur ; le seul dossier de tests du
    projet reste `src/ui/FileExplorer/__tests__/` (7 fichiers, chantier
    explorateur). À garder en tête si l'un de ces panneaux montre un jour
    un comportement inattendu — pas de filet de sécurité automatisé dessus
    pour l'instant.
- **Panneau « Équation » — éditeur WYSIWYG MathLive (2026-10-17, passe 1
  de la demande : « pour chaque fonction un panneau latéral droit,
  très simple — les utilisateurs ne peuvent pas coder une équation »)** :
  - Les window.prompt de LaTeX brut (insertion ET clic sur formule) sont
    SUPPRIMÉS. Nouveau src/ui/Math/EquationPanel.tsx dans
    ContextualPanelHost (onglet « Équation ») : champ <math-field>
    MathLive (MIT, 100 % local, import DYNAMIQUE pour ne pas le charger
    au démarrage) — on TAPE l'équation, elle se met en forme en direct
    (exposants, fractions imbriquées…), bouton de CLAVIER MATHÉMATIQUE
    VIRTUEL dans le champ (fractions, racines, grec, opérateurs) ;
    sortie LaTeX automatique, KaTeX rend dans la page comme avant.
    Bouton « Supprimer la formule ». Locale fr.
  - Mécanique : une formule est un ATOME — désignée par NodeSelection
    (pas un curseur « dedans »). EditorStats.math {kind, source, pos}
    (pos = clé d'identité : le panneau se remonte au changement de
    formule, jamais à la frappe — sinon le curseur du champ sauterait) ;
    front montant dans App.tsx (setMathPanelOpen + onglet) ; handle :
    updateMathSource (setNodeAttribute EN DIRECT à chaque frappe),
    deleteMath, insertInlineMath/insertBlockMath insèrent une formule
    VIDE + selectMathNodeBeforeCursor (NodeSelection) → le panneau
    s'ouvre prêt à saisir ; clic sur formule peinte → NodeSelection
    (plus de prompt).
  - Vérifié par Playwright/CDP : insertion → panneau ouvert, frappe
    « E=mc^2 » → LaTeX dans le doc + rendu KaTeX live, clic sur la
    formule → réouverture avec valeur, clic dans un paragraphe →
    fermeture propre. tsc, build, 38 tests verts. MathLive en
    dépendance (package.json) — chargé à la demande.
  - **Éditeur de GRAPHE sans code Mermaid (formulaire nœuds +
    flèches + aperçu) : MIS DE CÔTÉ sur demande de l'utilisateur
    (2026-10-17) — à redemander avant de le développer.**
- **Refonte de la résolution clic → position + sélection (2026-10-17,
  suite à la comparaison demandée avec le paged-editor de CasualOffice
  — 3 défauts remontés : « la sélection des cases de tableau saute »,
  « compliqué de positionner le curseur », « pas de défilement des
  pages quand on sélectionne beaucoup de texte »)** — même
  architecture des deux côtés (éditeur invisible + couche peinte),
  la différence était dans la RÉSOLUTION :
  - **Nouveau `pagination/cloneIndex.ts`** : à chaque repaint, les
    clones sont INDEXÉS en parcourant original et clone EN PARALLÈLE
    (TreeWalker synchronisé — structures identiques par construction) :
    nœuds texte du clone → position PM du premier caractère
    (`view.posAtDOM`), cellules td/th du clone → plage [from,to] du
    nœud cellule. Coût O(nœuds) par repaint, retourné dans
    `PaintResult.cloneIndex`, gardé dans `cloneIndexRef`.
  - **`resolveClickPosition` refait** : CHEMIN RAPIDE
    `document.caretRangeFromPoint` sur le texte VISIBLE du clone +
    position indexée = précision CARACTÈRE, insensible au zoom, ZÉRO
    traduction clone↔original, la cellule cliquée est un contenant
    naturel (impossible d'atterrir dans la voisine). Le balayage
    linéaire O(N)×2 `coordsAtPos` ne survit que comme REPLI (zones
    sans texte indexé : cellules vides, marges, atomes rendus),
    désormais BORNE À LA CELLULE cliquée quand il y en a une — le
    « saut » venait du balayage qui mettait toutes les cellules de la
    ligne à égalité.
  - **Auto-scroll au glisser-sélection** (concept de leur
    useDragAutoScroll, réimplémenté) : boucle rAF, zone 40px des
    bords de .xmd-page-wrap, vitesse proportionnelle max 12px/frame,
    étend la sélection à chaque tick (posFromCoords par
    elementFromPoint) — sélectionner sur plusieurs pages marche.
  - **Bonus** : double-clic = sélection du MOT (frontières
    unicode), triple-clic = sélection du BLOC entier (pas les
    tableaux), Maj+clic = étend depuis l'ancre.
  - Vérifié par Playwright/CDP : clic précis au caractère, cellules
    pleines ET VIDES cliquées sans saut, glisser 2 cellules → vraie
    CellSelection, auto-scroll 0→710px avec sélection étendue sur
    plusieurs pages (44 rects), double/triple/Maj+clic corrects.
    PIÈGE de test : Playwright n'envoie pas de clickCount>1 sur des
    clics séparés (e.detail reste 1) — le double-clic natif
    (dblclick) marche, le triple se teste par MouseEvent synthétique
    {detail:3} ; et TOUJOURS scrollIntoView la cible avant de
    cliquer (clics hors viewport = silencieusement ignorés par le
    handler). tsc, build, 38 tests verts.
- **Fenêtre Emoji refaite (2026-10-17, demande : « refaire la fenêtre
  emoji, mettre le bouton avec Éléments sans le cadre sur le bouton »)** :
  - L'ancienne liste plate de 30 émojis (menu 6 colonnes) est
    remplacée par une FENÊTRE à catégories façon sélecteur moderne
    (`.tb-emoji-pop`, Toolbar.tsx) : 8 catégories
    (EMOJI_CATEGORIES — Smileys & émotions, Animaux & nature,
    Nourriture & boissons, Voyages & lieux, Activités, Objets,
    Symboles, Drapeaux, 157 émojis au total, l'ancienne liste
    répartie dedans), grille 8 colonnes, défilement, fermeture par
    Échap/clic extérieur, RECALAGE dans le viewport à l'ouverture
    (le bouton est en bout de ruban — déborderait sinon, même
    logique que le ColorPicker). Couleurs MBEF (titre sapin, survol
    azur).
  - Le bouton Emoji (type B, icône visage SVG + ▾, SANS cadre —
    classe tb-heading-picker-trigger retirée du déclencheur) vit
    dans le groupe **« Éléments »** de l'onglet Insertion, en une
    seule pile de 3 LIGNES (demande 2026-10-17) : Séparateur,
    Emoji, Bloc de code. Un groupe intermédiaire « Panneau »
    avait été créé puis retiré sur demande de l'utilisateur dans
    la même journée.
  - Vérifié par CDP : 8 catégories/157 émojis, pas de débordement,
    Échap ferme, bouton sans bordure visible dans Éléments. tsc,
    build, 38 tests verts.
- **Sélecteur de langage des blocs de code DÉMÉNAGÉ du ruban vers le
  bloc lui-même (2026-10-17, choix utilisateur validé : « select
  directement dans le code block quand on est en édition »)** :
  - Le `<select>` « Langage… » du groupe Éléments (onglet Insertion)
    est RETIRÉ du ruban ; `setCodeBlockLanguage` supprimé de
    ToolbarActions/MarkdownEditorHandle/App/PaginaLight (le bouton
    « Bloc de code » d'insertion reste).
  - **Pastille flottante** `.xmd-code-lang-chip` (MarkdownEditor.tsx,
    effet dédié) : petit sélecteur natif (« Texte » + langages)
    collé en haut à droite du BLOC PEINT contenant le curseur —
    les pages affichées étant des clones (`data-src-pos` = position
    ProseMirror), la pastille vit en fixed sur <body> et se
    recolle à chaque repaint/repaintCaretOnly (appels via
    `codeLangSyncRef` — IMPORTANT : dans repaintCaretOnly l'appel
    doit être PREMIÈRE LIGNE, avant ses early-returns) + scroll du
    wrapper + resize. Visible uniquement sélection dans un bloc de
    code (remonter `$from.node(d)` jusqu'au codeBlock, clone
    `[data-src-pos=$from.before(d)]`, fragment visible si bloc long
    cloné sur plusieurs pages). « Texte » → langue par défaut
    `text` de CodeBlockLowlight. Masquée en readOnly et à
    l'impression (@media print).
  - Liste des langages : `src/ui/Editor/codeBlockLanguages.ts`
    (CODE_BLOCK_LANGUAGE_OPTIONS, ex-Toolbar.tsx — clés de `common`
    de lowlight).
  - Vérifié par CDP : pastille visible dans le bloc, cachée en
    dehors (y compris en naviguant aux flèches), changement
    `sql` → clone `<code class="language-sql">` coloré ; tsc, build,
    38 tests verts. PIÈGE de test : « Bloc de code » ne convertit
    pas un TITRE (toggleCodeBlock sans effet sur heading) — viser un
    paragraphe pour insérer.
- **Ruban : coin droit à la Word + bouton Mise en page (2026-10-17,
  demande : « Explorateur au même emplacement que Partager dans
  Windows, Commenter désactivé à côté, et à la place de l'ancien
  Explorateur un bouton Mise en page »)** :
  - Barre d'onglets : zone `.tb-tabbar-right` (margin-left:auto) au
    COIN DROIT comme « Partager » de Word — bouton **Explorateur**
    (petite icône + libellé, icône active quand la sidebar est
    ouverte, onToggleSidebar) et bouton **Commenter** (icône bulle,
    DÉSACTIVÉ tant que la fonctionnalité n'existe pas).
  - Fin du bandeau Accueil : l'ancien grand bouton Explorateur est
    remplacé par **Mise en page** (grande icône IconPageSetup : page
    + marges pointillées, onOpenPageSetup) — le lanceur « ⌄ » du
    groupe Paragraphe ouvre le même dialogue.
  - Vérifié par CDP (boutons présents, Commenter disabled) ; tsc,
    build, 38 tests verts.
- **Dialogue « Mise en page » REFONT INTÉGRALE à la Word (2026-10-17,
  demande : « exactement identique aux 3 captures Word, même si
  certaines notions ne sont pas encore traitées »)** —
  PageSetupDialog.tsx/.css réécrits, trois onglets :
  - **Marges** : Haut/Bas/Gauche/Droite en CM (stockage mm, affichage
    cm), Relure + Position de la relure (grisés, non traités),
    Orientation Portrait/Paysage (boutons-icônes SVG), « Afficher
    plusieurs pages » (grisé), Aperçu SVG live + « Appliquer à : À tout
    le document » (figé — sections pas encore traitées).
  - **Papier** : formats **A3 / A4 / A5 / Letter / Legal**
    (PAPER_SIZES_MM + PAPER_SIZE_LABELS, pageLayout.ts) + Largeur/
    Hauteur EDITABLES en cm → **dimensions personnalisées**
    (`widthMm?`/`heightMm?` optionnels dans PageLayoutSettings,
    primés par resolvePageSizeMm ; choisir un format les efface).
    Alimentation papier (grisée), « Options d'impression… » (grisé).
    Version/auteur : SUPPRIMÉS du dialogue (demande 2026-10-17 :
    seront traités plus tard dans « Propriétés du document » et
    compte utilisateur) — les champs documentVersion/author RESTENT
    dans le modèle (variables {{version}}/{{author}} de l'en-tête/pied).
  - **Mise en page** : Section (Début de la section, Supprimer les
    notes de fin — grisés), En-têtes et pieds de page (« Paires et
    impaires » grisé ; **« Première page différente » CÂBLÉ** = inverse
    de showOnFirstPage, appliqué aux deux zones ; **« À partir du
    bord » CÂBLÉ** = nouveau champ `fromEdgeMm` dans
    HeaderFooterSettings — positionne la zone depuis le bord via les
    variables CSS `--xmd-header-top`/`--xmd-footer-bottom`, défaut
    12,5mm ≈ placement historique), Page/Alignement vertical (grisé) +
    boutons « Numérotation des lignes… » / « Bordures… » DÉPLACÉS dans
    la section Page (demande 2026-10-17 : pas dans la barre du bas) —
    inactifs tant que les notions ne sont pas traitées.
  - Boutons : **« Définir par défaut »** (persiste les réglages en
    localStorage `pagina.defaultPageLayout`, utilisés par
    createNewFile via loadDefaultPageLayout() — les nouveaux fichiers
    naissent avec), **OK** (vert prairie, applique) et Annuler.
  - **Couleurs : convention MBEF appliquée (2026-10-17, « je ne change
    rien d'autre »)** — bandeau de titre SAPIN, légendes de sections
    sapin, onglet actif souligné prairie, cases à cocher prairie,
    orientation active sapin sur fond teinté prairie, saisie focalisée
    azur, texte charbon, OK prairie (voir le nuancier ci-dessus).
  - SUPPRIMÉS de ce dialogue : onglets Page/En-tête-pied (ancienne
    organisation), champs TEXTE d'en-tête/pied (s'éditent sur la page
    même), onglet Titres et sommaire (styles de titres restent
    accessibles via le ruban).
  - Rétro-compatibilité : fromEdgeMm fusionné avec les défauts à la
    lecture (extractDocumentConfig) ; fichiers existants sans le
    champ OK. `tsc`, build, 38 tests verts ; vérifié par CDP dans la
    fenêtre réelle (3 onglets, 5 formats, aperçu live portrait/paysage,
    Annuler propre). PIÈGE HMR habituel (workspaceStore hot-swappé →
    singleton Zustand perdu) : page.reload() via CDP pour restaurer.
- **Correctif : le ruban fermait le champ en-tête/pied au moment de
  s'y appliquer (2026-10-17, remonté par l'utilisateur : « quand je
  veux mettre du texte en gras dans la zone en-tête, ça ne marche pas
  car l'en-tête est automatiquement désélectionné »)** — le clic sur
  un bouton du ruban (G, italique, tableaux…) passait par
  `onDocMouseDown` → `commit()` : le champ se REFERMAIT sur le
  mousedown, avant même que la commande ne s'exécute. Fix dans
  `startHeaderFooterEdit` (MarkdownEditor.tsx) : la fermeture hors
  champ ignore AUSSI `.tb-ribbon-stack` (ruban) et `.tbar` (barre de
  titre) en plus de `.ctx-host` — le champ reste ouvert, la commande
  route via `cmd()`, s'applique à la sélection (conservée même sans
  focus) et le `.focus()` de la chaîne rend le focus au mini-éditeur.
  Vérifié par Playwright/CDP : sélection dans le champ → clic G →
  `<strong>` présent, champ ouvert, focus dedans ; Ctrl+Z annule.
  Seul un clic dans le document (ou l'explorateur) referme.
- **Réorganisation des boutons du panneau En-tête/Pied (2026-10-17)** :
  la classe `.hf-grid` du JSX n'avait AUCUNE règle CSS — les 6 boutons
  Variables s'empilaient en pleine largeur. Ajout
  (HeaderFooterPanel.css) : grille 3 colonnes, boutons type A
  strictement identiques (icône + libellé + jeton), vérifié par CDP
  (3×2 boutons de 77×59px).
- **Correctif disposition : panneaux contextuels vs pages A4
  (2026-10-17, retour utilisateur « il faut reprendre la disposition
  des panneaux »)** — quand le panneau contextuel droit
  (ContextualPanelHost) ou l'explorateur ouvert réduisaient la largeur
  disponible, `.xmd-page` (max-width: 100%) SE RÉTRÉCISSAIT en dessous
  de sa largeur A4 fixe : pages déformées + tout ce qui repose sur la
  géométrie fixe (résolution des clics vers l'éditeur invisible,
  en-tête/pied, pagination) désynchronisé. Fix dans
  MarkdownEditor.css : `max-width: 100%` SUPPRIMÉ de `.xmd-page`
  (largeur TOUJOURS fixe), `.xmd-page-wrap` passe en `overflow-x:
  auto` (le bord droit redevient atteignable au scroll horizontal au
  lieu d'être rogné sans recours) et `.xmd-page-canvas` en
  `align-items: safe center` (centré s'il y a la place, calé à gauche
  sinon — un `center` simple laisserait le bord gauche inatteignable).
  Vérifié par Playwright/CDP : panneau ouvert à 1280px de fenêtre →
  page reste 794px, panneau 260px à droite, pas de chevauchement,
  champ d'en-tête ouvert parfaitement aligné sur la zone peinte.
  **PIÈGE VÉCU (session zombie)** : l'utilisateur a testé sur une
  session `tauri dev` OBSOLÈTE encore en arrière-plan (HMR avait
  remonté l'app après « CODE_BLOCK_LANGUAGES incompatible » → état
  cassé, champ d'en-tête inéditable, « je ne peux pas éditer le texte
  dans l'en-tête et pied de page »). Sur une session propre, l'édition
  en-tête/pied (clic → champ, frappe, boutons Variables du panneau,
  Échap, clic ailleurs) est fonctionnelle de bout en bout — vérifié
  par CDP. Avant de croire un rapport d'utilisateur sur un bug
  d'édition, vérifier l'arborescence de processus : UNE seule instance
  `npx tauri dev` doit exister (vite sur 1420, app + CDP sur 9222) ;
  tuer les arbres zombies AVANT de diagnostiquer.
- **En-tête/pied de page = MARKDOWN ordinaire piloté par le RUBAN
  (2026-10-17, refonte demandée par l'utilisateur après rejet des
  mini-fonctions dédiées : \"considère les deux parties comme une partie
  de Markdown qu'on duplique\")** — plus AUCUNE commande `hf*` :
  - **Principe** : l'en-tête/pied de page est du contenu Markdown
    ordinaire, simplement dupliqué sur chaque page. Le RUBAN existant
    (police, taille, couleur, alignements, tableaux, gras…) s'applique
    au champ ouvert via un ROUTAGE : `cmd()` dans MarkdownEditor.tsx
    renvoie `headerMiniEditorRef.current ?? editor` — toutes les
    commandes du handle (y compris cellules/bordures de tableau)
    ciblent le mini-éditeur tant que le champ est ouvert, et
    re-basculent sur l'éditeur principal à la fermeture.
  - **Champ RICHE** (`startHeaderFooterEdit`) : mini-éditeur Tiptap
    HORS React (div `.xmd-header-footer-rich` recouvrant la zone) avec
    les mêmes extensions de mise en forme/tableaux que l'éditeur
    principal + **`Markdown.configure({ html: true })`** — le template
    (MARKDOWN brut stocké dans `layout.header/footer.text`) est parsé
    tel quel à l'ouverture (le HTML historique passe aussi grâce à
    `html: true`), et `mini.on("update")` re-sérialise en MARKDOWN à
    chaque frappe (`mini.storage.markdown.getMarkdown()`) — mise à jour
    en direct, Échap/clic ailleurs/✕ ne font que REFERMER.
  - **Peinture** (`paintPages.ts`) : le peintre reçoit
    `header/footer` = `HeaderFooterSettings & { html? }` — MarkdownEditor
    convertit le template via `mdToHtml()`
    (`editor.storage.markdown.parser.parse`) et
    `buildHeaderFooterContent()` fait `innerHTML` (après substitution
    des variables) si `html` est fourni, SINON `textContent` (texte
    simple historique : jamais interprété comme HTML).
  - **Panneau latéral En-tête/Pied de page** (HeaderFooterPanel.tsx) :
    réduit aux **Variables uniquement** (titre + ✕ + 6 jetons + hint
    \"le ruban s'applique au champ\"). Les sections Mise en forme et
    Tableau du panneau ont été SUPPRIMÉES (le ruban les remplace).
    `insertHeaderFooterVariable` insère dans le mini-éditeur (ou
    l'ouvre). PageSetupDialog : champs texte simples = du markdown,
    restent valides.
  - `ContextualPanelHost` (src/ui/ContextualPanels/) : UNE colonne
    droite redimensionnable avec ONGLETS quand plusieurs contextes
    sont actifs (Tableau | En-tête/Pied de page) ; un seul contexte =
    pas de barre d'onglets. Sélection auto : une édition d'en-tête/pied
    qui démarre prend l'onglet, sa fin rend la main à Tableau s'il
    reste ouvert. Panneaux = CONTENUS sans châssis (l'hôte fournit
    fond/bordure/largeur/poignée) ; `.ctx-host` dans `@media print`.
  - `tsc` strict, build, 38 tests verts ; pas de séance de test
    (mode de travail demandé). À vérifier manuellement : édition riche
    en conditions réelles (tableau dans un pied de page, substitution
    à l'impression), et vieux documents dont l'en-tête était stocké en
    HTML (passent par `html: true` — à confirmer).
- **Groupe « Liens » : Lien + Signet + Renvoi (2026-10-17, fin de
  journée)** — demande utilisateur façon Word ("le panneau liens et
  médias devient Liens comme Windows ; rajoute Signet et Renvoi"),
  toujours en mode « modifications sans séance de tests » :
  - Le groupe « Liens et médias » (une grande icône Lien) devient
    « **Liens** » : trois boutons type B empilés — **Lien** (setLink
    inchangé), **Signet**, **Renvoi** (icônes IconBookmark/
    IconCrossReference DÉRIVÉES, aucun tracé de maquette fourni).
  - **Signet** : nouvelle extension `Bookmark.ts` — nœud inline atomique
    `<a id="…"></a>` (HTML inline valide en .md, invisible dans tout
    autre outil) ; `insertBookmark` passe par window.prompt (même schéma
    que setLink/insertInlineMath) + `slugifyBookmark` (minuscules, sans
    accents, espaces→tirets, [a-z0-9-_]).
  - **Renvoi** : `insertCrossReference` — deux prompts (signet visé,
    texte affiché) puis insertion d'un lien Markdown standard
    `[texte](#id)` (via insertContent HTML `<a href="#id">`, capté par
    la marque Link) : cliquable partout, saut vers l'ancre fonctionnel.
  - Câblé ToolbarActions/handle/App/PaginaLight. `tsc`, build, 38 tests
    verts.
- **Correctif : champ en-tête/pied de page décalé par l'ouverture du
  panneau « Variables » (2026-10-17, remonté par l'utilisateur avec
  capture)** : le champ flottant vit en position absolue aux
  coordonnées prises à l'OUVERTURE — l'apparition du panneau (ou toute
  fermeture de l'explorateur / redimensionnement) réduisait la zone
  peinte APRÈS coup et le champ restait décalé (≈90px mesurés, flottant
  au-dessus du document). Fix dans `startHeaderFooterEdit` :
  `reposition()` (recalé sur l'élément d'origine s'il survit à un
  repaint, sinon la zone visible la plus proche — le texte du champ est
  partagé par toutes les pages) branché sur un `ResizeObserver` du
  canevas + `resize` de fenêtre, débranché au commit/à l'annulation.
  Vérifié : écart 0px après l'apparition du panneau. `tsc` propre.
- **En-tête/pied de page : panneau « Variables » + correctif du bouton
  « Pied de page » (2026-10-17, fin de journée)** — demande utilisateur :
  "créer un panneau latéral droit avec les Variables sous forme d'icône,
  grande icône pour le pied de page ; pour info le bouton pied de page ne
  marche pas" (mode de travail demandé : modifications du ruban SANS
  séance de tests).
  - **Correctif du « bouton qui ne marche pas »** : `editHeader`/
    `editFooter` visaient TOUJOURS la zone de la première page
    (`querySelector`) — si l'utilisateur lisait une page ultérieure, le
    champ flottant s'ouvrait HORS du viewport, donc visuellement "rien ne
    se passait". Nouveau `headerFooterTargetNearViewport()` : choisit la
    zone visible la plus proche du centre du viewport (à défaut la
    première). Le bouton fonctionnait techniquement — son ancrage était
    le problème.
  - **`EditorStats.headerFooterEditMode`** ("header"|"footer"|null) :
    remonté à l'ouverture/fermeture du champ flottant (commit/cancel,
    via un `emitMode` dédié — sans attendre une modification du
    document) + ajouté aux 4 sites d'émission de stats (au passage le
    site "après repaint" oubliait `insideTable`/`tableSelectionShape`,
    corrigé) + `closeHeaderFooterEdit()` au handle (blur = commit).
  - **Nouveau panneau latéral `HeaderFooterPanel`**
    (src/ui/HeaderFooter/, style sobre hf-* identique au panneau
    Tableau) : titre En-tête/Pied de page + ✕ (termine l'édition en
    validant), section « Variables » avec 6 boutons-icônes (Page, Pages,
    Date, Fichier, Version, Auteur — icônes `IconVar*` DÉRIVÉES, aucun
    tracé de maquette fourni) + jeton affiché sous le libellé. Visible
    uniquement pendant l'édition du champ, suit son cycle de vie.
    `onMouseDown preventDefault` conservé (piège du focus documenté).
  - **Ruban** : groupe « En-tête et pied » = deux grandes icônes
    (En-tête, Pied de page) ; le menu « Variable ▾ » du ruban est
    SUPPRIMÉ (remplacé par le panneau) — `VariablePicker` et
    `HEADER_FOOTER_VARIABLES` retirés de Toolbar.tsx, `IconVariable`
    retiré d'icons.tsx. `.hf-panel` ajouté aux règles `@media print`.
    `tsc`, build, 38 tests verts ; séance de vérification CDP non
    demandée pour cette passe.
- **Éditeur de bordures : ÉDITION DIRECTE (2026-10-17, fin de journée)** —
  retour utilisateur : "quand on clique ou change une bordure sur le
  schéma, on change le tableau" (simplification UX). Les boutons
  « Retirer/Appliquer » de la section Bordures du panneau Tableau sont
  SUPPRIMÉS :
  - **Clic sur une ligne du schéma = application immédiate** : ligne
    absente → pose la bordure avec le pinceau courant (style/épaisseur/
    couleur), ligne active → la retire (via `setGridLineBorder` sur la
    seule ligne cliquée).
  - **Changement de Style/Épaisseur/Couleur = re-application
    immédiate** aux lignes actuellement actives du schéma (effet sur
    [style, width, color]) ; sans ligne active, c'est le pinceau des
    prochains clics.
  - Le schéma démarre VIDE (plus de pré-sélection "extérieures" —
    désormais chaque clic agit, une pré-sélection aurait fait qu'un
    premier clic sur un bord RETIRAIT une bordure jamais posée) et se
    vide quand la forme de la sélection change. Il reflète les
    bascules de la SESSION, pas une lecture de l'état du document.
  - Piège de sérialisation : `setGridLineBorder` écrit la forme
    abrégée `border-top: 3px solid rgb(...)` alors que les PRÉSETS
    écrivent `border-width/style/color` séparés — les regex de test
    doivent accepter les deux. Vérifié 6/6 par CDP (pose 1px, re-apply
    3px, style tireté, retrait, présets, nettoyage). `tsc`, build,
    38 tests verts.
- **Fonctionnalités du panneau « Tableau » RÉCUPÉRÉES (2026-10-17, fin de
  journée)** — retour utilisateur après la refonte sobre : "on a perdu
  beaucoup de côtés sur ce panneau, il faut récupérer les fonctionnalités
  perdues". La présentation sobre est conservée, TOUT ce que l'ancien
  panneau savait faire est de retour, restylé avec la palette
  `--tp-*` (aucun vert) :
  - **Lignes : 4 boutons** (Au-dessus, En dessous, Supprimer, **En-tête**
    = `toggleHeaderRow`, restauré).
  - **Cellules : 4 boutons** (Fusionner, Diviser, Vider, **Fond** =
    nuancier ColorPicker de fond de cellule avec « Automatique » =
    transparent, pastille damier, restauré).
  - **Section Alignement vertical** restaurée (Haut/Milieu/Bas, icônes
    `IconValign*` DÉRIVÉES — aucun tracé fourni par la maquette pour ces
    trois commandes, même grille/épaisseur que les autres).
  - **Section Bordures restaurée** : présets Tout/Extérieur/Intérieur/
    Aucune, schéma SVG cliquable des lignes de grille (extérieures ET
    internes selon la sélection, `setGridLineBorder`), champs
    Style/Épaisseur/Couleur, Retirer/Appliquer, note de repli HTML.
  - Le panneau reprend sa prop `shape` (`stats.tableSelectionShape`),
  largeur par défaut revenue à 260px. Piège de sérialisation : les
  bordures s'écrivent `border-width:…; border-style:…; border-color:…`
  (pas `border-top:`) — les regex de test doivent être larges
  (`/border/`). Vérifié 18/18 par CDP sur fichier jetable : structure
  (5 sections, 14 boutons + présets + schéma + champs), En-tête
  (bascule → HTML puis undo → GFM), Fond (background-color), alignement
  vertical (vertical-align:middle), préset Tout (bordures au .md),
  schéma + Appliquer/Retirer, commandes de base inchangées. `tsc`,
  build, 38 tests verts.
- **Présentation du panneau latéral « Tableau » refaite (2026-10-17,
  maquette sobre gris clair)** — FORME UNIQUEMENT, aucun handler changé :
  en-tête sobre (titre « Tableau » seul + ✕, aucun texte « Contextuel »),
  corps en 3 sections (Lignes / Colonnes / Cellules) de 3 boutons type A
  (icône SVG ~20px + libellé ~10px dessous, tooltips obligatoires),
  séparateurs horizontaux nets, palette locale en variables CSS
  (--tp-* : fond #eeefef, filets #d0d3d4, texte #2a2a24, libellés
  #75766f, boutons #e0e2e3/#d0d3d4/#c5c9ca — AUCUN vert). « Supprimer le
  tableau » conservé en bas (seule voie d'UI pour cette commande).
  - **NOUVELLE action `clearCellContents`** (bouton « Vider » de la
    maquette — aucune action existante ne correspondait) :
    `clearSelectedCellContents` dans MarkdownEditor.tsx vide le contenu
    de la cellule courante (ou de toutes les cellules d'une sélection
    multi-cellules) par `tr.replaceWith` d'un paragraphe vide, même
    énumération que `applyToSelectedCells`. Câblée dans ToolbarActions +
    App + PaginaLight.
  - **Icônes du panneau remplacées par les tracés de la maquette**
    (icons.tsx : RowAbove/RowBelow/RowDelete, ColLeft/ColRight/ColDelete,
    MergeCells/SplitCells/ClearCell — `minmax(0,1fr)` obligatoire dans la
    grille CSS : un `1fr` nu prend pour minimum la largeur du CONTENU,
    donc « En dessous » élargissait sa colonne et les 3 boutons d'une
    ligne n'avaient pas la même taille).
  - **Commandes de l'ancienne présentation NON exposées dans la nouvelle
    maquette** (bordures/couleur de fond/alignement vertical/bascule de
    ligne d'en-tête) : leurs ACTIONS restent intactes dans
    ToolbarActions/MarkdownEditorHandle (`setCellBorder`,
    `setCellBorderPreset`, `setGridLineBorder`,
    `setCellBackgroundColor`, `setCellVerticalAlign`,
    `toggleHeaderRow` + icône `IconTableHeader` conservée dans
    icons.tsx) — plus AUCUNE voie d'UI actuellement, à ré-exposer dans
    une future surface si demandé.
  - Vérifié 23/23 par Playwright/CDP sur fichier jetable : forme
    (en-tête, 3 sections, 9 boutons égaux, tooltips, couleurs, zéro
    vert) + fonction (chaque bouton → Ctrl+S → relecture du .md : GFM
    préservé partout, Vider vide la cellule, ✕ masque, réapparition au
    RETOUR dans le tableau après en être sorti — une fermeture manuelle
    persiste tant qu'on n'en sort pas, comportement voulu). `tsc`
    strict, build, 38 tests Vitest verts.
- **Refonte complète du ruban façon Word 2024 (2026-10-17, même
  journée)** : deux onglets (Accueil absorbe « Format avancé », Insertion
  absorbe « Extras »), icônes SVG exclusives (grille 24x24, stroke 1.6,
  currentColor — module `src/ui/Toolbar/icons.tsx`, tracés imposés par
  la maquette, à ne pas redessiner), typologie A/B/C (`.tb-big-btn`
  grande icône 28px + libellé ; `.tb-stack-btn` petite icône + libellé
  empilé ; `.tb-btn-icon` icône seule + TOOLTIP obligatoire), grandes
  icônes lettrées conservées (G/I/S/x²/x₂/Aa/A + barres couleur).
  - **Accueil** : Presse-papiers (Coller A, Couper/Copier B — NOUVELLES
    actions `copySelection`/`cutSelection`/`pasteClipboard` dans
    `MarkdownEditorHandle`, sérialisation Markdown de la sélection via
    `storage.markdown.serializer` puis API Clipboard), Police (menus +
    Agrandir/Réduire NOUVEAUX via `FONT_SIZE_STEPS` partagé exporté,
    Modifier la casse NOUVEAU cycle minuscules→MAJUSCULES→Casse de
    titre→minuscules, Couleur, Surlignage, Effacer), Paragraphe (+4
    alignements SVG, lanceur Mise en page), Styles (galerie conservée,
    lanceur), **Explorateur en fin de bandeau** (type A,
    `onToggleSidebar`, séparé par un espaceur flexible).
  - **Insertion** : Pages (Saut de page B — passé en petite icône +
    libellé à droite sur demande de l'utilisateur, comme Note de bas de
    page), Tableaux et éléments (Tableau A via TableSizePicker restylé,
    Séparateur/Bloc de code B, Langage), Liens (Lien A), En-tête et
    pied (En-tête A, Pied B, Variable ▾ B avec icône), Sommaire
    (Marqueur A, Mettre à jour B), Diagrammes et formules (Mermaid A,
    formules B, Emoji ▾ B avec le visage SVG fourni, PAS d'emoji comme
    icône de déclencheur).
  - **Finitions CSS (2026-10-17, même journée)** : alignement vertical
    type B (boîte d'icône à taille fixe 15x15 + line-height harmonisé,
    delta mesuré 0,00 px), tailles d'icônes IMPOSÉES au conteneur par
    typologie (`.tb-big-btn-icon svg` 28, `.tb-stack-btn-icon svg` 15,
    `.tb-btn-icon svg` 16 — l'attribut passé au SVG ne peut plus diverger),
    gaps uniformes 3 px (groupe grille et flex, piles type B),
    séparateurs de groupes en `rgba(255,255,255,0.28)` partout (l'opacité
    0.15 d'avant rendait certaines frontières invisibles), sélecteur
    « Langage » avec min-width + padding flèche, `flex-shrink: 0` sur
    groupes/boutons pour ne JAMAIS tronquer un libellé (un ruban trop
    étroit déborde au lieu de couper, comme Word).
  - **Outils de tableau contextuels : dans le PANNEAU LATÉRAL, pas dans le
    bandeau** (correction 2026-10-17 après incompréhension : une première
    interprétation de « panneau contextuel à droite du ruban » avait posé
    un panneau DANS le bandeau du ruban — l'utilisateur a tranché que ce
    n'était pas la bonne place, c'est une ERREUR à ne pas refaire). Les
    outils de tableau restent ceux du panneau latéral
    `TablePropertiesPanel` (droite du document, ouverture automatique à
    l'entrée dans un tableau), qui gagne au passage : la commande
    « Basculer la ligne d'en-tête » (`toggleHeaderRow`, nouvelle action
    Tiptap exposée) et les vraies icônes SVG (tracés fournis par la
    maquette, `icons.tsx`) à la place des glyphes texte (⬒+/⬓−…). Le
    composant `ContextualRibbonPanel` du bandeau a été SUPPRIMÉ
    entièrement (composant, CSS, prop `insideTable` du ruban).
  - **`insertImage` SUPPRIMÉ** (bouton, action ToolbarActions, entrée du
    handle, prompt URL, câblage App/PaginaLight) — l'EXTENSION Image de
    Tiptap reste enregistrée pour que les documents existants avec
    images restent lisibles (les images reviendront en phase 2 via le
    dossier images/ du conteneur .xmd). Aucun drag & drop/coliage
    n'insérait de lien fichier (vérifié : aucun handler à supprimer).
  - **Deux bugs préexistants corrigés au passage** (révélés par la
    vérification systématique du .md relu après chaque commande) :
    1. `ParagraphMarkdown.ts` perdait l'attribut `textAlign` à la
       sauvegarde (sérialiseur inline maison sans repli HTML) → repli
       `<p style="text-align: …">` via DOMSerializer quand le
       paragraphe est aligné ;
    2. le bouton « Modifier la casse » (repère désactivé avant) a été
       implémenté avec un cycle complet — le premier essai ne retombait
       jamais en minuscules (détection titre AVANT détection minuscule).
  - **Piège WebView2 rencontré** : `navigator.clipboard.readText()`
    déclenche une demande de permission native qui GÈLE la fenêtre
    jusqu'à réponse (« Autoriser ») — en test CDP elle déracine
    `contexts()[0].pages()[0]` (la « page » devient
    edge://permission-request-dialog ; toujours cibler la page de
    l'app par son URL localhost:1420). `pasteClipboard` garde un repli
    presse-papiers INTERNE (dernier Copier/Couper de l'app) si la
    permission est refusée.
  - Vérifié par Playwright/CDP en fenêtre réelle : **70/70 contrôles
    OK** (création d'un fichier test jetable, chaque commande → Ctrl+S
    → relecture du .md sur disque, structure du ruban, tooltips, panneau
    contextuel apparaît/disparaît, GFM préservé par les commandes de
    tableau, repli HTML valide pour la fusion/bascule d'en-tête). Note :
    insérer une ligne AU-DESSUS de la ligne d'en-tête rend la 1re ligne
    non en-tête → repli HTML (aucune représentation GFM) — comportement
    attendu, pas un bug. `npx tsc --noEmit` propre, `npm run build` sans
    nouveau warning, `cargo check` propre (aucun changement Rust),
    38 tests Vitest existants toujours verts.
- **Explorateur de fichiers — Fonctionnalité 7 : ergonomie complémentaire
  (2026-10-17)**, fin du chantier explorateur (7/7 fonctionnalités).
  - **Sélection** : le simple clic sur un fichier ne fait plus QUE
    sélectionner (`selectedPath` dans `FileExplorer`, classe
    `fx-row-selected`, distincte de `fx-row-active` = onglet actif) ;
    **ouverture par double-clic** uniquement. Clic sur un dossier :
    déplie/replie + sélectionne.
  - **Navigation clavier** : `.fx-body` a `tabIndex 0`/`role="tree"` ;
    flèches haut/bas déplacent la sélection dans la liste des lignes
    VISIBLES (`flattenVisible` respecte l'état déplié ; en recherche,
    c'est la vue aplatie), Entrée ouvre un fichier / déplie-replie un
    dossier, **Suppr** ouvre la même confirmation que le menu
    contextuel, **F2** la boîte de renommage. La sélection reste active
    en mode recherche. `scrollIntoView({block:"nearest"})` suit le
    défilement (appel optionnel — absent de jsdom).
  - Tests : `FileExplorer.keyboard.test.tsx` (6 cas : double-clic une
    seule fois avec le bon chemin, simple clic sans ouverture, Suppr →
    modale, F2 fichier ET dossier, flèches + Entrée, recherche).
    Vérifié par Playwright/CDP en fenêtre réelle de façon NON
    destructive (double-clic sur le fichier déjà ouvert — aucun nouvel
    onglet ; Suppr et F2 annulés par Échap ; lignes du workspace
    inchangées après tous les tests). `npm run build` propre (seul
    l'avertissement de taille de chunk préexistant, lié à
    Tiptap/mermaid, subsiste).
  - **Note UX** : après fermeture d'une modale (Suppr/F2/renommage), le
    focus DOM retombe sur body — les touches clavier ne portent plus
    sur l'arbre tant qu'on n'a pas recliqué dedans. Comportement
    standard, à améliorer éventuellement (restauration du focus).
- **Explorateur de fichiers — Fonctionnalité 6 : rafraîchissement disque
  robuste (2026-10-17)**, suite du chantier explorateur.
  - **Debounce 300 ms côté JS** dans `workspaceStore.ts`
    (`debouncedRefreshTree` appelé par le listener
    `workspace://changed`) : une rafale d'évènements disque ne
    déclenche QU'UNE relecture `read_workspace_tree` (les appels
    directs à `refreshTree` — création, renommage… — restent
    immédiats).
  - **`unwatch_workspace` (nouvelle commande Rust)** : `watcher.rs`
    réécrit — le `RecommendedWatcher` vit désormais dans un état géré
    Tauri (`WatcherState`, `Mutex<Option<RecommendedWatcher>>`,
    enregistré via `.manage()` dans `lib.rs`) au lieu d'un thread
    détaché impossible à arrêter. Le thread de boucle d'évènements ne
    détient PAS le watcher : `unwatch_workspace` le drop, ce qui ferme
    le channel et termine proprement la boucle. `openWorkspace`
    appelle `unwatchWorkspace()` AVANT `watchWorkspace(nouveauRoot)`
    dès qu'on change de dossier (l'ancien watcher resterait sinon actif
    sur un dossier qui n'est plus affiché).
  - **Onglet « (introuvable) »** : `refreshTree` compare les chemins
    des onglets (sous le workspace root uniquement, jamais les onglets
    ouverts hors workspace) avec l'arbre relu ; les fichiers disparus
    sont marqués via `tabsStore.markMissingPaths` — l'onglet reste
    OUVERT (contenu/dirty conservés), `TabBar` affiche
    `titre (introuvable)` ; la marque disparaît si le fichier revient.
  - **Message d'arbre vide corrigé** : « Aucun fichier .md / .xmd »
    n'apparaît que s'il n'y a NI fichiers NI dossiers à toute
    profondeur (`flattenTree(tree).length === 0` au lieu de
    `tree.length === 0`, robuste même si le pruning Rust des dossiers
    vides venait à changer).
  - Tests : `FileExplorer.refresh.test.tsx` (6 cas : debounce 300 ms,
    ordre unwatch→watch au changement de workspace, onglet introuvable
    conservé puis démarqué au retour du fichier, onglet hors workspace
    jamais marqué, rendu TabBar « (introuvable) », message d'arbre
    vide). Piège de test : `watcherStarted` est une variable de MODULE
    dans workspaceStore — elle persiste entre les tests d'un même
    fichier, le `beforeEach` ne réinitialise donc pas le watcher (les
    tests d'ordre d'appels doivent en tenir compte). `cargo check`
    propre.
- **Explorateur de fichiers — Fonctionnalité 5 : tooltip chemin complet
  (2026-10-17)**, suite du chantier explorateur. Chaque ligne (dossier
  ou fichier, arbre normal ET vue aplatie de recherche) porte
  `title={node.path}` — le chemin absolu complet distingue les fichiers
  homonymes ; l'ellipsis CSS existante (`.fx-name`) tronque visuellement
  si le panneau est trop étroit, le title reste entier. Tests :
  `FileExplorer.tooltip.test.tsx` (title de chaque ligne + vue aplatie).
  Vérification Playwright/CDP en fenêtre réelle non rejouée à la demande
  de l'utilisateur pour ce point (couvert par les tests unitaires).
- **Explorateur de fichiers — Fonctionnalité 4 : tri de l'arborescence
  (2026-10-17)**, suite du chantier explorateur. Dossiers avant les
  fichiers, puis ordre alphabétique **insensible à la casse ET aux
  accents** (`Intl.Collator("fr", { sensitivity: "base" })` : é ≈ e,
  E ≈ e), récursif à toutes profondeurs. Implémenté dans
  `workspaceStore.ts` (`sortTree`, appliqué à `openWorkspace` ET
  `refreshTree` — l'état du store lui-même est trié, pas seulement le
  rendu) et réutilisé par la vue aplatie de recherche dans
  `FileExplorer.tsx` (sinon elle héritait de l'ordre de parcours de
  l'arbre). Piège rencontré : l'ordre exact de « CCTP.md » vs
  « cctp v2.md » dépend du traitement ICU des espaces/ponctuation
  (poids variables) — l'exigence est l'ADJACENCE, pas un ordre absolu.
  Tests : `FileExplorer.sort.test.tsx` (4 cas de tri pur + 2 cas de
  rendu : ordre des lignes après refresh, vue aplatie triée).
- **Explorateur de fichiers — Fonctionnalité 3 : badge « modifié »
  (2026-10-17)**, suite du chantier explorateur. Point orange (•,
  `title="Modifié (non enregistré)"`, classe `fx-dirty-badge`) sur
  toute ligne de FICHIER (pas les dossiers) dont l'onglet correspondant
  dans `tabsStore` est dirty — `FileExplorer` s'abonne à `tabs` et
  calcule un `Set` de chemins dirty, passé à `TreeNode` et aux lignes
  de la vue aplatie de recherche. Temps réel garanti par l'abonnement
  Zustand : recalculé à chaque `updateContent` (frappe) et
  `saveTab`/undo. Vérifié par Vitest (4 cas : badge onglet dirty puis
  retrait après saveTab, jamais de badge sans onglet, badge en vue
  aplatie, apparition à la frappe) et par Playwright/CDP en fenêtre
  réelle (1 espace tapée → 1 badge, Ctrl+Z → 0 badge, sans sauvegarde).
- **Explorateur de fichiers — Fonctionnalité 2 : menu contextuel +
  dialogues inline (2026-10-17)**, suite du chantier explorateur.
  - **Boutons « Nouveau fichier/dossier » supprimés** de l'en-tête de
    section, **tous les window.prompt/alert éliminés** de
    `FileExplorer.tsx` (ils échouent silencieusement dans WebView2) :
    tout passe désormais par un clic droit + composants React maison.
  - **Menu contextuel** (`TreeMenu.tsx`, classe `fx-menu`) : dossier →
    5 actions (Nouveau fichier, Nouveau dossier, Renommer, Dupliquer,
    Supprimer) ; fichier → 3 actions (Renommer, Dupliquer, Supprimer) ;
    fond de l'arbre → création à la racine. Fermeture au clic extérieur
    (`pointerdown` sur document) et à Échap ; navigation clavier
    flèches/Entrée ; **positionnement inversé près des bords** (mesure
    `getBoundingClientRect` dans un `useLayoutEffect`, même logique que
    le correctif ColorPicker).
  - **`NameDialog.tsx`** (création/renommage, classe `fx-dialog`) :
    validation nom vide interdit + caractères `\ / : * ? " < > |`
    refusés avec message d'erreur explicite, Entrée valide, Échap
    annule. **`ConfirmDialog.tsx`** pour la suppression, avec message
    renforcé si un onglet dirty serait perdu.
  - **Stores** : `workspaceStore` gagne `renameEntry(from, to)`,
    `deleteEntry(path)`, `duplicateEntry(path)` (encapsulent appel
    fileService + refreshTree + propagation tabsStore) et
    `createNewFile/createNewFolder` acceptent un `dirPath` optionnel
    (création dans un sous-dossier) ; `joinPath` est exporté.
    `tabsStore` gagne `renameTabPaths(from, to)` : met à jour chemin et
    titre de tout onglet sous `from` (fichier OU dossier, préfixe
    `\\` ou `/`) en conservant contenu/dirty/mise en page ;
    `deleteEntry` ferme proprement les onglets du chemin supprimé.
  - Tests : `FileExplorer.contextmenu.test.tsx` (7 cas : 5 actions vs 3
    vs racine, caractère invalide sans appel `rename_path`, renommage
    valide avec onglet dirty conservé, confirmation avant fermeture
    d'onglet, fermeture du menu extérieur/Échap, navigation clavier,
    duplication). Vérifié par Playwright/CDP sur le workspace réel
    (menus racine et fichier, dialogue de renommage, erreur caractères
    interdits, Échap sans rien modifier).
  - **Piège CDP rencontré** : quand la fenêtre de l'app est RÉDUITE,
    le viewport WebView2 tombe à ~146x20px et Playwright échoue avec
    "<html> intercepts pointer events" — restaurer la fenêtre d'abord
    (script `restore-window.ps1` à la racine (tracké) :
    ShowWindow SW_RESTORE via P/Invoke). Autre piège : le HMR de Vite
    qui hot-swappe `workspaceStore.ts` RÉINITIALISE le singleton
    Zustand (root perdu, App ne remonte pas) → `page.reload()` via CDP
    restaure le workspace depuis localStorage.
- **Explorateur de fichiers — Fonctionnalité 1 : recherche dans
  l'arborescence (2026-10-17)**, première étape du chantier explorateur
  (7 fonctionnalités prévues dans l'ordre : recherche, menu contextuel,
  badge modifié, tri, tooltip, rafraîchissement robuste, ergonomie clavier).
  - Le champ de recherche (placeholder pur et `disabled` jusqu'ici) filtre
    l'arbre par nom, insensible à la casse, correspondance partielle, avec
    un **debounce de 150 ms** dans `FileExplorer.tsx` (`searchInput` pour
    l'affichage du champ, `search` débouncé pour le filtrage réel).
  - Pendant la recherche : **vue aplatie** de toutes les correspondances
    (fichiers ET dossiers, n'importe quelle profondeur) avec le chemin
    relatif au workspace en second — masqué à la racine où il redoublerait
    inutilement le nom du fichier.
  - **État déplié/remplié des dossiers remonté dans `FileExplorer`**
    (`expandedOverrides: Map<path, boolean>` au lieu du `useState` local de
    `TreeNode`, défaut = déplié au premier niveau) : il survivait sinon à
    chaque aller-retour recherche ↔ arbre normal (démontage/remontage des
    `TreeNode`). Échap ou champ vidé → retour à l'arbre normal avec l'état
    déplié préservé.
  - **Outillage de test installé** (jamais présent auparavant) :
    `vitest`, `@testing-library/react`, `@testing-library/user-event`,
    `@testing-library/jest-dom`, `jsdom` en devDependencies ;
    `vitest.config.ts` (jsdom, setup `src/test/setup.ts`) ; scripts
    `npm test` (`vitest run`) et `npm test:watch`. Piège rencontré : avec
    `globals: false` (choix par défaut de Vitest), le setup doit importer
    `@testing-library/jest-dom/vitest` (pas `@testing-library/jest-dom`,
    qui cherche un `expect` global inexistant) ET appeler `cleanup()`
    dans un `afterEach` explicite (l'auto-cleanup de RTL ne s'installe
    pas sans globales).
  - Tests : `src/ui/FileExplorer/__tests__/FileExplorer.search.test.tsx`
    (5 cas : filtre casse-indifférente en profondeur, chemin relatif,
    retour à l'arbre avec état déplié préservé, zéro résultat, Échap) —
    tous verts. Vérifié aussi par Playwright/CDP dans la fenêtre réelle
    (port 9222) sur le workspace de l'utilisateur : correspondance
    « nouveau » → « Nouveau document.md », message zéro-résultat, Échap.
  - **Piège d'environnement (sessions futures)** : les processus lancés
    depuis un appel d'outil (y compris `tools.process.start` ou
    `Start-Process` PowerShell) sont TUÉS dès la fin de l'appel — pour
    lancer `tauri dev` avec `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS
    =--remote-debugging-port=9222` de façon durable, le Planificateur de
    tâches a fonctionné un temps (`schtasks /create /tn pagina-dev-cdp
    /tr <chemin> /sc once /st 23:59` puis `/run`) puis s'est MIS EN FILE
    D'ATTENTE INDEFINIMENT sans jamais exécuter (même une tâche trivial
    `echo > fichier`, cause inconnue, service Schedule pourtant RUNNING).
    Contournement VALIDÉ (2026-10-17, à préférer désormais) : création
    du processus via WMI, dont le parent (WmiPrvSE) est hors de l'arbre
    du shell — `powershell Invoke-CimMethod -ClassName Win32_Process
    -MethodName Create -Arguments @{ CommandLine = 'cmd /c
    "C:\...\run-tauri-dev.cmd"' }` (`run-tauri-dev.cmd` + log
    `tauri-dev.log` à la racine, log ignoré). Après un kill/redémarrage
    de l'app le bug CDP `shared_worker` (documenté plus bas) disparaît.
- **Correctif : le panneau `ColorPicker` débordait hors de l'écran
  (2026-10-14, même jour)**, remonté par l'utilisateur avec une capture
  d'écran montrant le sélecteur de "Couleur de bordure" tronqué sur le bord
  droit. Cause : `.cp-panel` s'ouvrait TOUJOURS avec `left: 0` (vers la
  droite du déclencheur) — correct pour la plupart des cas, mais le
  déclencheur "Couleur de bordure" vit dans le panneau Tableau, lui-même
  ancré au bord DROIT de la fenêtre : il n'y a quasiment plus de place à
  droite, donc le panneau (232px de large) débordait hors de l'écran sans
  qu'aucun mécanisme ne le détecte. **Fix** : nouvel état `placement`
  (`{h: "left"|"right"; v: "down"|"up"}`) calculé à l'OUVERTURE (pas en CSS
  pur, qui casserait le cas normal où le déclencheur est près du bord
  GAUCHE) — mesure `getBoundingClientRect()` du déclencheur vs
  `window.innerWidth`/`innerHeight`, bascule vers la gauche/le haut si le
  panneau déborderait sinon. Même logique posée pour l'axe vertical par
  cohérence (même risque si un déclencheur est près du bas de l'écran),
  bien que non signalé par l'utilisateur. Vérifié par Playwright/CDP :
  fenêtre à 2560px de large, bouton "Couleur de bordure" à x=2510-2550px
  (quasiment collé au bord) → classe `cp-panel-h-right` bien appliquée,
  panneau ouvert reste entièrement dans la fenêtre (`right: 2550 ≤
  windowWidth: 2560`). `npx tsc --noEmit` propre.
- **Schéma de bordure enrichi : rendu SVG fidèle au style de trait choisi
  (2026-10-14, même jour)**, sur retour immédiat de l'utilisateur avec une
  nouvelle capture d'écran de Word (mini-tableau avec lignes de texte
  décoratives + pourtour pointillé) : "tu peux le faire ressembler à ça, il
  faudrait que l'on puisse sélectionner un style de ligne/trait pour
  l'appliquer à notre bordure". La toute première version du schéma (voir
  entrée juste en dessous) affichait toujours une barre PLEINE quelle que
  soit le style réglé dans le menu déroulant "Style" — ne répondait donc
  pas vraiment à "sélectionner un style de ligne".
  - **Réécrit en SVG** (au lieu de `<div>`/CSS `background-color`) :
    `stroke-dasharray` donne un VRAI rendu tireté/pointillé fidèle, ce
    qu'un simple fond de couleur sur une barre de quelques pixels ne peut
    pas reproduire. Le style "Double" (sans équivalent SVG natif) se
    dessine comme deux traits fins parallèles légèrement décalés
    perpendiculairement au côté concerné.
  - **Ajout du contenu décoratif façon Word** : pourtour pointillé gris
    clair (repère visuel de sélection, non interactif), 2×2 lignes de
    texte factices par quadrant (petits rectangles arrondis gris, purement
    illustratifs — comme les barres grises de la capture Word, aucune
    fonction), et une croix interne décorative séparant visuellement les 4
    quadrants (NON cliquable : ce schéma simplifié ne gère toujours que les
    4 côtés extérieurs, pas de lignes internes individuelles — limite
    assumée depuis le départ, pas un oubli).
  - **Cible de clic généreuse malgré un trait fin** : chaque côté est un
    `<g>` contenant une ligne invisible épaisse (10px, cible de clic
    confortable) superposée à la ligne visible réelle (fine, fidèle au
    style/épaisseur réglés) — sans ça, cliquer précisément un trait de
    1,5px de large serait pénible. Un côté INACTIF s'affiche toujours en
    simple ligne grise fine, quel que soit le style "Double" réglé (le
    dédoublement visuel ne s'applique qu'aux côtés ACTIFS, pour ne pas
    donner l'impression trompeuse que deux côtés distincts existent là où
    il n'y en a qu'un).
  - **Vérifié par Playwright/CDP** : style "Tireté" → `stroke-dasharray`
    confirmé `"6 3"` sur les 4 côtés ; style "Double" → 8 lignes visibles
    au total (2 par côté × 4) ; clic sur "Droite" → bascule correctement en
    gris simple. `npx tsc --noEmit` propre.
- **Schéma de bordure cliquable façon Word (2026-10-14, même jour)**, sur
  demande explicite de l'utilisateur (deux captures d'écran de référence :
  le panneau Pagina actuel et la boîte de dialogue "Bordures et trame" de
  Word) : remplace les 4 cases à cocher Haut/Droite/Bas/Gauche par un petit
  carré sur lequel on clique DIRECTEMENT le côté à activer/désactiver.
  Version volontairement simplifiée par rapport à Word (confirmé avec
  l'utilisateur avant de coder) : pas de rendu fidèle du style tireté/
  pointillé ni de l'épaisseur dans le schéma lui-même, juste activé/
  désactivé + couleur en direct — une fidélité totale (types "Quadrillage",
  liste de styles déroulante, aperçu grand format) aurait demandé beaucoup
  plus de travail pour un panneau latéral compact, pour un gain d'usage
  marginal.
  - **`BorderDiagram`** (nouveau composant dans `TablePropertiesPanel.tsx`) :
    4 `<button>` positionnés en absolu sur les bords d'un petit carré
    (`.tp-bd`), chacun coloré en gris quand inactif et dans la couleur de
    bordure actuellement réglée (`color`, déjà piloté par le `ColorPicker`
    existant) quand actif — change donc de couleur EN DIRECT si
    l'utilisateur ajuste la couleur avant de cliquer un côté. Réutilise
    exactement le même état `sides`/`toggleSide` qu'avant (aucun changement
    de logique sous-jacente, uniquement la présentation).
  - **Vérifié par Playwright/CDP** : les 4 bords affichent la bonne couleur
    de fond et le bon texte d'info-bulle selon leur état ; cliquer un bord
    bascule correctement son état (confirmé sur "Gauche" : actif → gris) ;
    changer la couleur via le `ColorPicker` met à jour la couleur affichée
    sur les bords actifs du diagramme sans avoir besoin de rouvrir quoi que
    ce soit. Comportement de "Appliquer"/"Retirer" sur la cellule réelle
    INCHANGÉ (même limite préexistante déjà présente avec les cases à
    cocher : un côté décoché n'est pas explicitement mis à "aucune
    bordure", juste "non touché" par ce clic sur Appliquer — et la bordure
    grise `1px solid #ccc` par défaut de TOUTE cellule, posée dans
    `MarkdownEditor.css`, reste visible tant qu'aucun style personnalisé ne
    la recouvre, y compris après "Retirer" — pas une régression de ce
    changement). `npx tsc --noEmit` propre.
- **Installeur 0.4.8 (2026-10-14)**, sur demande explicite de l'utilisateur
  ("fais un install"). Version alignée dans les 3 endroits synchronisés
  (`package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`).
  Regroupe tout le travail de cette session de travail très longue :
  export PDF direct + correctif `.tbar` visible à l'impression/export,
  panneau latéral contextuel de tableau (remplace le dialogue modal de
  bordures) avec ses sections Lignes/Colonnes/Cellules/Bordures, nouveau
  sélecteur de couleur façon Word/GitHub (`ColorPicker`, déployé sur les 4
  sélecteurs de couleur de l'app), dialogues modaux et panneaux latéraux
  redimensionnables à la souris, et le correctif du thème des blocs de
  code (fond clair façon GitHub). `npx tsc --noEmit` propre puis `npx
  tauri build` (≈6min de compilation Rust release) ; anciens fichiers
  `0.4.7` supprimés de `releases/`, remplacés par
  `Pagina_0.4.8_x64-setup.exe`/`Pagina_0.4.8_x64_en-US.msi`, liens du
  `README.md` mis à jour en conséquence.
- **Correctif du thème des blocs de code (2026-10-14, même jour)**, remonté
  par l'utilisateur avec une capture d'écran de GitHub comme référence :
  "les encarts de code sont de base noir dans le rendu, il faut qu'ils
  soient gris clair de base comme sur GitHub". `.xmd-prosemirror pre`/
  `.xmd-preview-content pre` avaient un fond sombre codé en dur
  (`#2b2b2b`/texte `#f5f5f5`) — reliquat d'un thème inspiré d'un éditeur de
  code sombre, jamais mis à jour depuis, et incohérent avec le reste de
  l'interface claire de Pagina. **Fix** : fond `#f6f8fa`/texte `#24292e`
  (couleurs exactes du thème clair de GitHub) dans les DEUX vues qui
  affichent du code (`MarkdownEditor.css` pour la vue Pages,
  `MarkdownPreview.css` pour l'aperçu Markdown). La palette de coloration
  syntaxique (`.hljs-*`, voir `CodeBlockLowlight` dans `MarkdownEditor.tsx`)
  a dû être entièrement retuned en même temps : les teintes pastel
  précédentes (bleu clair, vert clair, orange clair...) étaient choisies
  pour rester lisibles sur fond SOMBRE — sur le nouveau fond clair, elles
  auraient été quasi illisibles (contraste insuffisant). Remplacées par les
  couleurs réelles du thème clair de GitHub (`.hljs-keyword` rouge
  `#d73a49`, `.hljs-string` bleu foncé `#032f62`, `.hljs-number` bleu
  `#005cc5`, `.hljs-title`/fonction violet `#6f42c1`, `.hljs-tag`/variable
  vert `#22863a`, `.hljs-comment` gris `#6a737d` italique). Vérifié par
  Playwright/CDP sur un bloc de code déjà présent dans le document réel de
  l'utilisateur : `getComputedStyle` confirme `rgb(246, 248, 250)` (= 
  `#f6f8fa`) de fond et `rgb(36, 41, 46)` (= `#24292e`) de texte. `npx tsc
  --noEmit` propre (changements CSS uniquement).
- **Panneaux latéraux redimensionnables à la souris (2026-10-14, même
  jour)**, sur demande explicite de l'utilisateur ("idem sur le panneau
  latéral les élargit ou réduire") — suite directe du correctif précédent
  sur les dialogues modaux, mais la technique CSS pure (`resize: both`) ne
  convenait PAS ici : sa poignée est TOUJOURS au coin bas-droit de
  l'élément, ce qui marche pour un panneau ancré à GAUCHE (Explorateur,
  bordure libre à droite) mais pousserait un panneau ancré à DROITE
  (panneau Tableau, bordure libre à gauche) hors de la fenêtre au lieu de
  l'élargir.
  - **Nouveau hook générique** `src/ui/ResizeHandle/useHorizontalResize.ts`
    (+ composant `ResizeHandle.tsx`) : suit le glisser de souris via
    `mousemove`/`mouseup` posés sur `document` (pas sur la poignée
    elle-même — un drag sort forcément du petit rectangle de 6px de la
    poignée en cours de route). Paramètre `anchor: "left" | "right"`
    inverse le sens du delta horizontal selon le bord du panneau concerné
    — un seul hook réutilisable pour les deux cas, pas de code dupliqué
    ni de logique "à l'envers" à réécrire pour le second panneau.
  - **Intégré dans `FileExplorer.tsx`** (poignée sur le bord DROIT,
    `anchor: "left"`) et **`TablePropertiesPanel.tsx`** (poignée sur le
    bord GAUCHE, `anchor: "right"`) — chaque composant gère sa PROPRE
    largeur en interne (pas de nouvel état remonté dans `App.tsx`, cohérent
    avec le fait qu'aucun des deux composants n'exposait de prop de
    largeur auparavant). Largeur fixe retirée de `App.css`
    (`.app-sidebar { width: 260px; }` supprimé — contrôlée par `.fx-panel`
    lui-même maintenant) et de `TablePropertiesPanel.css`
    (`.tp-panel { width: 260px; }` supprimé). `position: relative` ajouté
    aux deux conteneurs racines pour ancrer la poignée `position: absolute`
    correctement ; poignée positionnée à `left:0`/`right:0` (pas un
    décalage négatif à cheval sur le bord) pour ne pas être rognée par
    l'`overflow` interne des panneaux (scroll de contenu déjà en place).
  - **Vérifié par Playwright/CDP** : glisser la poignée de l'Explorateur de
    +80px vers la droite → largeur passée de 260 à 340px (exact) ; glisser
    la poignée du panneau Tableau de -60px vers la gauche → largeur passée
    de 260 à 320px (exact, confirme le sens de calcul inversé pour
    `anchor: "right"`). `npx tsc --noEmit` propre.
- **Dialogues redimensionnables à la souris (2026-10-14, même jour)**, sur
  demande explicite de l'utilisateur ("les fenêtres il faudrait que l'on
  puisse les ragrandir"), après clarification (`AskUserQuestion`) : vrai
  redimensionnement à la souris (pas juste une taille par défaut plus
  grande). **Implémenté en CSS pur** (`resize: both; overflow: auto;` sur
  `.hs-dialog`/`.ps-dialog`) — la poignée de redimensionnement native du
  navigateur (coin bas-droit) suffit, aucune logique JS de glisser-déposer
  à écrire. `min-width`/`min-height` ajoutés pour empêcher de réduire le
  dialogue en dessous d'une taille lisible ; `max-width`/`max-height`
  déjà présents (`calc(100vw/100vh - 40px)`) empêchent de dépasser l'écran.
  **Piège évité dès l'écriture** (pas découvert après coup) : le corps
  interne scrollable (`.hs-body`/`.ps-body`) avait `overflow: auto` mais
  PAS `flex: 1` — sans ça, agrandir le dialogue aurait laissé un vide entre
  le corps et le pied de page au lieu de remplir l'espace. Ajout de
  `flex: 1; min-height: 0;` (le `min-height: 0` est nécessaire : un enfant
  flex avec `overflow: auto` a par défaut `min-height: auto`, qui
  l'empêche de rétrécir en dessous de son contenu et casse le défilement
  interne — piège flexbox classique). S'applique aux deux seuls dialogues
  modaux actuels du projet (`HeadingStyleDialog`, `PageSetupDialog`) — le
  panneau latéral de tableau (`TablePropertiesPanel`) et le popover
  `ColorPicker` ne sont volontairement PAS concernés (ancrés à un bord/une
  position fixe, un redimensionnement n'y aurait pas de sens). Vérifié par
  Playwright/CDP : propriété CSS `resize: both` confirmée active sur les
  deux dialogues, agrandissement simulé (changement direct de `width`/
  `height`, la vraie poignée se pilote par un glisser-déposer natif
  difficile à automatiser fiablement via CDP) confirmant que le corps
  interne remplit bien le nouvel espace disponible dans les deux cas.
  `npx tsc --noEmit` propre (changements CSS uniquement).
- **Sélecteur de couleur façon Word/Google Docs (2026-10-14, même jour)**,
  sur demande explicite de l'utilisateur (capture d'écran à l'appui) :
  "Automatique" / "Couleurs du thème" (grille de nuances) / "Couleurs
  standard" / "Couleur personnalisée" (hex + Appliquer) — remplace les
  `<input type="color">` natifs (sélecteur du système d'exploitation, sans
  cohérence visuelle) utilisés un peu partout dans l'app. Confirmé par
  l'utilisateur que la portée couvre TOUS les sélecteurs existants.
  - **Nouveau composant générique** `src/ui/ColorPicker/ColorPicker.tsx` +
    `colorUtils.ts` (mélange RGB linéaire pour générer les nuances — pas
    besoin de la précision d'un vrai espace HSL pour cet usage). Ne connaît
    ni Tiptap ni `ToolbarActions`, uniquement `value`/`onChange`/
    `onAutomatic` (optionnel — absent, la ligne "Automatique" n'apparaît
    pas) : chaque appelant décide de ce que "Automatique" signifie dans son
    contexte. Palette de thème : 9 couleurs de base × 6 lignes (base + 5
    nuances générées, 2 plus claires/1 proche/2 plus sombres) ; couleurs
    standard : 10 valeurs fixes identiques à celles de Word
    (`#C00000`...`#7030A0`).
  - **4 points d'intégration** : couleur de texte (`Toolbar.tsx`, "Format
    avancé"/Police — `onAutomatic` appelle le nouveau `unsetColor` sur
    `ToolbarActions`, qui existait déjà sur `MarkdownEditorHandle` mais
    n'avait jamais été exposé jusqu'ici), couleur de fond de cellule et
    couleur de bordure (`TablePropertiesPanel.tsx` — `setCellBackgroundColor`
    élargi pour accepter `string | null`, `null` = "Automatique" = fond
    transparent), couleur de titre (`HeadingStyleDialog.tsx`, simple champ
    de state local comme avant, pas de sémantique "Automatique" distincte
    ici).
  - **Piège rencontré et corrigé** : la première version ne fonctionnait
    QUE pour le trigger lui-même, pas pour les actions — cliquer un
    swatch (couleur de texte ou de fond de cellule) ne produisait AUCUN
    changement visible, bien que le panneau se fermait normalement
    (confirmant que `onClick` s'exécutait). Cause : même piège DÉJÀ
    documenté dans ce fichier pour le menu "Variable" d'en-tête/pied de
    page (voir plus haut, section du même jour) — un `mousedown` sur un
    bouton du panneau fait perdre le FOCUS DOM à l'éditeur invisible AVANT
    que `onClick` ne s'exécute, ce qui vide la sélection de texte/cellule
    en cours ; l'action s'applique alors à une sélection vide, sans effet
    visible. **Fix** : `onMouseDown={(e) => e.preventDefault()}` sur le
    bouton déclencheur ET sur le conteneur du panneau (`.cp-panel`, en
    excluant explicitement le champ de saisie hex — qui, lui, a BESOIN du
    focus natif pour que la frappe fonctionne). **À RETENIR, troisième
    occurrence de ce piège dans le projet** : tout nouveau composant de
    type menu/dropdown/panneau qui agit sur la sélection de l'éditeur DOIT
    neutraliser `mousedown` sur ses propres boutons dès l'écriture initiale
    — ne pas attendre un bug utilisateur pour s'en souvenir.
  - **Piège méthodologique rencontré PENDANT la vérification, à part** :
    après une succession de nombreux cycles HMR Vite dans cette session de
    travail très longue, l'objet `actions` de `App.tsx` est redevenu périmé
    (même symptôme déjà documenté pour `setCellVerticalAlign` début de
    session : un clic sur un bouton du panneau ne produisait plus RIEN,
    y compris des actions déjà éprouvées comme "Insérer une ligne" —
    confirmant que ce n'était PAS un bug du ColorPicker lui-même). Un
    redémarrage complet et propre de `tauri dev` a suffi à repartir d'un
    état frais et confirmer que tout fonctionne (couleur de texte,
    couleur de fond de cellule, couleur de bordure, toutes vérifiées par
    `getComputedStyle` après coup). **Ce projet rencontre ce piège de
    façon récurrente** — envisager de systématiser un redémarrage complet
    après, disons, une heure de session de travail continue avec
    beaucoup d'éditions de fichiers, plutôt que d'attendre qu'une action
    semble "ne rien faire" pour le suspecter.
  - `npx tsc --noEmit` propre. Toutes les actions de test annulées via
    l'API `editor.commands.undo()` (plus fiable que `Ctrl+Z` clavier
    quand le focus DOM est incertain — voir aussi le piège de focus perdu
    documenté juste en dessous, section "Regroupement des commandes de
    tableau").
- **Regroupement des commandes de tableau du ruban dans le panneau latéral
  (2026-10-14, même jour que la création du panneau)**, sur demande
  explicite de l'utilisateur : "il faut regroupé les commande de tableau du
  ruban haut [dans] le panneau latéral[e], ajoute de colonne de ligne
  suppression, dans le ruban on garde juste la création de tableau du ruban
  accueil." Suite directe de "Phase 1" de `ROADMAP-CASUALOFFICE.md` — voir
  ce fichier pour le détail complet (groupes supprimés, nouvelles sections
  du panneau, piège de focus perdu après un clic sur un bouton du ruban qui
  empêchait `Ctrl+Z` d'atteindre l'éditeur pendant la vérification). Résumé
  : l'onglet contextuel "Tableau" du ruban et le groupe "Tableau" de
  "Format avancé" ont disparu, leurs commandes vivent maintenant dans
  `TablePropertiesPanel.tsx` (nouvelles sections "Lignes"/"Colonnes"), le
  ruban ne garde que le sélecteur de création de tableau (onglet Accueil).
  `npx tsc --noEmit` propre, vérifié par Playwright/CDP.
- **Panneau latéral contextuel de mise en forme de tableau (2026-10-14)**,
  sur demande explicite de l'utilisateur après avoir vu le panneau
  équivalent de CasualOffice/docs ("l'édition de tableau où l'on peut
  déplacer le tableau... [le panneau] c'est plus simple à utiliser").
  Première entrée portée depuis `ROADMAP-CASUALOFFICE.md` (Phase 1,
  inventaire complet des fonctionnalités du fork établi le même jour).
  - **Remplace l'ancien dialogue modal `TableBorderDialog`** (supprimé,
    `src/ui/TableBorders/`) par `src/ui/TableProperties/
    TablePropertiesPanel.tsx` — un panneau ancré à droite (comme
    l'explorateur de fichiers à gauche), même visuel/mêmes `ToolbarActions`
    que l'ancien dialogue (`setCellBorder`, `setCellBorderPreset`,
    `setCellBackgroundColor`, `setCellVerticalAlign`, `mergeCells`,
    `splitCell`, `deleteTable`) — **aucune nouvelle action nécessaire**,
    juste une nouvelle surface d'UI pour les mêmes commandes déjà câblées.
  - **Ouverture/fermeture automatique** (`App.tsx`) : même principe de
    "front montant" déjà utilisé pour la bascule de l'onglet ruban
    contextuel "Tableau" (`wasInsideTableRef`, comparaison avant/après à
    chaque changement de `stats.insideTable`) — entrer dans un tableau
    ouvre toujours le panneau, mais une fermeture manuelle n'est pas
    annulée tant que le curseur reste dans le MÊME tableau ; seule une
    vraie sortie (front descendant) le referme, et une ressortie/rentrée
    ultérieure le rouvre.
  - **Piège déjà évité cette fois** (appris du correctif `.tbar` du même
    jour) : `.tp-panel` ajouté d'emblée à la règle `@media print`
    (`App.css`) dès l'écriture du composant, pas après coup.
  - **Vérifié par Playwright/CDP** contre le document réel de l'utilisateur
    (toujours sans jamais sauvegarder, Ctrl+Z systématique après chaque
    test) : panneau qui s'ouvre à l'entrée dans un tableau, préset de
    bordure "Tout" appliqué (`getComputedStyle().borderTopStyle === "solid"`
    confirmé), couleur de fond appliquée (`getComputedStyle().
    backgroundColor` confirmé), fermeture manuelle qui persiste tant qu'on
    reste dans le tableau, réouverture après une vraie ressortie/rentrée.
    **Piège de méthode de test rencontré et corrigé** (pas un bug de
    l'app) : un premier essai de couleur de fond via
    `input.dispatchEvent(new Event("change"))` ne déclenchait jamais le
    `onChange` React — React écoute l'évènement natif `input` (pas
    `change`) pour `<input type="color">` (comme pour `type="range"`),
    contrairement à un `<input type="checkbox">` où React écoute `click`.
    Fix du script de test : `dispatchEvent(new Event("input"))` après avoir
    posé `value` via le setter natif (`Object.getOwnPropertyDescriptor`,
    nécessaire car l'assignation directe `input.value = ...` ne déclenche
    pas toujours le détecteur de changement interne de React). **Toujours
    utiliser `input`, jamais `change`, pour simuler par script un
    changement sur un `<input type="color">`/`type="range"` React.**
  - **Second piège de méthode, plus sérieux, rencontré pendant la
    vérification** : après un redémarrage complet de `tauri dev` (requis
    pour contourner le bug `shared_worker` CDP documenté plus haut), la
    session restaurée automatiquement (persistance `tabsStore` via
    localStorage) a rouvert l'onglet actif sur **"Nouveau document.md"**
    plutôt que sur le document réel ouvert avant le redémarrage — un
    fichier déjà identifié ailleurs dans ce journal comme un VRAI CCTP de
    l'utilisateur (pas un brouillon jetable malgré son nom), portant déjà
    une corruption connue et non corrigée ("Con texte" avec espace
    parasite, voir plus haut). Mes scripts de test suivants ont donc agi
    sur CE fichier sans que je m'en rende compte immédiatement (le nom de
    l'onglet actif n'avait pas été revérifié après le redémarrage).
    Détecté a posteriori en listant tous les onglets ouverts et en
    inspectant le contenu réel de l'onglet actif (texte peint contenant
    bien la corruption déjà connue) — confirmé ensuite qu'aucune trace de
    mes actions de test ne persistait (0 cellule à fond jaune de test,
    bordures restantes = style par défaut `1px solid #ccc`/`#dfeff8` de
    `MarkdownEditor.css`, pas une trace de préset appliqué) et qu'aucune
    sauvegarde n'avait eu lieu. **À RETENIR, renforce une leçon déjà tirée
    le 2026-09-13** : après TOUT redémarrage de l'app pendant une session
    de test (HMR cassé, bug CDP...), revérifier explicitement quel onglet
    est actif (`document.querySelector('.tabbar-tab-active .tabbar-title')`
    ou équivalent) AVANT de continuer une suite de tests qui modifie du
    contenu — la session restaurée automatiquement peut très bien ne pas
    être celle qu'on croit, surtout si un autre onglet était actif avant
    le tout premier lancement de la session de travail.
  - `npx tsc --noEmit` propre. Fichiers de test jetables tous supprimés
    après coup (`test-table-panel.mjs`, `test-table-panel2.mjs`,
    `test-verify-clean.mjs`, `check-dirty.mjs`, `check-tabs.mjs`,
    `check-active-content.mjs`).
- **Installeur 0.4.7 (2026-10-14)**, sur demande explicite de l'utilisateur
  ("fais l'exe install"). Version choisie en continuité du rythme habituel
  (incrément mineur, correctifs de bugs sans rupture) : `0.4.6` → `0.4.7`
  dans les 3 endroits synchronisés (`package.json`,
  `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`). Correctifs pris en
  compte depuis le 0.4.6 : export PDF direct (nouvelle fonctionnalité) et
  le correctif critique de la barre `.tbar` visible dans le PDF/l'impression
  (voir sections juste en dessous). `npx tsc --noEmit` propre puis `npx
  tauri build` (≈6min30 de compilation Rust release) ; les trois anciens
  fichiers `0.4.6` supprimés de `releases/`, remplacés par
  `Pagina_0.4.7_x64-setup.exe`/`Pagina_0.4.7_x64_en-US.msi`, liens du
  `README.md` mis à jour en conséquence.
- **Correctif critique : la barre supérieure (`.tbar`) apparaissait dans le
  PDF exporté ET à l'impression, avec une page blanche en plus (2026-10-13,
  même jour)**, remonté par l'utilisateur sur un VRAI export (fichier
  `GUIDE-NF-C-15-100-2024-VERSION-ANNOTEE-VERIFIEE.pdf`, trouvé dans son
  dossier Téléchargements) : "j'ai le meme probleme que l'impression, de
  plus il a rajouté une pages". Diagnostic par extraction de texte PDF
  (`pymupdf`/`fitz`, voir ci-dessous) plutôt qu'en devinant : la page 1 du
  PDF contenait littéralement les icônes de la barre supérieure
  (💾📤↶↷🗋📄📂🖨️📑, la barre "Rechercher", l'avatar "KM", les boutons
  ─▢✕) suivies du titre du document — la vraie page 1 du contenu était donc
  repoussée en page 3, avec une page 2 quasi-vide entre les deux (d'où "il a
  rajouté une page").
  - **Cause** : la règle `@media print` (`App.css`) masque bien
    `.tb-ribbon-stack`/`.app-sidebar`/`.tabbar`/`.sb-bar`/l'éditeur
    invisible/etc., mais **PAS `.tbar`** — la classe racine de
    `TitleBar.tsx` (barre fusionnée Enregistrer/Annuler/Nouveau/Ouvrir/
    Imprimer/Export PDF/Rechercher/avatar/fenêtre, voir section "Barre
    supérieure fusionnée" plus bas). Cette règle `@media print` a été écrite
    AVANT la fusion de la barre de titre (ou en tout cas jamais mise à jour
    depuis) : elle liste encore les classes de l'ancienne "quickbar"/ruban
    séparés, jamais celle du nouveau composant qui les a remplacés. Comme
    **les deux chemins d'impression/export (`ShowPrintUI` ET
    `ICoreWebView2_7::PrintToPdf`) reposent sur le MÊME CSS**, le bug
    touchait les deux, confirmant exactement le "même problème que
    l'impression" rapporté par l'utilisateur.
  - **Fix** : ajout de `.tbar` à la liste des sélecteurs masqués par
    `@media print` dans `App.css` (une seule ligne).
  - **Piège méthodologique pour la prochaine fois** : la vérification
    PRÉCÉDENTE de l'impression (voir section "Impression / export PDF"
    plus bas) avait utilisé `page.pdf()` de Playwright (CDP) sur un
    document qui, à l'époque, ne faisait sans doute pas encore remonter ce
    bug précis (barre de titre pas encore fusionnée, ou test fait sur un
    document sans assez de contenu pour que l'absence de masquage soit
    visible) — **retenir qu'un changement ultérieur de l'UI (ex. fusionner
    plusieurs barres en une seule, renommer une classe) peut silencieusement
    désynchroniser une règle `@media print` écrite avant lui**, sans qu'aucun
    test automatique ne le révèle (TypeScript ne vérifie pas les sélecteurs
    CSS). Après toute refonte visuelle touchant la structure de haut niveau
    de l'app (barre de titre, ruban, sidebar...), revérifier explicitement
    que `@media print` dans `App.css` masque encore TOUTES les classes
    racines visibles à l'écran.
  - **Outil utilisé pour inspecter un PDF sans dépendance `poppler-utils`
    (absente de cette machine)** : `pymupdf` (`pip install pymupdf`,
    `import pymupdf` — anciennement `fitz`, toujours importable sous ce nom
    mais déprécié) permet d'ouvrir un PDF et d'en extraire le texte page par
    page (`doc.page_count`, `page.get_text()`) directement en Python, sans
    passer par le rendu visuel de l'outil `Read` (qui a besoin de
    `pdftoppm`/poppler, non installé ici) — bien plus rapide pour
    diagnostiquer "qu'est-ce qu'il y a VRAIMENT sur chaque page" qu'une
    capture d'écran. Nécessite `sys.stdout.reconfigure(encoding='utf-8')`
    (ou `PYTHONIOENCODING=utf-8`) sous ce Python Windows, sinon
    `UnicodeEncodeError` dès qu'un emoji/caractère accentué apparaît dans le
    texte extrait (encodage console par défaut `cp1252`).
  - **Vérifié** : nouveau PDF généré via `page.pdf()` (CDP, même pipeline
    Chromium d'impression que l'API COM native WebView2
    `ICoreWebView2_7::PrintToPdf` utilisée en production — les deux
    respectent les mêmes règles `@media print`) sur le document réel de
    l'utilisateur toujours ouvert : 7 pages (au lieu de 8), page 1
    commençant directement par le vrai titre du document, plus aucune trace
    des icônes de la barre supérieure dans le texte extrait de chaque page.
    `npx tsc --noEmit` propre. **Les deux anciens fichiers exportés par
    l'utilisateur dans son dossier Téléchargements n'ont pas été
    supprimés** (pas à moi de les effacer sans qu'il le demande) — à
    régénérer par lui avec le bouton Export PDF/Imprimer une fois ce
    correctif en place pour confirmer en conditions réelles.
- **Export PDF direct (2026-10-13)**, sur demande explicite de l'utilisateur :
  "il faut que l'on fasse un export PDF, l'impresion ne fonctionne par
  super. du coup je pense qu'un export pdf cerai plus propre" — l'ancien
  bouton Imprimer (`ShowPrintUI`, boîte de dialogue système) reste en
  place, mais un nouveau bouton 📑 "Exporter en PDF…" est ajouté juste
  à côté dans la barre supérieure (`TitleBar.tsx`), qui écrit directement
  un `.pdf` sur disque sans passer par AUCUNE boîte de dialogue
  d'impression — basé sur le même rendu HTML/CSS `@media print`/`@page`
  déjà validé pour l'impression (voir section "Impression / export PDF"
  plus bas), donc la même mise en page.
  - **API utilisée** : `ICoreWebView2_7::PrintToPdf(path, settings,
    completionHandler)` — asynchrone côté COM, le résultat arrive via un
    callback, pas une valeur de retour directe (`src-tauri/src/
    print_commands.rs`, nouvelle commande `export_pdf`).
  - **Piège majeur rencontré et corrigé, à ne jamais reproduire** : la
    PREMIÈRE version utilisait `webview2_com::PrintToPdfCompletedHandler::
    wait_for_async_operation`, qui BLOQUE en pompant la boucle de messages
    Windows (`wait_with_pump`, `GetMessageA`/`DispatchMessageA`) jusqu'à
    ce que le callback arrive — ça compile sans erreur, mais **reste
    bloqué INDÉFINIMENT à l'exécution** (confirmé en conditions réelles :
    l'appel `invoke` ne s'est jamais résolu, même après plusieurs
    minutes, il a fallu tuer le processus). Cause probable : `with_webview`
    dispatche déjà sa closure SUR la boucle d'évènements principale de
    `tao`/wry (pas une boucle Win32 brute) — y imbriquer un second pompage
    `GetMessageA` ne reçoit jamais le message de complétion, cette boucle
    n'étant apparemment pas ré-entrante de cette façon ici (contrairement
    à un vrai message loop Win32 natif — ex. boîtes de dialogue modales,
    drag-and-drop — où un pompage imbriqué est normalement sûr).
  - **Fix** : abandon de toute attente SYNCHRONE dans la commande.
    `export_pdf` lance l'opération via `PrintToPdfCompletedHandler::create`
    (construction SANS attendre, juste une closure appelée plus tard par
    WebView2) et retourne IMMÉDIATEMENT (le PDF n'est pas encore
    forcément écrit au moment où la commande répond) ; le VRAI résultat
    arrive plus tard via un évènement Tauri (`"pdf-export-result"`,
    payload `Option<String>` — `null` = succès, sinon message d'erreur),
    écouté côté frontend dans `App.tsx` (`handleExportPdf`, `listen()`
    à usage unique qui affiche un `messageDialog` de succès/échec). Aucune
    boucle de messages pompée nous-mêmes : la livraison du callback
    repose entièrement sur la boucle d'évènements EXISTANTE de
    l'application, jamais sur une seconde boucle concurrente pilotée
    depuis l'intérieur de la commande. **À RETENIR** : dans cette config
    Tauri/wry, toute API COM asynchrone à callback doit être traitée de
    cette façon (fire-and-forget + évènement Tauri côté retour), jamais
    attendue de façon bloquante à l'intérieur d'une commande `#[tauri::
    command]`, même via une primitive "faite pour ça" comme
    `wait_for_async_operation`.
  - **Frontend** : `fileService.ts` (`pickPdfSaveLocation` — dialogue
    natif Enregistrer sous, filtre `.pdf` ; `exportPdf(path)` — simple
    `invoke`), `App.tsx` (`handleExportPdf`), `TitleBar.tsx` (nouveau
    bouton, prop `onExportPdf`).
  - **Vérifié par un appel direct `invoke('export_pdf', …)`/`listen(...)`
    via Playwright** (sur le document de test jetable "Nouveau
    document.md", `withGlobalTauri: true` activé temporairement dans
    `tauri.conf.json` pour permettre cet appel direct — **repassé à
    `false` après coup**, cette option n'étant utile que pour ce test, pas
    nécessaire en usage normal où l'export passe par le bouton du ruban) :
    `invoke` résolu en 199ms (confirme que le blocage précédent est bien
    corrigé — à comparer à l'ancienne version qui ne revenait jamais),
    évènement `pdf-export-result` reçu avec `payload: null` (succès) dans
    la foulée. Fichier `.pdf` généré ensuite vérifié directement sur
    disque : en-tête `%PDF-1.4` et fin `startxref`/`%%EOF` corrects,
    539 Ko de contenu (page count non vérifiable par un simple `grep` sur
    `/Type /Page` — les PDF modernes de WebView2 utilisent des flux
    d'objets compressés, pas un texte PDF à plat — mais la taille et la
    structure confirment un fichier réellement écrit, pas un fichier vide
    ou tronqué). Non revérifié via le VRAI bouton du ruban + la VRAIE
    boîte de dialogue "Enregistrer sous" (limitation déjà connue du
    projet : un dialogue natif Windows ne peut pas être piloté de façon
    fiable par automatisation clavier/souris) — mais la commande Rust
    elle-même et le chemin évènement sont les mêmes dans les deux cas,
    seul le déclenchement diffère.
- **Correctif de l'affichage de la sélection multi-cellules (2026-10-13,
  même jour)**, remonté par l'utilisateur AVEC VIDÉO ("j'ai du mal a
  selectionner les ligne et colonne") sur son document réel (CCTP CVC —
  consulté en lecture seule pour l'enquête, jamais modifié). Investigation
  menée par extraction d'images de la vidéo (`opencv-python-headless`,
  même méthode que la fois précédente) : à chaque instant, une seule
  cellule à la fois apparaît surlignée (juste son TEXTE, pas la cellule
  entière) alors que la souris glisse verticalement sur plusieurs lignes —
  jamais un vrai bloc bleu couvrant toute la plage visée.
  - **Fausse piste explorée en premier, et bonne nouvelle au passage** :
    exposition temporaire de l'instance `editor` sur `window` (retirée
    après coup) pour inspecter `editor.state.selection` directement
    pendant un glisser-sélectionner RÉEL (`page.mouse.move` en ~20-40
    petits pas, pas un seul saut comme dans les tests précédents) — le
    modèle de sélection sous-jacent est en fait **PARFAITEMENT correct** :
    une vraie `CellSelection` grandit progressivement (2 cellules → 3 → 5)
    exactement comme attendu, et `mergeCells` ensuite fusionne
    correctement les 5 cellules en une seule (`rowspan="5"` vérifié sur la
    cellule résultante, texte des 5 cellules bien concaténé). Le bug
    n'était donc PAS dans la construction de la sélection (déjà corrigée
    le même jour, voir plus haut) ni dans les commandes de tableau — **100%
    un problème d'AFFICHAGE** de la surbrillance, qui donnait l'impression
    fausse à l'utilisateur que son glisser ne fonctionnait pas.
  - **Cause réelle** : `computeSelectionRects` (`selectionHighlight.ts`)
    ne connaissait qu'un seul cas — une sélection de TEXTE classique
    `[from, to]`, traitée comme une plage CONTINUE sur laquelle on pose un
    `Range` DOM et on lit `Range.getClientRects()`. Une `CellSelection`
    n'est PAS une plage continue : ses cellules peuvent être séparées dans
    le document par le contenu d'autres colonnes non sélectionnées (glisser
    verticalement traverse plusieurs `<tr>`). Passer `[selection.from,
    selection.to]` (l'englobant) à cette fonction produisait un `Range` DOM
    qui ne captait random qu'une partie du trajet (2 rectangles au lieu de
    5, confirmé par instrumentation).
  - **Fix** : nouvelle fonction dédiée `computeCellSelectionRects` dans
    `selectionHighlight.ts`, un rectangle par CELLULE ENTIÈRE (pas par ligne
    de texte) — réutilise `CellSelection.forEachCell` (déjà utilisée
    ailleurs, voir `applyToSelectedCells`) pour itérer les cellules
    réellement sélectionnées, retrouve le `<table>` cloné via son
    `SRC_POS_ATTR` (porté par le TABLEAU ENTIER, premier bloc de niveau
    supérieur, pas par chaque cellule individuellement), puis localise la
    cellule correspondante dans le clone par SON INDEX [ligne, colonne]
    (fiable : le clone est un `cloneNode(true)` exact du tableau entier,
    même structure garantie) plutôt que par une nouvelle traduction de
    coordonnées — la cellule CLONÉE étant déjà l'élément RÉELLEMENT
    affiché à l'écran, on utilise directement son `getBoundingClientRect()`
    (pas besoin de reporter un décalage depuis un "original" invisible,
    contrairement à `caretPosition.ts`/au reste de cette fonction). `
    computeSelectionRects` dispatch maintenant sur `selection instanceof
    CellSelection` (nouveau paramètre : la vraie `selection`, plus
    seulement `from`/`to`).
  - **Piège rencontré PENDANT ce correctif, pas le bug lui-même** : la
    première version de `computeCellSelectionRects` cherchait le clone via
    `canvas.querySelector('table[data-src-pos="…"]')` — restreint à la
    balise `<table>`. Résultat : `hasClone: false` dans les logs de debug,
    alors que `hasOriginal: true`. Cause : `Table.configure({resizable:
    true})` (voir `MarkdownEditor.tsx`) fait envelopper `<table>` par
    Tiptap dans un `<div class="tableWrapper">` pour les poignées de
    redimensionnement — c'est ce DIV, pas `<table>` lui-même, qui porte
    `SRC_POS_ATTR` (attribut posé sur `view.nodeDOM(pos)`, qui pour un
    nœud "table" renvoie le wrapper, pas l'élément `<table>` interne).
    **À RETENIR pour tout futur code qui cherche le clone d'un tableau par
    `SRC_POS_ATTR`** : chercher l'attribut SANS restreindre la balise, puis
    redescendre avec `.querySelector('table')` si l'élément trouvé n'est
    pas déjà `<table>` lui-même.
  - **Vérifié par Playwright/CDP** avec un VRAI glisser à petits pas
    (20-40 étapes intermédiaires, pas un saut unique comme dans les tests
    précédents — plus proche d'un geste de souris réel) sur le document de
    test habituel : 5 rectangles affichés pour une sélection verticale de
    5 lignes dans une colonne (positions `top` croissantes, ~39px d'écart
    — cohérent avec la hauteur d'une ligne), 2 rectangles pour une
    sélection horizontale de 2 cellules dans une ligne. `npx tsc --noEmit`
    propre.
- **Présets de bordures, alignement vertical de cellule, et menu contextuel
  clic-droit sur les tableaux (2026-10-13)**, sur demande explicite de
  l'utilisateur après avoir regardé une deuxième fois les outils de tableau
  de `CasualOffice/docs` (`packages/react/src/components/ui/
  TableMoreDropdown.tsx`, `TableOptionsDropdown.tsx`, `TextContextMenu.tsx`
  dans `../pagina-docx-engine`) : "oui ça c'est à faire, mais aussi c'est le
  menu clic droit et la façon de sélection des cellules colonne ligne qui
  est intéressante". **Vérifié qu'il n'existe PAS de poignée dédiée de
  sélection ligne/colonne** dans leur code (pas de "marge cliquable" façon
  Google Docs) — juste le glisser-sélectionner classique à travers les
  cellules, déjà repris et corrigé le même jour (voir section
  "Correctif de la fusion de cellules" plus bas) : rien de plus à reprendre
  de ce côté-là, seuls les présets/alignement vertical/menu contextuel sont
  de vraies nouveautés.
  - **Alignement vertical de cellule** (haut/milieu/bas) : nouvel attribut
    `verticalAlign` dans `TableCellStyle.ts` (même schéma que
    `backgroundColor`/les 4 bordures déjà en place — `renderHTML` →
    `{ style: "vertical-align: …" }`), `hasAdvancedStyle` dans
    `TableMarkdown.ts` étendu pour en tenir compte (bascule HTML au
    repli, comme les autres attributs avancés). Nouvelle méthode
    `setCellVerticalAlign` sur `MarkdownEditorHandle`/`ToolbarActions`,
    réutilise `applyToSelectedCells` (déjà existante) pour s'appliquer à
    toute une sélection multi-cellules. 3 nouveaux boutons dans le groupe
    "Tableau" de l'onglet "Format avancé".
  - **Présets de bordures façon Word** ("Tout"/"Extérieur"/"Intérieur"/
    "Aucune") dans `TableBorderDialog` — en plus des 4 cases à cocher
    par côté déjà existantes, pas à leur place. Nécessite une vraie
    géométrie de sélection (pas juste "appliquer le même patch à chaque
    cellule", ce que fait `applyToSelectedCells`) : nouvelle fonction
    `applyBorderPreset` dans `MarkdownEditor.tsx`, qui utilise
    `TableMap` (importé de `@tiptap/pm/tables`, déjà utilisé en interne
    par `CellSelection` — vérifié dans le code source de
    `prosemirror-tables` que `TableMap.get(table).rectBetween(...)`
    donne le rectangle {left,top,right,bottom} de la sélection ENTIÈRE et
    `.findCell(offset)` celui d'UNE cellule) pour comparer, cellule par
    cellule, sa position à celle du rectangle global : un côté est
    "extérieur" si la cellule touche le bord correspondant du rectangle
    de sélection, "intérieur" sinon (donc partagé avec une autre cellule
    sélectionnée). Nouvelle fonction `resolveCellSelection` : construit
    une vraie `CellSelection` à partir de la cellule unique sous le
    curseur si ce n'en est pas déjà une (`CellSelection.create(doc,
    cellPos, cellPos)`, un rectangle 1×1) — les présets "Tout"/"Aucune"
    fonctionnent donc aussi bien sur une seule cellule que sur une vraie
    sélection glissée. Nouvelle méthode `setCellBorderPreset` sur le
    handle/`ToolbarActions`.
  - **Menu contextuel clic-droit sur les cellules de tableau**
    (`TableContextMenu`, nouveau composant dans `MarkdownEditor.tsx`) —
    inspiré de `TextContextMenu.tsx` de CasualOffice/docs (qui injecte les
    mêmes actions de tableau dans LEUR menu clic-droit générique), mais en
    plus simple : Pagina n'avait jusqu'ici AUCUN menu contextuel du tout,
    donc un menu DÉDIÉ qui n'apparaît QUE dans un tableau (le menu natif
    du navigateur reste disponible partout ailleurs — texte normal,
    uniquement intercepté quand le clic tombe dans une cellule via
    `findCellPos`). 9 actions : insérer/supprimer ligne, insérer/supprimer
    colonne, fusionner/scinder, supprimer le tableau — les mêmes commandes
    natives de `@tiptap/extension-table` déjà exposées dans le ruban,
    appelées ici directement sur l'instance `editor` (pas besoin de
    repasser par `MarkdownEditorHandle`/`ToolbarActions`, ce composant y a
    déjà un accès direct). Préserve une `CellSelection` déjà en place
    (glisser-sélectionner PUIS clic droit) pour que "Fusionner" agisse
    dessus, sinon positionne le curseur dans la cellule cliquée comme un
    clic normal. **Seule pièce d'UI de ce fichier gérée en `useState`
    React classique** plutôt qu'en refs/DOM impératif (tout le reste de
    `MarkdownEditor.tsx` est délibérément impératif, voir l'architecture
    de pagination) — un simple overlay ponctuel sans lien avec la
    mécanique de repaint, donc sans risque pour cette convention.
  - **Vérifié par Playwright/CDP** sur le document de test habituel
    ("Nouveau document.md", jamais le document réel de l'utilisateur) :
    les 9 actions du menu contextuel listées correctement, fermeture à
    Échap confirmée ; alignement vertical "milieu" appliqué et vérifié
    via `getComputedStyle` ; préset "Tout" (bordure solide sur les 4
    côtés d'une cellule) et préset "Extérieur" sur une sélection
    glissée de 4 cellules, tous deux vérifiés par `getComputedStyle`.
    **Piège méthodologique rencontré** : un premier essai a échoué
    (`actions?.setCellVerticalAlign is not a function`) — l'objet
    `actions` de `App.tsx` (recréé dans un `useEffect` gardé par
    `activeTab?.path`, voir le contrat `ToolbarActions`) était resté
    périmé après l'accumulation de plusieurs cycles de HMR Vite pendant
    cette session de travail très longue ; un redémarrage complet et
    propre de `tauri dev` (pas un simple `page.reload()`, qui aurait pu
    retomber sur le bug `shared_worker` déjà documenté) a suffi à
    repartir d'un état frais et confirmer que tout fonctionne. `npx tsc
    --noEmit` propre.
- **Correctif majeur : "la page saute/descend quand on tape en haut de page,
  le curseur disparaît" (2026-10-13)**, remonté par l'utilisateur ("je click
  sur une ligne en haut de pages, et quand je commence a ecrire la pages
  bouge des fois je ne voie plus le curseur mais ca ecrie, et defois je me
  retrouve en bas de pages"). **Investigation la plus longue et la plus
  instrumentée de tout le projet** — plusieurs fausses pistes éliminées une
  par une avant la vraie cause, méthode à retenir pour la prochaine fois
  qu'un bug de scroll/curseur résiste aux hypothèses habituelles :
  1. **Vidéo fournie par l'utilisateur** (`.mp4`, chemin dans son dossier
     Documents) : lue en extrayant des frames avec `opencv-python-headless`
     (installé via pip pour l'occasion — aucun lecteur vidéo/`ffmpeg`
     disponible sur la machine) plutôt qu'en essayant de "regarder" le
     fichier directement (l'outil `Read` refuse tout binaire non
     image/PDF). Comparer frame par frame a permis de confirmer
     QUANTITATIVEMENT le bug en quelques secondes : entre deux frames
     distantes de 0,1s, le compteur de mots passe de 1867 à 1868 (un
     caractère vient d'être tapé) et la vue bascule du texte visible vers
     une zone blanche portant le pied de page — sur la MÊME page (le
     numéro de page affiché ne change pas), donc un déplacement de scroll
     à l'intérieur de la page, pas un changement de page.
  2. **Fausse piste éliminée : le "scroll anchoring" natif du navigateur.**
     `paintPages.ts` fait un `canvas.replaceChildren(...)` à chaque frappe
     (toutes les pages visibles sont détruites/recréées) — un terrain
     classique pour ce mécanisme navigateur. `overflow-anchor: none` posé
     sur `.xmd-page-wrap` (déjà documenté comme correctif à part entière
     plus bas) : amélioration réelle mais **insuffisante** — le bug
     persistait après ce correctif, confirmé par une nouvelle vidéo de
     l'utilisateur prise APRÈS son application.
  3. **Instrumentation live en direct, par itérations successives**
     (injection de JS via `page.evaluate` sur la session Playwright/CDP,
     scripts jetables supprimés après coup) — chaque hypothèse testée en
     conditions réelles sur le document de l'utilisateur, jamais en
     devinant :
     - Écoute de l'évènement `scroll` sur `.xmd-page-wrap` seule : rien
       capté sur plusieurs fenêtres de plusieurs minutes — PIÈGE
       MÉTHODOLOGIQUE rencontré à répétition : un script Playwright lancé
       en arrière-plan avec un délai fixe (`setTimeout`) peut tout à fait
       expirer AVANT que l'utilisateur n'ait eu le temps de lire la
       consigne et d'agir, surtout en changeant de fenêtre — vérifié a
       posteriori via `ps aux` que le process Node était bien terminé.
       **Toujours prévoir une fenêtre d'instrumentation large (5-6 min)
       et confirmer explicitement avec l'utilisateur AVANT de lire le
       log**, plutôt que de supposer qu'il a eu le temps d'agir.
     - Une fois la fenêtre correctement synchronisée : le `scrollTop`
       CHANGE bel et bien réellement (confirmé par petits incréments
       progressifs, ex. 635 → 2337 → 3326 → 2883px) — mais AUCUN appel
       JS à `Element.prototype.scrollIntoView` (patché pour logguer tout
       appel, sur TOUT élément) ni AUCUNE écriture directe de
       `wrap.scrollTop` (setter de la propriété redéfini pour logguer
       toute assignation) ne sont jamais captés en parallèle — élimine
       à la fois "un `scrollIntoView()` JS explicite quelque part" et
       "une assignation directe à `scrollTop`".
     - Fausse piste éliminée : un clic accidentel sur un lien d'ancre de
       sommaire ou une référence de note de bas de page (les deux seuls
       endroits du code qui appellent explicitement `scrollIntoView({
       behavior: "smooth"} )`, dont le motif en petits paliers progressifs
       ressemblait beaucoup au `scrollTop` observé) — instrumentation du
       `mousedown` confirmant un clic strictement sur un `<P>` normal,
       sans ancre ni note à proximité.
  4. **Cause réelle, trouvée en relisant le code source de
     `prosemirror-view`** (pas une supposition) : `EditorView.focus()`
     utilise bien en interne `focusPreventScroll()` (confirmé en lisant
     `node_modules/prosemirror-view/dist/index.js` — le projet le savait
     déjà, voir plus bas, correctif du "feuilles qui bougent" du
     2026-09-13), MAIS ce n'est que pour l'évènement de **focus initial**
     (un seul appel, au premier clic). Hors, `EditorView.updateState()`
     (appelée en interne à CHAQUE transaction, donc à CHAQUE caractère
     tapé) appelle aussi `selectionToDOM(this)` — qui repositionne la
     VRAIE sélection native du navigateur (`Selection.addRange`/
     équivalent) dans la zone éditable à chaque frappe, **sans aucune
     protection équivalente contre le scroll**. Déplacer une sélection de
     texte native dans une zone `contentEditable` peut, indépendamment de
     tout appel explicite à `focus()` ou `scrollIntoView()`, déclencher un
     réflexe natif du moteur de rendu "faire défiler l'ancêtre scrollable
     pour révéler la sélection" — un comportement bas niveau, pas une API
     JS interceptable par un monkey-patch de `Element.prototype`.
     **Le vice architectural exact** : `.xmd-live-editor-host` (la zone
     invisible éditable) est positionnée en `position: absolute; top: 0`
     — mais c'est un DESCENDANT DIRECT de `.xmd-page-wrap`, le conteneur
     qui défile (`overflow-y: auto`) ! `top: 0` en `absolute` est relatif
     au bloc englobant **non scrollé** (la position du contenu total,
     pas du viewport visible) — dès que l'utilisateur défile vers le bas
     du document (ex. scrollTop ≈ 2700px pour être sur la page 4), la
     zone invisible se retrouve RÉELLEMENT, en coordonnées de document, à
     des MILLIERS de pixels AU-DESSUS du viewport actuellement visible.
     Taper un caractère y repositionne la sélection native → le navigateur
     tente de "révéler" cette sélection bien réelle mais complètement hors
     champ → fait défiler `.xmd-page-wrap` vers le haut du document pour
     compenser → d'où le saut (parfois partiel, selon l'algorithme interne
     du moteur de rendu pour choisir combien défiler, expliquant le
     caractère "imprévisible" rapporté par l'utilisateur, "des fois... et
     des fois...").
  5. **Fix** (`MarkdownEditor.css`, `.xmd-live-editor-host`) :
     `position: absolute` → `position: fixed`. Une fois `fixed`, la zone
     invisible est ancrée au VIEWPORT lui-même (pas au contenu scrollable
     de `.xmd-page-wrap`) — elle reste donc TOUJOURS verticalement dans
     les limites du viewport (seul son décalage horizontal extrême,
     `left: -5000px`, la rend invisible à l'écran), quel que soit le
     niveau de défilement du document. Plus aucun ancêtre scrollable n'a
     de raison de bouger pour "révéler" une sélection qui, à ses yeux, est
     déjà dans les clous verticalement. `getBoundingClientRect()` (utilisé
     partout dans `resolveClickPosition.ts`/`caretPosition.ts`/
     `selectionHighlight.ts` pour traduire entre l'éditeur invisible et la
     couche peinte) reste correct sans adaptation : il renvoie toujours des
     coordonnées relatives au VIEWPORT, que l'élément soit en `absolute`
     ou en `fixed` — changement de positionnement totalement transparent
     pour tout le reste de l'architecture de pagination.
  6. **Vérifié directement par l'utilisateur** sur son document réel après
     application du correctif (HMR Vite, pas besoin de relancer l'app) :
     clic en haut de page + frappe de plusieurs caractères → confirmé
     "ça marche", plus de saut. `npx tsc --noEmit` propre.
  - **À RETENIR pour toute future enquête de ce type** : `focusPreventScroll`
    protège uniquement l'évènement de focus, PAS les repositionnements de
    sélection ultérieurs (`selectionToDOM`, appelée à chaque transaction) —
    si un élément contentEditable critique vit à l'intérieur d'un
    conteneur qui défile, le positionner en `fixed` (ancré au viewport)
    plutôt qu'en `absolute` (ancré au contenu scrollable) élimine la
    classe ENTIÈRE de bugs de scroll involontaire liés à la sélection
    native, pas seulement ceux liés au focus.
- **Correctif de la fusion de cellules glissées-sélectionnées (2026-10-10)**,
  remonté par l'utilisateur : "le curseur soit dans le tableau et au
  changement de résolution de l'écran, la sélection n'est pas toujours
  fiable dans le tableau, je pense que c'est un problème pour la fusion" —
  en demandant explicitement d'aller regarder comment le projet open
  source d'origine (`CasualOffice/docs`, forké dans
  `../pagina-docx-engine`, sert de référence de pagination depuis le
  début) traite ce cas précis.
  - **Cause RÉELLE, plus fondamentale que "la résolution d'écran" en
    elle-même** : notre glisser-sélectionner sur la couche peinte
    (`onMouseDown`/`onMouseMove` dans `MarkdownEditor.tsx`) appelait
    TOUJOURS `editor.commands.setTextSelection({from, to})`, même en
    glissant à travers plusieurs cellules d'un tableau — ProseMirror
    normalise alors ça en simple sélection de TEXTE qui chevauche les
    cellules, JAMAIS en une vraie `CellSelection` (type dédié de
    `prosemirror-tables`). Or `applyToSelectedCells` (utilisée par
    `mergeCells`/`setCellBackgroundColor`/`setCellBorder`, voir plus bas
    dans ce fichier) ne reconnaît et n'agit sur plusieurs cellules QUE si
    `state.selection instanceof CellSelection` — sinon elle retombe sur "une
    seule cellule, celle du curseur". Résultat : glisser-sélectionner
    plusieurs cellules puis cliquer "Fusionner" n'avait, EN PRATIQUE,
    jamais vraiment fonctionné de façon fiable, quelle que soit la
    résolution d'écran — le changement de résolution rendait juste le
    symptôme plus visible/reproductible par coïncidence (selon où
    atterrissaient `from`/`to`), sans en être la cause.
  - **Comparaison avec `CasualOffice/docs`** (`packages/react/src/
    paged-editor/PagedEditor.tsx`) : leur architecture (éditeur invisible +
    couche peinte, identique dans son principe à la nôtre) détecte
    explicitement ce cas — au `mousedown`, ils retrouvent la position de la
    CELLULE ancre (`findCellPosFromPmPos`, marche les ancêtres de la
    position résolue jusqu'au nœud `tableCell`/`tableHeader`, renvoie
    `$pos.before(depth)`) et la stockent dans une ref
    (`cellDragAnchorPosRef`) ; à chaque `mousemove`, ils refont la même
    recherche pour la position courante et, si elle diffère de l'ancre,
    appellent `hiddenPMRef.current.setCellSelection(anchorCellPos,
    currentCellPos)` — une vraie construction de `CellSelection.create(doc,
    anchorCell, headCell)` — PLUTÔT qu'un `setTextSelection`.
  - **Fix, repris à l'identique** : nouvelle fonction `findCellPos(doc,
    pos)` dans `MarkdownEditor.tsx` (même algorithme que leur
    `findCellPosFromPmPos`, adapté à notre type `Editor["state"]["doc"]`).
    `onMouseDown` retient en plus la position de cellule de l'ancre
    (`cellAnchorPos`) ; `onMouseMove` recalcule la cellule courante à
    chaque déplacement et, si elle diffère de l'ancre, construit
    `CellSelection.create(editor.state.doc, cellAnchorPos, cellPos)` et la
    dispatche directement (`editor.state.tr.setSelection(sel)`) — repli sur
    `setTextSelection` normal dans tous les autres cas (hors tableau, ou
    `CellSelection.create` qui lève une exception si les deux cellules ne
    sont pas dans le même tableau). `CellSelection` déjà importée de
    `@tiptap/pm/tables` (ajoutée pour `applyToSelectedCells` lors de la
    fonctionnalité précédente) — vérifié dans le code source installé de
    `prosemirror-tables` que `CellSelection.create` attend exactement une
    position "juste avant le nœud cellule" (`$pos.before(depth)`), ce que
    `findCellPos` renvoie déjà — pas une supposition.
  - **Sur le volet "résolution d'écran"** : vérifié que la correction de
    largeur de l'éditeur invisible (`MarkdownEditor.tsx`, le bloc qui
    aligne `liveHost.style.width` sur la largeur RÉELLEMENT rendue de
    `.xmd-page-content`, voir plus bas dans ce fichier) est déjà recalculée
    à CHAQUE `repaint()` (donc à chaque frappe) et surveillée par un
    `ResizeObserver` — un vrai changement de taille de fenêtre la
    redéclenche automatiquement. Un changement de mise à l'échelle DPI
    Windows SEUL (déplacer la fenêtre vers un autre écran à résolution
    différente, sans redimensionner la fenêtre elle-même) ne devrait PAS
    perturber cette mesure : les navigateurs expriment les largeurs
    `getBoundingClientRect()` en pixels CSS, indépendants du DPI par
    construction — la dérive constatée par l'utilisateur est donc, selon
    toute vraisemblance, entièrement expliquée par le bug de
    `CellSelection` manquante ci-dessus, pas par un second problème de
    mesure lié à l'écran.
  - **Non revérifié visuellement par Playwright/CDP** à l'instant de ce
    correctif (aucune fenêtre `tauri dev` disponible pendant cette
    session) — `npx tsc --noEmit` propre. **À tester à la prochaine
    occasion** : glisser-sélectionner plusieurs cellules d'un tableau
    (idéalement sur deux résolutions/échelles d'affichage différentes),
    cliquer "Fusionner" dans l'onglet Format avancé, confirmer que
    exactement les cellules visuellement sélectionnées sont fusionnées.
- **Installeur 0.4.6 (2026-10-02)**, sur demande explicite de l'utilisateur
  ("fais moi les exe d'install"). Version choisie en accord avec lui
  (incrément mineur, cohérent avec le rythme des précédents installeurs —
  ajout de fonctionnalités sans rupture, pas un saut à 0.5.0) : `0.4.5` →
  `0.4.6` dans les 3 endroits synchronisés (`package.json`,
  `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`). Correctif
  immédiatement précédent pris en compte : le bouton d'insertion de
  tableau manquant dans le groupe "Tableau" de l'onglet "Format avancé"
  (voir juste en dessous), remonté par l'utilisateur ("je n'arrive pas
  faire des tableaux évolués" — en creusant, le vrai problème était qu'il
  n'y avait tout simplement aucun moyen de CRÉER un tableau depuis cet
  onglet, seulement des outils d'édition supposant un tableau déjà
  présent). `npx tauri build` lancé après `npx tsc --noEmit` propre ; les
  deux anciens installeurs `0.4.5` supprimés de `releases/`, remplacés par
  `Pagina_0.4.6_x64-setup.exe`/`Pagina_0.4.6_x64_en-US.msi`, liens du
  `README.md` mis à jour en conséquence.
- **Édition de tableau avancée (HTML) dans l'onglet "Format avancé"
  (2026-09-27, même jour que l'éditeur de tableau ci-dessous)**, sur
  demande explicite de l'utilisateur : "on va faire la même chose en
  Format avancé avec de l'écriture d'un tableau en HTML... on doit
  pouvoir retrouver toutes les fonctions comme dans Word (fusion, couleur
  des cellules, édition des bordures...)". Une question de clarification
  posée avant de coder (niveau de finesse des bordures) — réponse :
  "Complet façon Word : par côté" (haut/droite/bas/gauche indépendants,
  pas une seule bordure globale).
  - **Fusion/scission de cellules** : `mergeCells`/`splitCell` sont des
    commandes déjà fournies nativement par `@tiptap/extension-table` (le
    même paquet qui alimente déjà l'onglet contextuel "Tableau" côté
    Markdown standard) — aucune nouvelle logique, juste exposées dans un
    nouveau groupe "Tableau" de l'onglet "Format avancé".
  - **Couleur de fond + bordures par côté** : nouvelle extension
    `src/ui/Editor/extensions/TableCellStyle.ts` (`TableCellStyled`/
    `TableHeaderStyled`, étendent `@tiptap/extension-table-cell`/
    `-table-header` — remplacent les imports directs de ces paquets dans
    `MarkdownEditor.tsx`) : ajoute les attributs `backgroundColor`,
    `borderTop`/`borderRight`/`borderBottom`/`borderLeft` (chaînes CSS
    complètes, ex. `"2px dashed #343334"`), chacun avec son propre
    `renderHTML` retournant `{ style: "…" }` — **vérifié dans le code
    source de `mergeAttributes` (`@tiptap/core`) que plusieurs
    attributs retournant chacun une clé `style` sont correctement
    FUSIONNÉS** (pas juste le dernier qui gagne), donc pas besoin d'un
    seul `renderHTML` combiné à la main pour le nœud entier.
  - **Application à une sélection multi-cellules** : `editor.commands.
    updateAttributes` ne met à jour qu'un seul nœud (celui de la position
    courante) — insuffisant pour "appliquer une bordure à toutes les
    cellules sélectionnées" façon Word (glisser-sélectionner un
    rectangle). Nouvelle fonction `applyToSelectedCells` (dans
    `MarkdownEditor.tsx`) : si la sélection est une vraie `CellSelection`
    (import `@tiptap/pm/tables`), parcourt `forEachCell` et pose
    `tr.setNodeMarkup` sur chacune ; sinon (simple curseur), retrouve la
    cellule ancêtre englobante et l'applique à elle seule. Contrairement à
    la renumérotation automatique des titres, `addToHistory: false` n'est
    PAS posé ici : c'est une action explicite de l'utilisateur, qui doit
    rester annulable par Ctrl+Z comme les autres actions du ruban.
  - **Repli HTML automatique à la sauvegarde** : le mécanisme existait déjà
    dans `TableMarkdown.ts` (`isMarkdownSerializable`) pour la fusion de
    cellules — un tableau avec `colspan`/`rowspan` > 1 bascule déjà en
    `<table>` HTML brut plutôt qu'en syntaxe GFM (`Markdown.configure({html:
    true})` déjà actif dans `MarkdownEditor.tsx`). **Étendu** : la même
    fonction bascule maintenant AUSSI dès qu'une cellule a une
    `backgroundColor` ou une bordure custom posée (nouvelle fonction
    `hasAdvancedStyle`, même famille de test que `hasSpan` déjà présent) —
    un tableau qui n'utilise AUCUNE de ces fonctions continue de
    s'enregistrer en GFM classique comme avant, rien ne change pour les
    tableaux simples ; c'est un `<table>` HTML STANDARD dans les deux cas
    (pas un format propriétaire), donc toujours lisible ailleurs
    (GitHub, VS Code, Obsidian…), juste plus en syntaxe Markdown pure.
  - **UI** : nouveau groupe "Tableau" dans l'onglet "Format avancé"
    (`Toolbar.tsx`) — boutons Fusionner/Scinder, un sélecteur de couleur de
    fond (même schéma de swatch que "Couleur du texte", chevron décoratif),
    et un lanceur `›` ouvrant le nouveau dialogue `TableBorderDialog`
    (`src/ui/TableBorders/`, même gabarit visuel que `HeadingStyleDialog`/
    `PageSetupDialog` — mais contrairement à eux, n'édite PAS une config
    persistée dans `PageLayoutSettings` : chaque clic "Appliquer"/"Retirer"
    agit IMMÉDIATEMENT sur la sélection courante de l'éditeur, rien n'est
    mémorisé au-delà de la durée de vie du dialogue). Le dialogue expose
    4 cases à cocher (un côté peut être décoché pour ne pas le toucher),
    un style (continue/tiretée/pointillée/double), une épaisseur et une
    couleur — "Retirer la bordure" pose `null` sur les côtés cochés,
    "Appliquer" compose la chaîne CSS et appelle
    `ToolbarActions.setCellBorder(sides, css)`.
  - **`PaginaLight.tsx`** (même contrat `ToolbarActions`, doit rester
    synchronisé) : les 4 nouvelles actions sont câblées sur les mêmes
    méthodes du handle, bien que le groupe ne soit jamais visible en mode
    `leger` (un seul onglet, pas de "Format avancé") — cohérent avec les
    autres actions de Format avancé déjà câblées mais inutilisées côté UI
    légère.
  - **Vérification** : `npx tsc --noEmit` propre après chaque étape.
    Vérification VISUELLE par Playwright/CDP tentée mais **PAS aboutie**
    cette fois : la fenêtre `tauri dev` ouverte depuis le début de cette
    session de travail (utilisée par l'utilisateur lui-même pour regarder
    l'app, voir plus haut) est repassée en état minimisé/hors-focus
    pendant la vérification (`window.innerWidth`/`innerHeight` mesurés à
    146×20 via CDP, `elementFromPoint` renvoyant `null`) — impossible de
    simuler des clics fiables dans cet état, et redimensionner/refocaliser
    la fenêtre de force aurait pu perturber l'utilisateur en train de la
    regarder. **Confiance placée à la place sur** : `mergeCells`/`splitCell`
    sont des commandes NATIVES de `@tiptap/extension-table` (déjà éprouvées
    ailleurs dans le projet, aucune logique réécrite) ; la fusion de
    `style` par `mergeAttributes` vérifiée directement dans le code source
    installé de `@tiptap/core` (pas une supposition) ; le mécanisme de
    repli HTML (`isMarkdownSerializable`) est une extension d'un chemin
    déjà testé et validé pour la fusion de cellules (voir plus haut dans ce
    fichier, section "Complément de couverture Markdown"). **À revérifier
    visuellement à la prochaine occasion avec une fenêtre disponible** :
    fusion de cellules glissée-sélectionnées, couleur de fond appliquée,
    dialogue Bordures (cocher/décocher un côté, bascule HTML confirmée par
    lecture du `.md` après sauvegarde d'un tableau avec bordure).
- **Éditeur de tableau Markdown, avec onglet de ruban contextuel façon
  "Outils de tableau" de Word (2026-09-27)**, sur demande explicite de
  l'utilisateur : plan complet exposé et validé avant tout code (une seule
  question de clarification posée, "bascule automatique sur l'onglet
  Tableau (comme Word)" — confirmé "oui").
  - **Nouvel onglet contextuel "Tableau"** (`RibbonTab` étendu à
    `"tableau"` dans `Toolbar.tsx`) : n'apparaît dans la barre d'onglets
    QUE lorsque le curseur est dans un tableau (`EditorStats.insideTable`,
    nouveau champ calculé via `editor.isActive("table")`, remonté depuis
    `MarkdownEditor.tsx` aux 4 mêmes points que `activeBlockStyle` — dans
    `onUpdate`, `getStats()`, `onSelectionUpdate`, et le suivi de page au
    défilement). **Bascule automatique sur cet onglet au FRONT MONTANT
    seulement** (`wasInsideTableRef`, comparaison avant/après à chaque
    changement de `insideTable`) : entrer dans un tableau y bascule
    toujours, mais si l'utilisateur clique ensuite sur un autre onglet SANS
    sortir du tableau, on ne l'y reramène pas de force à la frappe
    suivante — seule une vraie sortie du tableau (front descendant) referme
    l'onglet et retombe sur "Accueil" (et seulement si "Tableau" était bien
    affiché : revenir soi-même sur "Accueil" en restant dans le tableau
    n'est pas contrarié). Non câblé en version légère (`leger` — voir
    `PaginaLight.tsx`, qui n'a qu'un seul onglet de toute façon).
  - **Sélecteur de taille par grille survolée** (`TableSizePicker`,
    nouveau composant dans `Toolbar.tsx`, même schéma dropdown que
    `HeadingPicker`/`VariablePicker`/`EmojiPicker` — état `open` +
    `useRef`/`mousedown` pour fermer au clic extérieur) — remplace l'ancien
    bouton plat qui insérait toujours un tableau 3×3 fixe. Grille 8×6,
    survoler une cellule surligne toute la zone en haut-à-gauche du
    pointeur (comme Word) et affiche un libellé "R × C" ; cliquer insère
    exactement cette taille. `MarkdownEditorHandle.insertTable` change de
    signature (`() => void` → `(rows: number, cols: number) => void`),
    répercuté dans `ToolbarActions` et dans **`PaginaLight.tsx`** (même
    contrat `ToolbarActions`, doit rester synchronisé) et `App.tsx`.
  - **Commandes du nouvel onglet** — strictement des commandes déjà
    fournies nativement par `@tiptap/extension-table` (juste exposées,
    aucune logique nouvelle à écrire) : groupes "Lignes" (insérer
    au-dessus/en dessous, supprimer), "Colonnes" (insérer à
    gauche/droite, supprimer), "Alignement" (réutilise le composant
    `AlignIcon` déjà existant + l'action `setTextAlign` déjà câblée sur
    l'alignement de colonne via `TableMarkdown.ts`, voir plus bas dans ce
    fichier — rien de neuf à sérialiser), "Tableau" (supprimer tout le
    tableau). **Explicitement exclu, sur demande directe de
    l'utilisateur** ("pas de forme évoluée pour l'instant (pas html)") :
    fusion/scission de cellules, largeurs de colonne personnalisées — tout
    ce qui nécessiterait de sortir du Markdown/GFM standard.
  - **Vérifié par Playwright/CDP** contre l'app réelle relancée à neuf
    (aucun dossier de travail ouvert — document "Nouveau document.md"
    jamais enregistré, donc aucun risque pour un fichier réel de
    l'utilisateur) : grille 8×6 correctement dénombrée, survol de la
    cellule (3,4) affiche bien "3 × 4" et insère un tableau 3 lignes × 4
    colonnes ; cliquer dans une cellule peinte fait apparaître l'onglet
    "Tableau" ET le sélectionne automatiquement ; ajout d'une ligne
    (3→4) et d'une colonne (4→5) confirmés par comptage réel des `<tr>`/
    `<td>` peints ; alignement "Centrer" appliqué à la colonne
    (`text-align: center` vérifié par `getComputedStyle`) ; suppression du
    tableau fait disparaître l'onglet contextuel. Toutes les frappes de
    test annulées (`Ctrl+Z` en boucle) avant de rendre la main, document
    jamais sauvegardé sur disque.
- **Ouvrir un fichier directement (sans dossier), Enregistrer sous, et
  association de fichiers Windows (2026-09-27)**, sur demande explicite de
  l'utilisateur : "ouvrir un dossier est un bon moyen d'ouvrir plusieurs
  fichiers, mais il faudrait aussi 'ouvrir un fichier' pour pouvoir ouvrir
  des fichiers directement depuis Windows, et un 'enregistrer sous'".
  - **"Ouvrir un fichier…"** (`fileService.pickFiles`, bouton 📄 dans
    `TitleBar.tsx`, entre Nouveau et Ouvrir un dossier) : sélection
    multiple de `.md`/`.xmd` via le dialogue natif, sans dépendre d'un
    dossier de travail déjà ouvert — `tabsStore.openFile` accepte déjà
    n'importe quel chemin absolu tel quel, aucun changement nécessaire de
    ce côté.
  - **"Enregistrer sous…"** (`fileService.pickSaveLocation` + nouvelle
    action `tabsStore.saveTabAs`, bouton 📤 juste après Enregistrer) :
    écrit le contenu actuel à un nouvel emplacement (même
    `withDocumentConfig`/mise en page que `saveTab`) puis bascule sur un
    nouvel onglet pour ce chemin — l'onglet d'origine reste ouvert
    inchangé (comportement standard "dupliquer puis continuer sur la
    copie", pas de renommage de l'onglet existant). Permission
    `dialog:allow-save` ajoutée (le réflexe "vérifier la permission
    dédiée" est maintenant systématique après les mésaventures
    `window.print`/`window.confirm`/glisser de fenêtre de la session
    précédente).
  - **Association de fichiers Windows + double-clic depuis l'Explorateur**
    — la partie la plus structurante :
    1. `bundle.fileAssociations` dans `tauri.conf.json` (`.md` et `.xmd`,
       `"role": "Editor"`) : enregistré par l'installeur NSIS/MSI, permet
       "Ouvrir avec → Pagina" et de définir Pagina comme application par
       défaut pour ces extensions.
    2. **Nouveau module Rust `src-tauri/src/startup_files.rs`** : au
       premier lancement, les arguments de `std::env::args()` ressemblant
       à un vrai chemin `.md`/`.xmd` existant sont filtrés
       (`filter_openable_args`, exclut `argv[0]` — toujours le chemin de
       l'exe lui-même) et stockés dans un état Tauri partagé
       (`PendingOpenFiles`, `Mutex<Vec<String>>`) ; une commande
       `pending_open_files` les "tire" une seule fois (`mem::take`) —
       PAS un évènement émis depuis Rust vers le frontend, qui ne peut pas
       encore écouter quoi que ce soit à cet instant précis du démarrage
       (racing inévitable si Rust émettait avant que React n'ait fini de
       monter son listener).
    3. **`tauri-plugin-single-instance`** (nouvelle dépendance Cargo,
       DOIT être enregistré comme PREMIER plugin d'après sa propre
       documentation) : si l'utilisateur double-clique un second fichier
       pendant que Pagina tourne déjà, Windows relance un second PROCESSUS
       — ce plugin l'intercepte AVANT toute création de fenêtre, extrait
       ses arguments (même filtre `filter_openable_args`) et les
       retransmet à la fenêtre déjà ouverte via un évènement Tauri
       `"open-files"` (cette fois-ci une vraie émission Rust→JS a du sens :
       le frontend de l'instance déjà lancée est depuis longtemps monté et
       à l'écoute), puis fait passer cette fenêtre au premier plan
       (`set_focus`) — le second processus ne crée jamais de fenêtre et se
       termine immédiatement tout seul.
    4. **`App.tsx`** : un seul effet au montage gère les deux chemins —
       `getStartupFiles()` (tire la liste initiale) ET
       `listen("open-files", ...)` (écoute les lancements ultérieurs) —
       chaque chemin reçu est simplement passé à
       `useTabsStore.getState().openFile(path)`, exactement le même
       chemin de code que n'importe quel autre fichier ouvert dans l'app.
  - **Vérifié en conditions RÉELLES** (pas seulement via Playwright/CDP,
    qui ne peut pas driver deux PROCESSUS natifs séparés) : l'exécutable
    RELEASE fraîchement compilé (`src-tauri/target/release/xmd-editor.exe`)
    lancé directement avec un chemin de fichier de test en argument
    (simulation exacte d'un double-clic Explorateur) — le fichier s'ouvre
    bien comme onglet actif dès le démarrage (titre de fenêtre et contenu
    affiché confirmés par capture d'écran Win32/GDI, puisqu'un exe release
    n'a pas de port de debug CDP branché). **Puis, l'app RESTANT OUVERTE**,
    le même exécutable relancé une seconde fois avec un AUTRE fichier en
    argument : un seul processus `xmd-editor.exe` est resté visible dans
    `tasklist` après ce second lancement (pas de seconde fenêtre créée), et
    ce second fichier est bien apparu comme nouvel onglet actif dans la
    fenêtre déjà ouverte (titre + contenu re-vérifiés par capture d'écran)
    — confirmation complète et sans ambiguïté du bon fonctionnement du
    `single-instance` cross-lancement. Les boutons "Ouvrir un fichier…" et
    "Enregistrer sous…" testés séparément via Playwright/CDP en mode dev :
    les DEUX dialogues natifs s'ouvrent bien avec leur titre personnalisé
    (confirmant que les permissions `dialog:allow-open`/`-save` sont
    correctes et qu'aucune erreur "not allowed" n'apparaît dans les logs
    `tauri dev`) — piloter ensuite un dialogue Explorer natif jusqu'au bout
    par automatisation clavier (`SendKeys`) s'est avéré peu fiable
    (dialogue resté ouvert malgré plusieurs approches), non poursuivi car
    hors du périmètre du code de l'app (limite de l'outillage de test, pas
    un doute sur `pickFiles`/`pickSaveLocation`/`saveTabAs` eux-mêmes, dont
    la logique est directement inspectable et repose sur les mêmes
    fonctions `writeTextFile`/`save()`/`open()` déjà éprouvées ailleurs
    dans le projet).
  - **Effet de bord repéré pendant les tests, sans lien avec ce
    correctif** : l'instance `tauri dev` (débogage, port 9222) ouverte en
    parallèle s'est arrêtée de façon inexpliquée pendant ces
    manipulations (peut-être un effet du partage du même VERROU
    single-instance — même `identifier` dans `tauri.conf.json` — entre un
    build debug et un build release lancés simultanément, un scénario qui
    ne se produit jamais en usage réel où un seul type de build tourne à
    la fois). Non creusé plus avant (n'affecte pas le comportement en
    production, uniquement un désagrément de méthode de test) ; à
    surveiller si ça se reproduit en conditions de développement normales.
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
- **Correctifs fenêtre (2026-09-14)**, remontés par l'utilisateur : "je
  n'arrive pas à déplacer l'application dans Windows" et "il faudrait
  demander à enregistrer si les documents ne sont pas enregistrés" à la
  fermeture.
  - **Fenêtre non déplaçable** : `data-tauri-drag-region` n'était posé QUE
    sur `.tbar` (le fond de la barre) — Tauri documente explicitement que
    cet attribut NE S'HÉRITE PAS aux enfants. Or `.tbar-left`/`.tbar-center`/
    `.tbar-right` (les 3 conteneurs flex) recouvrent toute la largeur de la
    barre : le fond de `.tbar` n'était donc jamais réellement sous la
    souris, seule une frange de quelques px de padding l'était. **Fix**
    (`TitleBar.tsx`) : attribut reposé sur les 3 conteneurs directement —
    l'espace VIDE qu'ils contiennent (au-delà de leurs boutons) devient
    une vraie zone de glisser, sans rien changer aux boutons eux-mêmes
    (éléments distincts, sans l'attribut, restent cliquables normalement).
    **Suite immédiate, remontée par l'utilisateur avec une capture d'écran
    annotée (zones essayées en rouge)** : toujours pas déplaçable malgré le
    fix ci-dessus. La VRAIE cause, trouvée en lisant les logs `tauri dev`
    (comme pour `window.confirm()` juste avant) : `Unknown Error:
    window.start_dragging not allowed. Permissions associated with this
    command: core:window:allow-start-dragging` — le mécanisme
    `data-tauri-drag-region` invoque en interne la commande
    `window.start_dragging`, qui est elle-même soumise au système de
    permissions ACL de Tauri v2 comme n'importe quelle autre commande de
    fenêtre (minimiser/agrandir/fermer...) — **oubliée** lors de l'ajout
    initial des permissions `core:window:allow-*` (section "Barre
    supérieure fusionnée" plus haut), qui ne couvrait que les boutons
    minimiser/agrandir/fermer, pas le glisser. Troisième occurrence du même
    piège en une session (après `window.print()` et `window.confirm()`) :
    **toute commande de fenêtre Tauri v2 échoue en SILENCE (rejet de
    promesse non affiché à l'écran) sans la permission `core:window:allow-*`
    exacte — vérifier systématiquement les logs `tauri dev` (pas seulement
    la console du navigateur) au moindre bouton/geste qui "ne fait rien".**
    **Fix** : `core:window:allow-start-dragging` ajouté à
    `capabilities/default.json`. Application redémarrée AUTOMATIQUEMENT par
    `tauri dev` (surveille les fichiers de capacités, recompile Rust tout
    seul en ~16s). **Vérifié** : plus aucune erreur `not allowed` dans les
    logs après un geste de glisser synthétique (avant le fix, l'erreur
    apparaissait à chaque tentative ; après, silence complet — cohérent
    avec un appel qui réussit désormais). Le déplacement RÉEL de la fenêtre
    par la souris de l'utilisateur reste à confirmer par lui (limitation
    déjà documentée : un geste souris synthétique via CDP ne déclenche pas
    la boucle modale native de déplacement de Windows, donc la position de
    fenêtre elle-même ne peut pas être vérifiée par ce biais — seule
    l'absence d'erreur de permission l'est).
  - **Fermeture sans confirmation malgré des documents non enregistrés** —
    en creusant, DEUX bugs liés au même piège que `window.print()`
    documenté plus haut (`print_commands.rs`) : Tauri réachemine aussi
    `window.confirm()` vers sa propre commande native
    (`dialog.confirm`), qui échoue si la permission dédiée n'est pas
    déclarée (`Unknown Error: dialog.confirm not allowed. Command not
    found`, vu dans les logs `tauri dev`) :
    1. **`handleCloseTab` (fermeture d'un ONGLET, `App.tsx`) — bug
       PRÉ-EXISTANT, pas une régression du jour.** `const ok =
       window.confirm(...)` : l'appel rejetant silencieusement, `ok`
       valait une PROMESSE (donc toujours "truthy" en JS) — `if (!ok)
       return;` ne bloquait alors JAMAIS rien. Fermer un onglet modifié
       perdait le travail non enregistré SANS JAMAIS vraiment demander
       confirmation, depuis le tout début du projet. Passé inaperçu car
       jamais explicitement testé (les tests Playwright de cette session
       annulent toujours leurs modifications AVANT de fermer un onglet,
       jamais après).
    2. **Fermeture de la FENÊTRE entière** : aucune confirmation n'existait
       du tout avant aujourd'hui (seule la fermeture d'onglet en avait
       une, bien que cassée — voir ci-dessus). Nouveau : `Window.close()`
       émet un évènement `closeRequested` ANNULABLE (`onCloseRequested`,
       API officielle `@tauri-apps/api/window`) — intercepté dans
       `App.tsx` (pas dans `TitleBar.tsx`, qui ne connaît pas le store des
       onglets) : si un onglet est `dirty`, `event.preventDefault()` puis
       confirmation ; si confirmée, `appWindow.destroy()` (force la
       fermeture SANS réémettre `closeRequested`, sinon boucle infinie).
    **Fix commun aux deux** : abandon de `window.confirm()`, remplacé par
    `confirm()` du plugin officiel `@tauri-apps/plugin-dialog` (déjà une
    dépendance du projet, déjà utilisé pour `pickWorkspaceFolder` dans
    `fileService.ts`) — ouvre un VRAI dialogue natif Windows, titré
    "Pagina". Permissions ajoutées dans `capabilities/default.json` :
    `dialog:allow-confirm`, `dialog:allow-ask`. **À RETENIR** (renforce la
    leçon déjà tirée de `window.print()`) : ne JAMAIS faire confiance aux
    fonctions de dialogue web standard (`alert`/`confirm`/`prompt`/`print`)
    dans cette version de Tauri sans avoir vérifié explicitement qu'elles
    fonctionnent — `window.prompt`/`window.alert` restent utilisés ailleurs
    dans le projet (`handleNewFile`, `setLink`, `insertImage`...) et
    SEMBLENT fonctionner (testés à répétition tout au long de cette
    session), mais seul `window.confirm` s'est avéré, à l'usage, être
    intercepté et cassé sans la permission dédiée — si un autre
    `window.alert`/`window.prompt` se met un jour à échouer silencieusement,
    appliquer le même remède (permission dédiée ou plugin officiel).
    **Vérifié par Playwright/CDP + énumération de fenêtres Windows** (même
    méthode que pour `printWindow` en son temps) : dirty sur un onglet →
    clic sur son ✕ → une VRAIE fenêtre native "Pagina" apparaît (confirmée
    par `EnumWindows`) → fermée via Échap (équivalent Annuler) → l'onglet
    reste bien ouvert avec son indicateur de modification non enregistrée
    intact (pas perdu). Le chemin fermeture de FENÊTRE utilise exactement
    le même mécanisme, non revérifié séparément par manque de temps mais
    reposant sur le même appel `confirmDialog` déjà validé.
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
- **Améliorations du panneau Équation (notées 2026-10-17, à valider via la
  maquette docs/maquettes/panneau-equation.html avant de coder)** :
  1. Édition directe dans la ZONE équation de la page (« plus de place,
     plus visuel ») — piste : champ MathLive flottant posé sur la formule
     peinte, même mécanisme que le champ en-tête/pied
     (startHeaderFooterEdit) ; le panneau latéral garde le clavier.
  2. Le clavier virtuel est utile mais prend trop de place : il doit VENIR
     DU PANNEAU LATÉRAL DROIT (palette de touches maison intégrée au
     panneau — recommandé, style MBEF maîtrisé — ou repositionnement CSS du
     clavier MathLive).
  3. Les commandes des panneaux latéraux (Supprimer, etc.) en ICÔNES en
     HAUT des panneaux, à côté du ✕ (barre d'icônes dans l'en-tête).

- **Avertissement avant la bascule automatique Markdown → HTML d'un
  tableau (idée notée le 2026-10-14, pas encore spécifiée en détail)**,
  sur remarque explicite de l'utilisateur : "à la création d'un tableau il
  faut que ça reste natif en Markdown, puis s'il se personnalise (hors
  centré, gauche ou droite du texte à l'intérieur des cellules), on passe
  en HTML. Il faudrait une petite fenêtre d'avertissement avant la
  transformation."
  - **Déjà en place aujourd'hui** (voir `isMarkdownSerializable`/
    `hasAdvancedStyle` dans `src/ui/Editor/extensions/TableMarkdown.ts`) :
    un tableau nouvellement créé reste en syntaxe GFM standard tant qu'il
    n'utilise QUE ce qui a un équivalent Markdown — l'alignement de colonne
    gauche/centre/droite (`:---`/`:---:`/`---:`) EST déjà dans cette
    catégorie et ne déclenche PAS la bascule HTML. Elle ne se déclenche
    que pour la fusion de cellules (colspan/rowspan), la couleur de fond,
    les bordures personnalisées, ou l'alignement VERTICAL de cellule —
    exactement ce que l'utilisateur décrit comme "se personnalise".
  - **Ce qui manque** : la bascule est actuellement SILENCIEUSE (se
    produit à la sauvegarde, sans prévenir). Il faudrait une boîte de
    dialogue de confirmation déclenchée AU MOMENT où l'utilisateur
    applique la première mise en forme qui va forcer le repli HTML (pas à
    la sauvegarde, trop tard pour que ce soit utile) — ex. intercepter
    `setCellBackgroundColor`/`setCellBorder`/`setCellBorderPreset`/
    `setCellVerticalAlign`/`mergeCells` dans `MarkdownEditor.tsx`, vérifier
    AVANT d'appliquer si le tableau est actuellement encore 100% GFM
    (`!hasAdvancedStyle(...)` et pas de span), et si oui afficher un
    avertissement ("Ce tableau sera enregistré en HTML à partir de
    maintenant — toujours lisible ailleurs mais plus en Markdown pur.
    Continuer ?") avant de dispatcher la transaction.
  - **Pas encore clarifié avec l'utilisateur** (à faire avant de coder) :
    l'avertissement doit-il apparaître à CHAQUE action qui personnalise
    (risque de lassant à répétition sur un même tableau déjà basculé en
    HTML) ou seulement la toute PREMIÈRE fois pour un tableau donné
    (comportement "bascule" plutôt que "par action") ? Une case "ne plus
    demander pour ce document"/"ne plus jamais demander" ?
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
- ~~Renommer / dupliquer / supprimer~~ dans l'explorateur **FAIT
  (2026-10-17, chantier explorateur complet)** — il ne reste que le
  DÉPLACER (drag & drop) non implémenté.
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
7. ~~Actions manquantes de l'explorateur (renommer/dupliquer/supprimer)~~
   **Fait (2026-10-17)** — chantier explorateur complet : recherche,
   menu contextuel, badge modifié, tri, tooltip, rafraîchissement
   robuste, ergonomie clavier. Reste le déplacement (drag & drop).
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
