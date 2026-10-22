# Roadmap — reprise de fonctionnalités de CasualOffice/docs

Ce fichier suit, dans le temps, quelles fonctionnalités du projet open source
de référence (`CasualOffice/docs`, forké sans modification de porté dans
`../pagina-docx-engine`) ont été évaluées, portées ou explicitement refusées
dans Pagina. Établi le 2026-10-14 suite à un audit complet du fork (voir
inventaire détaillé dans l'historique de conversation Claude — à reporter
ici au fur et à mesure si besoin de référence permanente).

**Règle directrice, rappelée à chaque entrée** : on ne réimporte JAMAIS leur
code/moteur tel quel. Chaque fonctionnalité est **réimplémentée sur notre
propre modèle** (document Markdown comme seule source de vérité, pas de
format `.docx` intermédiaire, architecture éditeur invisible + couche peinte
déjà en place) — seule la *technique*/l'UX est reprise. C'est la leçon de
l'épisode du 2026-09-12 (intégration complète de leur moteur `DocxEditor`,
abandonnée le jour même, voir `CLAUDE.md`) : une adoption en bloc fait perdre
l'identité du projet.

## Légende

- ⬜ Pas commencé
- 🔶 En cours / partiellement fait
- ✅ Fait et vérifié
- ❌ Explicitement écarté (avec raison)

---

## Phase 1 — Tableaux (en cours, priorité immédiate)

- ✅ **Résolution clic/sélection refonte complète (2026-10-17)** — comparaison
  demandée avec leur `paged-editor/` (même architecture : éditeur invisible
  + couche peinte). Porté/réimplémenté sur notre modèle, SANS copie :
  - Leur `ClickPositionResolver` (runs indexés `data-pm-start` + recherche
    binaire) → notre `pagination/cloneIndex.ts` (index texte/cellules des
    clones reconstruit à chaque repaint) + chemin rapide
    `caretRangeFromPoint` sur le texte visible dans `resolveClickPosition` ;
    le balayage `coordsAtPos` ne survit que comme repli BORNE À LA CELLULE
    cliquée. Corrige les remontées « la sélection des cellules saute » et
    « difficile de positionner le curseur ».
  - Leur `useDragAutoScroll` (rAF, zone 40px, vitesse proportionnelle) →
    réimplémenté dans le gestionnaire souris de MarkdownEditor.tsx :
    sélectionner par glissement à travers les pages défile maintenant.
  - Bonus ajoutés au passage : double-clic = mot, triple-clic = bloc,
    Maj+clic = étendre (leur `PointerEventHandler` les implémentait, nous
    pas).
  - Leur `LayoutSelectionGate` (verrou séquence état/layout pour la
    peinture de sélection) : 🔶 évalué, NON porté pour l'instant — notre
    repaint est synchrone à la frappe, le besoin se fera sentir si la
    pagination devient asynchrone un jour.
  - Vérifié par Playwright/CDP : cellules pleines et vides sans saut, vraie
    `CellSelection` au glisser, auto-scroll multi-pages, clic précis au
    caractère. Détails dans CLAUDE.md.

Déjà bien avancé côté Pagina (fusion, bordures par côté, alignement
vertical, menu clic-droit, glisser-sélectionner correctement reconnu comme
`CellSelection`). Reste à porter :

