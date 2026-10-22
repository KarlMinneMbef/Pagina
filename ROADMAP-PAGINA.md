# Roadmap Pagina — Tout ce qui reste à développer avant le format `.xmd`

> Établi le 2026-10-17 sur la demande explicite de l'utilisateur : « il faut que l'on ait bout de ce projet. »
> Objectif : compléter Pagina pour qu'il s'approche d'un Word complet (pour les utilisateurs), puis passer au format `.xmd` (avec images, commentaires, version et historique).
>
> Les priorités 1-3 sont les prérequis fonctionnels avant `.xmd`. Les priorités 4-5 peuvent se faire en parallèle ou après.

---

## Priorité 0 — Qualité et dette technique (ajouté le 2026-10-22, après l'audit de code)

> Issues de l'audit du 2026-10-22 et de la passe de test fonction par fonction (voir `CLAUDE.md`). À traiter AVANT d'empiler de nouvelles fonctionnalités : chaque point réduit le risque de régression sur la suite.

| # | Sujet | Description | Statut |
|---|---|---|---|
| 0.1 | **Audit de code** | Code mort, doublons, `CLAUDE.md` trop long : dépendances inutiles, `tokens.ts` supprimé, garde de focus et `useClickOutside` mutualisés, actions du ruban par spread du handle, `CLAUDE.md` 4 600 → ~250 lignes (journal dans `docs/JOURNAL-DEVELOPPEMENT.md`) | ✅ (2026-10-22) |
| 0.2 | **Passe de test fonction par fonction** | Menée par CDP sur l'app réelle : 4 bugs corrigés (bouton Normal, focus des panneaux, champ en-tête/pied hors écran, fichier corrompu par un en-tête vidé) | ✅ (2026-10-22) — Impression native, ouverture de fichier et thème sombre non testés |
| 0.3 | **Impression / export PDF** | Export en vrai format du document avec fonds, aperçu avant impression (boîte du navigateur), CSS d'impression sans repères d'édition | ✅ (2026-10-22) — à valider à l'usage par l'utilisateur |
| 0.4 | **Découper `MarkdownEditor.tsx`** | Il reste ~2 900 lignes dont ~2 300 d'effets (souris, repaint, en-tête/pied, menus). Un hook par commit, avec test réel dans l'app à chaque étape — jamais à l'aveugle | ⬜ |
| 0.5 | **Remplacer `window.prompt/alert`** | 7 appels (lien, signet, renvoi, nouveau fichier) par un vrai composant de dialogue ; attention au focus de l'éditeur (la sélection ne doit pas être perdue pour le lien) | ⬜ |
| 0.6 | **Failles `npm audit`** | `dompurify` (via mermaid) et `katex` : la correction peut changer les versions majeures — à tester sur les diagrammes et les formules | ⬜ |
| 0.7 | **Sommaire : lisibilité** | Retour utilisateur du 2026-10-20 (« pas très lisible à l'utilisation »), sans précision : à CLARIFIER avec l'utilisateur avant de coder (coupure entre pages ? densité ? panneau ?) | ⬜ |
| 0.8 | **Onglet « modifié » après annulation** | Après annulation complète, l'onglet reste marqué modifié (comparaison avec le texte brut du disque, pas avec la pile d'annulation) — mineur | ⬜ |

---

## Priorité 1 — Fondations de l'interface (prérequis pour tout le reste)

