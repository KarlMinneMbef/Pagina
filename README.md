# Pagina

**L'éditeur Markdown qui se met en page comme Word — et qui reste du Markdown.**

Pagina est un éditeur de documents WYSIWYG (« ce que vous voyez est ce que vous obtenez ») bâti autour du Markdown : vous rédigez et mettez en page à l'écran, avec de vraies pages A4, des titres numérotés automatiquement, un en-tête et un pied de page, un sommaire cliquable — et le fichier que vous enregistrez reste un `.md` tout à fait standard, lisible et correctement affiché dans n'importe quel autre outil (GitHub, VS Code, Obsidian, Typora...).

## L'histoire

Chez [**Mon BE Fluides**](https://www.monbefluides.fr), bureau d'études fluides, on rédige beaucoup : CCTP, procédures techniques, comptes rendus de chantier. Ces documents ont besoin d'une vraie mise en page — un en-tête avec le nom du projet, une numérotation de pages, un sommaire, des titres numérotés — mais on ne voulait pas s'enfermer dans le format `.docx` : fichiers lourds, binaires, difficiles à suivre dans un historique de versions, dépendants d'une seule suite bureautique.

Le Markdown résout ce problème de portabilité depuis longtemps... mais nativement, il ne sait rien faire de tout ça : pas d'en-tête, pas de pagination, pas de sommaire généré. Les outils existants forcent soit à écrire du Markdown "à l'aveugle" dans un simple éditeur de texte, soit à basculer dans un traitement de texte classique et perdre la portabilité.

Pagina est notre réponse : un vrai éditeur visuel, avec de vraies pages qui se comportent comme dans Word, mais qui n'écrit jamais rien d'autre que du Markdown lisible partout. Tout ce qui n'existe pas nativement en Markdown (saut de page, sommaire, réglages de mise en page, styles de titre) est encodé dans des commentaires HTML standards (`<!-- ... -->`) — invisibles et sans le moindre effet de bord dans n'importe quel autre outil Markdown qui ouvrirait le même fichier.

Développé en interne, on a choisi de le rendre public : si un autre bureau d'études, une autre entreprise ou un développeur peut s'en servir ou s'en inspirer, tant mieux.

## Fonctionnalités

### Édition et mise en page
- **Éditeur WYSIWYG complet** : gras, italique, souligné, barré, couleur, surlignage, indice/exposant, alignement, code en ligne — mise en forme visuelle immédiate.
- **Vraie pagination à l'écran** : des pages A4/Letter à taille fixe (comme dans Word), pas une simple simulation — ce que vous voyez à l'écran est exactement ce qui sera imprimé/exporté en PDF.
- **Mise en page configurable par document** : format papier, orientation, marges, tout réglable depuis une boîte de dialogue dédiée.
- **En-tête et pied de page** avec variables dynamiques (`{{page}}`, `{{pages}}`, `{{date}}`, `{{filename}}`, `{{version}}`, `{{auteur}}`), édition directement en cliquant dessus dans la page, et réglage indépendant pour la première page.
- **Styles de titres et numérotation automatique** : police, taille, couleur par niveau de titre (H1 à H6), schéma de numérotation configurable (1.1., A., i....) écrit directement dans le texte — donc toujours correct, même ouvert ailleurs.
- **Sommaire automatique**, généré à partir des titres réels du document, avec des liens cliquables qui font défiler jusqu'au bon endroit.
- **Zoom** façon Word/Google Docs (25 % à 400 %).

### Contenu riche, toujours du Markdown standard
- **Tableaux** avec alignement de colonnes (gauche/centre/droite), conservé à l'enregistrement (syntaxe GFM).
- **Blocs de code avec coloration syntaxique** (une trentaine de langages).
- **Notes de bas de page** (syntaxe `[^1]`/`[^1]: ...`, standard Pandoc/GFM).
- **Diagrammes Mermaid** et **formules LaTeX** (KaTeX), avec édition de la source et aperçu rendu en direct.
- **Liens, images, citations, listes (à puces, numérotées, à cocher), séparateurs, emoji.**
- **Saut de page manuel**, sommaire, styles de titre : tout encodé en commentaires HTML Markdown standards, invisibles ailleurs.

### Autour de l'édition
- **Explorateur de fichiers** intégré : ouverture d'un dossier de travail, arborescence `.md`/`.xmd`, création de fichiers et dossiers.
- **Onglets multi-fichiers**, avec indicateur de modifications non enregistrées.
- **Export PDF réel**, directement depuis la mise en page affichée à l'écran (pas un moteur de rendu séparé qui pourrait diverger).
- Interface façon ruban, en français, pensée pour rester lisible même avec beaucoup de commandes.

## Principe technique clé

Tout ce qui n'a pas d'équivalent Markdown standard est encodé en commentaires HTML (`<!-- pagebreak -->`, `<!-- toc -->`, `<!-- pagina:config {...} -->`...) : ce sont des balises reconnues et rendues invisibles par n'importe quel moteur Markdown, donc le fichier reste toujours lisible et correctement affiché ailleurs, même sans Pagina. Les rares mises en forme sans équivalent Markdown (couleur de texte, alignement...) sont sérialisées en `<span style="...">`, lisible partout mais hors syntaxe Markdown pure — un compromis assumé, toujours réversible.

## Installation (Windows)

Les installeurs prêts à l'emploi se trouvent dans [`releases/`](releases/) :
- [`Pagina_0.4.5_x64-setup.exe`](releases/Pagina_0.4.5_x64-setup.exe) — installation manuelle simple.
- [`Pagina_0.4.5_x64_en-US.msi`](releases/Pagina_0.4.5_x64_en-US.msi) — pour un déploiement centralisé (GPO/Intune).

Aucun certificat de signature de code n'est configuré : Windows SmartScreen affichera un avertissement « éditeur non reconnu » au premier lancement — cliquer sur « Informations complémentaires → Exécuter quand même ».

## Stack technique

Tauri (Rust) + React + TypeScript, éditeur riche basé sur Tiptap/ProseMirror.

## Statut

En développement actif.

## Feuille de route

- **Correcteur orthographique** intégré à l'éditeur.
- **Conception de tableaux Markdown** plus visuelle (ajout/suppression de lignes-colonnes, redimensionnement à la souris déjà partiellement présent, fusion de cellules).
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