- ✅ **Panneau latéral contextuel pour le tableau (2026-10-14)** — remplace
  l'ancien dialogue modal `TableBorderDialog` (supprimé), inspiré de
  `TablePropertiesSection.tsx`/`PropertiesPanel.tsx` du fork mais
  réimplémenté sur nos propres `ToolbarActions`, aucun code copié. Nouveau
  `src/ui/TableProperties/TablePropertiesPanel.tsx` : fond de cellule,
  alignement vertical, fusion/scission, bordures (présets + par côté +
  style/épaisseur/couleur), suppression du tableau. S'ouvre automatiquement
  au FRONT MONTANT de `stats.insideTable` (même logique que la bascule
  d'onglet ruban "Tableau"), reste fermé si fermé manuellement tant qu'on ne
  ressort pas du tableau, se rouvre à une vraie ressortie/rentrée. Ajouté à
  la règle `@media print` (`.tp-panel`) — piège déjà rencontré une fois le
  jour même avec `.tbar`, vérifié cette fois dès l'écriture du composant.
  Vérifié par Playwright/CDP contre le document réel de l'utilisateur :
  ouverture/fermeture/réouverture correctes, préset de bordure et couleur de
  fond appliqués et vérifiés par `getComputedStyle` (piège de script de test
  rencontré : un `<input type="color">` React écoute l'évènement natif
  `input`, pas `change` — un `dispatchEvent(new Event("change"))` ne
  déclenche jamais le `onChange` React, faux négatif corrigé dans le script
  de test, pas un bug de l'app). Toutes les actions de test annulées
  (`Ctrl+Z`), aucune sauvegarde, document réel non modifié sur disque
  (vérifié : 0 cellule à fond jaune de test après coup, bordures restantes
  = style par défaut `1px solid #ccc` de `MarkdownEditor.css`, pas une
  trace de préset).
- ✅ **Regroupement des commandes de tableau du ruban dans le panneau
  (2026-10-14)**, sur demande explicite de l'utilisateur : l'onglet
  contextuel "Tableau" du ruban (Lignes/Colonnes/Alignement/Supprimer) ET le
  groupe "Tableau" de l'onglet "Format avancé" (fusion/couleur/alignement
  vertical/lanceur de bordures) sont supprimés — leurs commandes rejoignent
  le panneau latéral (nouvelles sections "Lignes"/"Colonnes" dans
  `TablePropertiesPanel.tsx`, réutilisant les mêmes `ToolbarActions` déjà
  existantes). Le ruban ne garde QUE la création de tableau (sélecteur-grille
  dans le groupe "Éléments" de l'onglet Accueil). L'alignement de colonne
  n'a pas été dupliqué dans le panneau : le groupe "Alignement" déjà présent
  dans l'onglet "Format avancé" appelle la même action `setTextAlign`, qui
  s'applique déjà correctement à une cellule de tableau sous le curseur
  (vérifié dans le code — `TextAlign` est configuré sur les types
  `tableCell`/`tableHeader`), donc aucune fonctionnalité perdue.
  - **Piège de méthode rencontré en testant** : après avoir cliqué sur les
    boutons d'onglet du ruban ("Format avancé" puis "Accueil") pour
    vérifier l'absence du groupe supprimé, `Ctrl+Z` envoyé ensuite via
    Playwright n'annulait plus RIEN — le focus clavier était resté sur le
    dernier bouton cliqué, jamais revenu sur l'éditeur invisible. Un test
    isolé (frappe de texte puis Ctrl+Z immédiat, sans clic de bouton entre
    les deux) a confirmé que l'historique d'annulation fonctionnait
    parfaitement par ailleurs — **toujours recliquer directement dans
    l'éditeur (un paragraphe réel, pas un bouton) avant d'envoyer des
    `Ctrl+Z` de récupération dans un script de test**, sinon les touches
    partent dans le vide. Un second piège découvert au passage : cliquer
    sur `.first()` cellule de tableau dans un document réel peut cibler un
    VRAI tableau préexistant du document plutôt qu'un tableau de test
    fraîchement inséré en fin de document, si le document en contient déjà
    — vérifié après coup qu'aucune trace ne persistait (nombre de lignes
    de tableau en mémoire ramené exactement au nombre de lignes du fichier
    réellement enregistré sur disque, `8 === 8`, indicateur "non enregistré"
    disparu de l'onglet).
  - Vérifié par Playwright/CDP : plus d'onglet "Tableau" dans la barre du
    ruban, plus de groupe "Tableau" dans "Format avancé" (reste
    "Police"/"Alignement"), panneau latéral avec sections
    "Lignes"/"Colonnes"/"Cellules"/"Alignement vertical"/"Bordures",
    insertion de ligne depuis le panneau confirmée (comptage réel des
    `<tr>` peints avant/après). `npx tsc --noEmit` propre.
- ⬜ Poignées de glissement dédiées pour réordonner lignes/colonnes (pas
  seulement la sélection par glisser) — leur implémentation
  (`tableInsertHover.ts`, `layout-bridge/tableWidthUtils.ts`) est câblée à
  leur moteur de pagination propriétaire : à réécrire sur notre
  `paintPages.ts`/couche peinte, pas à copier.
- ⬜ Galerie de styles de tableau prédéfinis (façon Word "Table Styles") —
  idée reprise (`TableStyleGallery.tsx`), contenu des styles à définir avec
  la charte Pagina/MBEF, pas celle de Word.
- ⬜ Répétition de la ligne d'en-tête sur saut de page (pertinent vu qu'on a
  déjà la pagination réelle) — correspond à `toggleHeaderRow` dans leur
  modèle OOXML, à réinterpréter pour notre pagination Markdown.
- ⬜ Tri de tableau (`sortTable`).
- ⬜ Distribution/auto-ajustement des lignes et colonnes.

## Phase 2 — Formatage de texte / ruban (gains rapides, peu de risque)

- ⬜ **Mise en forme Markdown à la frappe** (taper `**gras**` convertit
  automatiquement en gras) — `InlineMarkdownExtension.ts` dans le fork.
  Directement pertinent et à faible risque architectural : n'importe quel
  éditeur Markdown-natif peut avoir cette règle d'auto-complétion sans
  toucher à la sérialisation.
- ✅ **Rechercher/Remplacer (2026-10-21)** — réimplémenté sur notre modèle
  (`src/ui/FindReplace/FindReplacePanel.tsx`, aucun code copié) : panneau
  latéral ouvert par Ctrl+F, alimenté aussi par le champ de recherche de la
  barre de titre (la requête y est portée en direct) ; liste des résultats
  avec contexte, options Respecter la casse / Mots entiers, champ
  « Remplacer par… » + Remplacer / Tout remplacer. Leur
  `FindReplaceDialog.tsx` reste modal : notre choix est un volet latéral
  façon Word, navigation possible pendant la recherche.
- ⬜ Palette de commandes (Cmd/Ctrl+K façon VS Code) — `CommandPaletteDialog.tsx`,
  pattern générique, aucune dépendance docx.
- ⬜ Correction automatique / guillemets intelligents.
- ⬜ Orthographe/grammaire avec suggestions (`SpellcheckExtension.ts`,
  `GrammarExtension.ts`) — attention : Pagina a explicitement DÉSACTIVÉ
  `spellcheck`/`autocorrect` natifs du navigateur sur l'éditeur invisible
  (voir CLAUDE.md, "texte tapé au mauvais endroit") ; une vraie fonctionnalité
  orthographe devra passer par un moteur JS dédié comme le fait le fork,
  jamais réactiver le spellcheck natif du navigateur.
- ⬜ Score de lisibilité (`readability.ts`) — logique pure, portable telle
  quelle sans adaptation profonde.

## Phase 3 — Structure du document

- ⬜ Plan du document / navigateur de titres (`DocumentOutline.tsx`) —
  s'appuierait sur les mêmes titres déjà numérotés/sommaire existants côté
  Pagina (`HeadingAutoNumber.ts`, `TocMarker.ts`).
- ✅ **Règles horizontale/verticale glissables (2026-10-21)** —
  `pagination/Ruler.tsx` : triangles de marge tirables à la souris, document
  mis à jour en direct, règle verticale calée sur les pages. Réimplémenté sur
  `PageLayoutSettings`, aucun code copié. Vérifié par un vrai glisser (marge
  gauche 3 cm → 4 cm → retour).
- ⬜ Numérotation de page dans un format autre que brut (i, ii, 1, 2...) —
  déjà noté comme "pas commencé" dans `CLAUDE.md` indépendamment de ce fork.
- ⬜ Traduction de sélection/document — le fork a déjà un chemin
  **Markdown-aware** (`translateMarkdown.ts`) à étudier en premier, pourrait
  se porter presque tel quel vu que Pagina est déjà 100% Markdown.
- ⬜ Nombre de mots / statistiques enrichies (au-delà du compteur actuel).

## Impression et export PDF (évalué le 2026-10-22)

Comparaison demandée par l'utilisateur (« l'impression marche moyen, regarde
ce qui est fait dans Casual »). Fichiers du fork lus : `usePrintFlow.ts`,
`PrintPreview.tsx`, `DocxEditor.tsx` (câblage), tests e2e d'export PDF.