| # | Fonctionnalité | Description | Faisabilité | Statut |
|---|---|---|---|---|
| 1.1 | **Règles horizontale ET verticale** | Barres graduées (mm) au-dessus et à gauche des pages, triangles de marge, glissables à la souris | Très faisable — mêmes mécaniques que les poignées de tableau | ✅ (2026-10-21 : triangles de marge glissants, mise à jour en direct) |
| 1.2 | **Option afficher/masquer les règles** | Case à cocher dans une fenêtre Paramétrage | Simple | ✅ (2026-10-22 : section Affichage du Paramétrage) |
| 1.3 | **Fenêtre Propriétés du document** | Métadonnées : Titre, Sujet, Auteur, Date de création, Date de modification, Mots-clés, Commentaires — + champs personnalisés | Simple (formulaire React, stockage dans `pagina:config`) | ✅ (2026-10-21 : bouton « Propriétés » du ruban Accueil) |
| 1.4 | **Fenêtre Paramétrage (Préférences)** | Affichage (règles, barres), Interface (langue, thème), Édition (correction auto), Sauvegarde (auto-sauvegarde, intervalle) | Simple (formulaire React, localStorage) | ✅ (2026-10-22 : bouton ⚙ de la barre de titre — règles et auto-sauvegarde + intervalle fonctionnelles ; langue/thème et correction auto verrouillées « à venir ») |
| 1.5 | **Fenêtre Utilisateur** | V1 : Nom + Prénom uniquement (stocké en localStorage). V2 : connexion serveur MBEF pour Ingenerix | V1 simple, V2 nécessite l'API MBEF | ✅ V1 (2026-10-22 : avatar de la barre de titre cliquable, initiales) ⬜ V2 |
| 1.6 | **Champs personnalisés (en-tête/pied)** | Auteur, Sujet, Date de création, + possibilité de créer des champs personnalisés `{{marseille}}`… | Simple — étendre `resolveHeaderFooterText` | ✅ (2026-10-21 : `{{title}}`, `{{subject}}`, `{{keywords}}`, `{{created}}`, `{{modified}}` + chaque champ personnalisé par son nom) |

---

## Priorité 2 — Ergonomie d'édition (le « comme Word »)

| # | Fonctionnalité | Description | Faisabilité | Statut |
|---|---|---|---|---|
| 2.1 | **Boutons Tabulation + / Tabulation −** | Augmenter/réduire le retrait du paragraphe courant (indent) | Simple — extension Tiptap Indent ou custom | ✅ (2026-10-21 : pas de 1,25 cm, modèle en cm dans `ParagraphMarkdown.ts`) |
| 2.2 | **Interligne et espacement de paragraphe** | Sélecteur d'interligne (1,0 / 1,15 / 1,5 / 2,0 / personnalisé) + espacement avant/après paragraphe — **à ajouter AUSSI dans le dialogue Styles de titres** (interligne et espacement par niveau) | Moyen — étendre le modèle `PageLayoutSettings` | ✅ (2026-10-21 : menu Interligne façon Word + fenêtre « Paragraphe — Retrait et espacement », interligne/espacement par niveau de titre aussi) |
| 2.3 | **Mémorisation de la couleur** | Le bouton Couleur/Surlignage **retient** la dernière couleur choisie — cliquer sur le bouton (sans ouvrir le nuancier) applique cette couleur, comme Word | Simple — état React du bouton | ✅ (2026-10-21) |
| 2.4 | **Rechercher / Remplacer** | Panneau latéral avec : champ de recherche + boutons Suivant/Précédent, champ de remplacement + boutons Remplacer / Remplacer tout, options (casse, mots entiers) | Moyen — parcourir le document Tiptap | ✅ (2026-10-21 : panneau Ctrl+F + champ de la barre de titre, liste de résultats avec contexte, Remplacer / Tout remplacer, casse et mots entiers) |
| 2.5 | **Première page différente** | SANS en-tête et SANS pied de page — déjà implémenté via « Première page différente » dans Mise en page | **Fait** (vérifié) | ✅ |

---

## Priorité 3 — Fonctionnalités riches (le « pour les utilisateurs »)

