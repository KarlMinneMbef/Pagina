<p align="center">
  <img src="public/pagina-logo-lockup.svg" alt="Pagina" width="360">
</p>

**L'éditeur Markdown qui se met en page comme Word — et qui reste du Markdown.**

![Vue principale — ruban Accueil, explorateur, pages A4](docs/images/capture-accueil.png)

![Ruban Insertion](docs/images/capture-insertion.png)

![Mini-barre de sélection](docs/images/capture-minibar.png)

Pagina est un éditeur de documents WYSIWYG (« ce que vous voyez est ce que vous obtenez ») bâti autour du Markdown : vous rédigez et mettez en page à l'écran, avec de vraies pages A4, des titres numérotés automatiquement, un en-tête et un pied de page, un sommaire cliquable — et le fichier que vous enregistrez reste un `.md` tout à fait standard, lisible et correctement affiché dans n'importe quel autre outil (GitHub, VS Code, Obsidian, Typora...).

> **Documentation complète** : le [guide d'utilisation](docs/guide-utilisation.md) décrit chaque commande de l'application ; la [référence technique](docs/reference-technique.md) documente l'architecture et l'implémentation pour les développeurs.

## L'histoire

Chez [**Mon BE Fluides**](https://www.monbefluides.fr), bureau d'études fluides, on rédige beaucoup : CCTP, procédures techniques, comptes rendus de chantier. Ces documents ont besoin d'une vraie mise en page — un en-tête avec le nom du projet, une numérotation de pages, un sommaire, des titres numérotés — mais on ne voulait pas s'enfermer dans le format `.docx` : fichiers lourds, binaires, difficiles à suivre dans un historique de versions, dépendants d'une seule suite bureautique.

Autre motivation, plus interne : il nous fallait aussi un format simple et texte, plus facile à faire ingérer et indexer par notre RAG (Ingenerix) que des documents Word — un fichier `.md` se lit directement, sans conversion ni parsing fragile.

Le Markdown résout ce problème de portabilité depuis longtemps... mais nativement, il ne sait rien faire de tout ça : pas d'en-tête, pas de pagination, pas de sommaire généré. Les outils existants forcent soit à écrire du Markdown "à l'aveugle" dans un simple éditeur de texte, soit à basculer dans un traitement de texte classique et perdre la portabilité.

Pagina est notre réponse : un vrai éditeur visuel, avec de vraies pages qui se comportent comme dans Word, mais qui n'écrit jamais rien d'autre que du Markdown lisible partout. Tout ce qui n'existe pas nativement en Markdown (saut de page, sommaire, réglages de mise en page, styles de titre) est encodé dans des commentaires HTML standards (`<!-- ... -->`) — invisibles et sans le moindre effet de bord dans n'importe quel autre outil Markdown qui ouvrirait le même fichier.

Développé en interne, on a choisi de le rendre public : si un autre bureau d'études, une autre entreprise ou un développeur peut s'en servir ou s'en inspirer, tant mieux.

## Fonctionnalités

### Édition et mise en page
- **Éditeur WYSIWYG complet** : gras, italique, souligné, barré, couleur, surlignage, indice/exposant, alignement, code en ligne — mise en forme visuelle immédiate.
- **Vraie pagination à l'écran** : des pages A4/Letter à taille fixe (comme dans Word), pas une simple simulation — ce que vous voyez à l'écran est exactement ce qui sera imprimé/exporté en PDF.
- **Boîte de dialogue « Mise en page » à la Word** : trois onglets (Marges, Papier, Mise en page), cinq formats papier (A3, A4, A5, Letter, Legal) plus dimensions personnalisées, orientation, « à partir du bord » de l'en-tête/pied, « première page différente », aperçu en direct, et « Définir par défaut » pour que les nouveaux documents naissent avec vos réglages.
- **En-tête et pied de page riches** : du contenu Markdown ordinaire dupliqué sur chaque page — police, taille, couleur, alignement, tableaux, tout se met en forme depuis le ruban habituel. Variables dynamiques (`{{page}}`, `{{pages}}`, `{{date}}`, `{{filename}}`, `{{version}}`, `{{author}}`) insérables en un clic depuis le panneau latéral. Édition directement en cliquant sur la zone dans la page.
- **Styles de titres et numérotation automatique** : police, taille, couleur par niveau de titre (H1 à H6), schéma de numérotation configurable (1.1., A., i....) écrit directement dans le texte — donc toujours correct, même ouvert ailleurs.
- **Sommaire automatique**, généré à partir des titres réels du document, avec des liens cliquables qui font défiler jusqu'au bon endroit.
- **Zoom** façon Word/Google Docs (25 % à 400 %).

### Contenu riche, toujours du Markdown standard
- **Tableaux** avec alignement de colonnes (gauche/centre/droite), fusion/scission de cellules et **bordures éditées directement sur un schéma** (cliquer un côté du schéma applique la bordure : style, épaisseur, couleur) dans le panneau « Outils de tableau » qui apparaît dès que le curseur est dans une cellule.
- **Blocs de code avec coloration syntaxique** (une trentaine de langages).
- **Notes de bas de page** (syntaxe `[^1]`/`[^1]: ...`, standard Pandoc/GFM).
- **Diagrammes Mermaid** et **formules LaTeX** (KaTeX), avec édition de la source et aperçu rendu en direct.
- **Liens, signets et renvois** (ancre `<a id>` invisible + lien Markdown `#ancre`), citations, listes (à puces, numérotées, à cocher), séparateurs, emoji.
- **Saut de page manuel**, sommaire, styles de titre : tout encodé en commentaires HTML Markdown standards, invisibles ailleurs.

### Autour de l'édition
- **Ruban à la Word** : deux onglets (Accueil, Insertion), icônes SVG dessinées pour l'application, presse-papiers câblé, et au coin droit les boutons **Explorateur** et **Commenter** (à venir) au même emplacement que « Partager » dans Word.
- **Panneaux contextuels latéraux droits** : une seule colonne à onglets — « Outils de tableau » (lignes, colonnes, cellules, alignement vertical, bordures sur schéma) et « En-tête/Pied de page » (variables) apparaissent et disparaissent selon le contexte, sans jamais recouvrir la page.
- **Explorateur de fichiers** intégré : recherche instantanée dans l'arborescence (vue aplatie des correspondances), menu contextuel (nouveau fichier/dossier, renommer, dupliquer, supprimer — dialogues maison avec validation, jamais d'invite système), badge « modifié », tri dossiers-puis-fichiers insensible aux accents, chemin complet au survol, rafraîchissement en direct du disque, ergonomie clavier (flèches, Entrée, Suppr, F2, double-clic).
- **Ouverture directe de fichiers** (sans passer par un dossier), **Enregistrer sous**, et **association de fichiers Windows** : un `.md`/`.xmd` peut s'ouvrir en double-cliquant dessus dans l'Explorateur ("Ouvrir avec Pagina" ou en application par défaut).
- **Onglets multi-fichiers**, avec indicateur de modifications non enregistrées.
- **Export PDF réel**, directement depuis la mise en page affichée à l'écran (pas un moteur de rendu séparé qui pourrait diverger).
- Interface en français, aux couleurs de la charte MBEF, testée unitairement (Vitest + Testing Library).

## Principe technique clé

Tout ce qui n'a pas d'équivalent Markdown standard est encodé en commentaires HTML (`<!-- pagebreak -->`, `<!-- toc -->`, `<!-- pagina:config {...} -->`...) : ce sont des balises reconnues et rendues invisibles par n'importe quel moteur Markdown, donc le fichier reste toujours lisible et correctement affiché ailleurs, même sans Pagina. Les rares mises en forme sans équivalent Markdown (couleur de texte, alignement...) sont sérialisées en `<span style="...">`, lisible partout mais hors syntaxe Markdown pure — un compromis assumé, toujours réversible.

## Installation (Windows)

Les installeurs prêts à l'emploi se trouvent dans [`releases/`](releases/) :
- [`Pagina_0.4.10_x64-setup.exe`](releases/Pagina_0.4.10_x64-setup.exe) — installation manuelle simple.
- [`Pagina_0.4.10_x64_en-US.msi`](releases/Pagina_0.4.10_x64_en-US.msi) — pour un déploiement centralisé (GPO/Intune).

Aucun certificat de signature de code n'est configuré : Windows SmartScreen affichera un avertissement « éditeur non reconnu » au premier lancement — cliquer sur « Informations complémentaires → Exécuter quand même ».

## Documentation

- [Guide d'utilisation](docs/guide-utilisation.md) — chaque commande de l'application, fonction par fonction (ruban, panneaux contextuels, explorateur, mise en page, équations, en-têtes/pieds, impression, raccourcis).
- [Référence technique](docs/reference-technique.md) — architecture (éditeur invisible + couche peinte, index des clones), sérialisation Markdown, extensions, panneaux, charte MBEF, tests, version légère.

## Version légère intégrable

Une version réduite (WYSIWYG + pages A4, sans explorateur ni Tauri) existe pour être intégrée dans d'autres applications : voir [`docs/version-legere.md`](docs/version-legere.md).

## Stack technique

Tauri (Rust) + React + TypeScript, éditeur riche basé sur Tiptap/ProseMirror.

## Statut

En développement actif.

## Feuille de route

- **Correcteur orthographique** intégré à l'éditeur.
- **Édition de tableaux avancée** : largeurs de colonne personnalisées (hors Markdown standard, volontairement exclues pour l'instant). La fusion/scission de cellules et les bordures éditables sur schéma sont déjà disponibles, avec repli HTML valide.
- **Commentaires de relecture** (bouton « Commenter » du ruban, désactivé en attendant) et **Propriétés du document / compte utilisateur** (version, auteur).
- **Export HTML**, en plus du PDF déjà disponible — un fichier autonome, mise en page incluse, pour publication web ou partage sans lecteur PDF.
- **Un vrai format `.xmd`** (au-delà du simple fichier `.md` actuel) : suivi des versions du document, historique des modifications, commentaires de relecture, et une gestion d'images plus aboutie (dossier `images/` dédié par document, copie automatique au collage/glisser) — packagé pour rester portable.
- **Module d'édition assistée par IA** : sélection d'un passage de texte, correction/reformulation proposée par un modèle, validation façon "suivi des modifications" Word.
- **Import / export Word (.docx)** : ouvrir un document Word existant et le convertir en Markdown éditable dans Pagina, et inversement exporter un document Pagina en `.docx` fidèle à la mise en page.
- **Autres pistes à évaluer** : multi-fenêtres natives, thèmes graphiques personnalisables, signature de l'installeur Windows.

## Licence

Pagina est publié sous licence **MIT** (voir le fichier [`LICENSE`](LICENSE)).

En résumé, en français : n'importe qui peut utiliser, copier, modifier et redistribuer ce logiciel librement, y compris dans un contexte commercial — la seule obligation est de conserver la mention de copyright et le texte de la licence dans les copies. Le logiciel est fourni "tel quel", sans garantie d'aucune sorte.

## À propos

Pagina est développé par [**Mon BE Fluides**](https://www.monbefluides.fr), bureau d'études fluides.