- ✅ **Constat sur Casual** : pas d'aperçu intégré non plus
  (`openPrintPreview` appelle simplement l'impression). Sur bureau, leur
  « Imprimer » est routé vers l'export PDF natif de l'hôte (même chemin que
  « Exporter en PDF »), parce que l'impression directe est peu fiable dans la
  webview — l'utilisateur imprime ensuite le PDF. Ils épinglent aussi le
  format de page (`@page size`) sur celui du document.
- ✅ **Repris (2026-10-22), sur notre modèle** : `@page` dynamique suivant le
  format du document (`MarkdownEditor.tsx`) ; export natif avec réglages
  explicites (`print_commands.rs` : format réel, fonds, sans en-tête du
  navigateur) — avant, WebView2 écrivait du Letter sans couleurs ; CSS
  d'impression (`print-color-adjust: exact`, repères d'édition masqués).
- ✅ **Aperçu avant impression** : plutôt qu'un composant maison, « Imprimer »
  ouvre la boîte d'impression du NAVIGATEUR (`COREWEBVIEW2_PRINT_DIALOG_KIND_BROWSER`)
  qui montre l'aperçu des pages, le choix des pages, l'imprimante, les copies
  et la couleur — la boîte système utilisée avant n'a aucun aperçu.
- ❌ **Non repris** : leur fenêtre d'impression `window.open` + clone des
  pages (inutile : on imprime la couche peinte directement) ; leurs
  `PrintOptions`/`parsePageRange` (la boîte du navigateur fournit déjà ces
  réglages).