| # | Fonctionnalité | Description | Faisabilité | Statut |
|---|---|---|---|---|
| 3.1 | **Pages de garde** | Galerie de modèles prêts à l'emploi (titre, sous-titre, logo, date, auteur) + possibilité de **créer** la sienne et de l'**exporter** pour la réutiliser | Moyen — liste de blocs de contenu + interface de sélection | ✅ (2026-10-22, refonte « zone transparente » : deux marqueurs invisibles encadrent du CONTENU NORMAL éditable comme toute page — ruban, tableaux… ; en-tête/pied masqués sur les pages couvertes, champs {{variable}} inline résolus partout, panneau contextuel, types réutilisables, migration des anciens documents) ✅ **+ 2026-10-22 (soir) : fichier en Markdown PUR avec thème par modèle** (`theme=` dans le marqueur, apparence en CSS par type de bloc), champs vides lisibles et saisissables directement sur la page |
| 3.2 | **Sauvegarder/charger un style complet** | Enregistrer TOUTE la mise en forme du document (styles de titres, marges, format papier, en-tête/pied, couleurs) comme un « modèle » réutilisable — export/import en JSON | Moyen — sérialiser `PageLayoutSettings` en fichier | ⬜ |
| 3.3 | **Lecture à voix haute** | Comme Word : sélectionner du texte → clic bouton « Lire à voix haute » → le texte est lu par la synthèse vocale (Web Speech API, déjà dans Chromium/WebView2) | Moyen — `speechSynthesis` natif, découpage du texte en phrases | ⬜ |
| 3.4 | **Correcteur orthographique** | Détection en temps réel (soulignement rouge) + clic droit pour suggestions — **ATTENTION** : le spellcheck natif du navigateur est DÉSACTIVÉ sur l'éditeur invisible (voir CLAUDE.md) — nécessite un moteur JS dédié (ex: `nspell` ou équivalent français) | Complexe — intégrer un dictionnaire français, marquer les erreurs dans la couche peinte | ⬜ |

---

## Priorité 4 — Infrastructure (peut se faire en parallèle)

| # | Fonctionnalité | Description | Faisabilité | Statut |
|---|---|---|---|---|
| 4.1 | **Palette de commandes** | Ctrl+K — recherche rapide de toutes les commandes (façon VS Code) | Simple | ⬜ |
| 4.2 | **Mise en forme Markdown à la frappe** | Taper `**gras**` convertit automatiquement en gras visuel | Simple — InputRule Tiptap | ⬜ |
| 4.3 | **Correction automatique** | Guillemets intelligents (« »), majuscule en début de phrase, etc. | Simple — InputRules Tiptap | ⬜ |
| 4.4 | **Export HTML autonome** | Un fichier HTML avec tout inclus (CSS inline, mise en page, images en base64) pour publication web ou partage sans lecteur PDF | Moyen | ⬜ |
| 4.5 | **Plan du document** | Navigateur de titres dans un panneau latéral (cliquer pour sauter à la section) | Simple — mêmes données que le sommaire | ⬜ |

---

## Priorité 5 — Le format `.xmd` (APRÈS tout le reste)

| # | Fonctionnalité | Description |
|---|---|---|
| 5.1 | **Images** | Dossier `images/` par document (dans le conteneur `.xmd`), copie automatique au collage/glisser, chemins relatifs dans le `.md` |
| 5.2 | **Commentaires de relecture** | Ajouter/répondre/résoudre des commentaires sur une sélection de texte (comme Word) |
| 5.3 | **Suivi des versions** | Historique des modifications avec diff structurel (comparer deux versions) |
| 5.4 | **Champs de version** | Variables `{{version}}` enrichies : historique des révisions dans les métadonnées du conteneur |
| 5.5 | **Format conteneur** | Voir les questions ouvertes dans `docs/format-fichier.md` §9 — à trancher ensemble |

---

## Récapitulatif — ce qui est DÉJÀ FONCTIONNEL