- ⬜ **À évaluer plus tard** : un aperçu INTÉGRÉ dans l'application (vignettes
  des pages, choix de plage dans une fenêtre Pagina) — seulement si la boîte
  du navigateur ne suffit pas à l'usage.

## Phase 4 — Collaboration (exploratoire, pas de décision prise)

- ⬜ **À étudier en premier, avant tout code** :
  `pagina-docx-engine/examples/vite/src/markdown/` contient déjà un éditeur
  Markdown collaboratif Yjs avec aperçu live (CodeMirror) — le précédent le
  plus proche de Pagina dans tout le dépôt de référence. Vaut une lecture
  complète avant de se lancer dans une quelconque collaboration temps réel.
  Hors périmètre produit V1 actuel (voir `README.md`/`CLAUDE.md`, "feuille de
  route produit") — ne pas commencer sans décision explicite de
  l'utilisateur.

## Explicitement écarté (❌)

- ❌ **Tout le moteur `layout-engine`/`layout-painter`/`PagedEditor.tsx` du
  fork** — Pagina a déjà sa propre architecture équivalente (éditeur
  invisible + couche peinte, `src/ui/Editor/pagination/`), plus simple et
  déjà adaptée à notre modèle Markdown. Ne jamais importer leur moteur de
  pagination, seulement s'en inspirer ponctuellement si un piège précis y
  est déjà documenté et résolu (comme déjà fait pour la technique de mesure
  de blocs).
- ❌ **Import/export DOCX complet (parseurs/sérialiseurs OOXML)** — hors
  périmètre produit explicite (voir `README.md`, feuille de route produit,
  import `.docx` à spécifier séparément avec l'utilisateur le moment venu,
  pas une reprise automatique de ce module).
- ❌ **WOPI (intégration Office Online)** — aucun besoin identifié pour un
  outil interne MBEF.
- ❌ **Signature électronique, Historique de versions avec diff structurel,
  Agent IA/MCP intégré** — fonctionnalités réelles et intéressantes mais
  sans lien avec la demande actuelle ; à ajouter à cette roadmap seulement
  si explicitement demandées.

---

## Comment utiliser ce fichier

- Avant de porter une fonctionnalité listée ici, relire la section
  correspondante du fork (`../pagina-docx-engine`) pour en comprendre
  l'implémentation réelle (fichiers cités) — **jamais copier le code tel
  quel**, toujours adapter au modèle Markdown-natif de Pagina.
- Cocher ✅ et ajouter une courte note (date, fichiers Pagina modifiés) une
  fois une entrée portée — suivre le même style que les entrées détaillées
  de `CLAUDE.md`, mais ce fichier-ci reste un simple suivi d'avancement,
  PAS un journal détaillé (le détail du "comment" et des pièges rencontrés
  continue d'aller dans `CLAUDE.md`, comme pour toute autre fonctionnalité).