✅ Éditeur WYSIWYG complet (toutes les mises en forme) | ✅ Vraie pagination A4 fidèle à l'impression | ✅ Ruban à la Word (2 onglets, coin droit) | ✅ Mini-barre de sélection | ✅ Menu clic droit texte | ✅ Tableaux complets (fusion, bordures sur schéma, poignées de largeur) | ✅ En-têtes/pieds riches (Markdown + variables + champs personnalisés) | ✅ Formules MathLive WYSIWYG (palette de symboles + édition directe sur la page) | ✅ Sommaire auto + panneau | ✅ Styles de titres + numérotation + panneau avec aperçu exact | ✅ Explorateur complet | ✅ Dialogue Mise en page à la Word | ✅ Règles horizontale + verticale avec triangles de marge glissants | ✅ Rechercher/Remplacer (Ctrl+F + champ de la barre de titre) | ✅ Fenêtre Propriétés du document | ✅ Éditeur de diagrammes Mermaid dédié (panneau latéral) | ✅ Menu Interligne façon Word + fenêtre Paragraphe (retraits, espacement) | ✅ Tabulation ± | ✅ Mémorisation couleur des boutons | ✅ Fenêtre Paramétrage (règles, auto-sauvegarde, ⚙ de la barre de titre) | ✅ Fenêtre Utilisateur V1 (avatar cliquable, prénom + nom) | ✅ Sections (saut de section, numérotation remise à zéro, sommaires dédiés + global) | ✅ Pages de garde — zone transparente (contenu normal éditable, en-tête/pied masqués, champs {{variable}} inline) | ✅ Panneaux latéraux harmonisés avec icônes | ✅ Export PDF (format réel, fonds) + impression avec aperçu (boîte du navigateur) | ✅ Notes de bas de page | ✅ Signets + renvois | ✅ Recherche dans l'explorateur | ✅ Emoji à catégories | ✅ 51 tests unitaires | ✅ Documentation complète (guide + référence technique + README + captures)

---

## Ordre de développement proposé

```
Phase actuelle
    ├── 0.1 à 0.3 Qualité : audit, passe de test, impression — FAIT (2026-10-22)
    ├── 0.4 à 0.8 Dette restante (hooks, prompts, npm audit, sommaire) ← à glisser entre les fonctionnalités
    ├── Panneau Équation : palette de symboles (point ② maquette) — FAIT
    ├── Panneau Équation : édition directe sur la page (point ① maquette) — FAIT
    ├── 2.1 Boutons Tabulation ± — FAIT
    ├── 2.2 Interligne + espacement (menu Word + fenêtre Paragraphe) — FAIT
    ├── 2.3 Mémorisation couleur (boutons) — FAIT
    ├── 1.1 Règles horizontale + verticale glissantes — FAIT
    ├── 2.4 Rechercher / Remplacer (panneau latéral) — FAIT
    ├── 1.3 Fenêtre Propriétés du document — FAIT
    ├── 1.6 Champs personnalisés (en-tête/pied) — FAIT
    ├── 3.2 Sauvegarder/charger un style complet   ← PROCHAINE ÉTAPE
    ├── 3.1 Pages de garde — FAIT
    ├── 1.4 Fenêtre Paramétrage (afficher/masquer règles, etc.) — FAIT
    ├── 1.5 Fenêtre Utilisateur (V1 : nom + prénom) — FAIT (V1)
    ├── 3.3 Lecture à voix haute
    ├── 3.4 Correcteur orthographique
    ├── 4.1 Palette de commandes
    ├── 4.2 Markdown à la frappe
    ├── 4.3 Correction automatique
    ├── 4.4 Export HTML
    ├── 4.5 Plan du document
    │
    ╰──► FORMAT .xmd (5.1-5.5) : images, commentaires, versions, historique
```

---

<!-- ================================================================ -->
<!-- VOS COMMENTAIRES / PRIORITÉS ==================================== -->
<!-- Ajoutez ci-dessous vos ajustements, vos priorités, ce que je dois -->
<!-- faire avant autre chose, etc. -->
<!-- ... -->
<!-- ================================================================ -->
