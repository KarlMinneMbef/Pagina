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

Le Markdown résout ce problème de portabilité depuis longtemps... mais nativement, il ne sait rien faire de tout ça : pas d'en-tête, pas de pagination, pas de sommaire généré. Les outils existants forcent soit à écrire du Markdown "à l'aveugle" dans un simple éditeur de texte, soit à basculer dans un traitement de texte classique et perdre la portabilité.

Pagina est notre réponse : un vrai éditeur visuel, avec de vraies pages qui se comportent comme dans Word, mais qui n'écrit jamais rien d'autre que du Markdown lisible partout. Tout ce qui n'existe pas nativement en Markdown (saut de page, sommaire, réglages de mise en page, styles de titre) est encodé dans des commentaires HTML standards (`<!-- ... -->`) — invisibles et sans le moindre effet de bord dans n'importe quel autre outil Markdown qui ouvrirait le même fichier.

Développé en interne, on a choisi de le rendre public : si un autre bureau d'études, une autre entreprise ou un développeur peut s'en servir ou s'en inspirer, tant mieux.

## Fonctionnalités

### Édition et mise en page
- **Éditeur WYSIWYG complet** : gras, italique, souligné, barré, couleur, surlignage, indice/exposant, alignement, code en ligne — mise en forme visuelle immédiate.
- **Vraie pagination à l'écran** : des pages A4/Letter à taille fixe (comme dans Word), pas une simple simulation — ce que vous voyez à l'écran est exactement ce qui sera imprimé/exporté en PDF.
- **Boîte de dialogue « Mise en page » à la Word** : marges, cinq formats papier (A3, A4, A5, Letter, Legal) plus dimensions personnalisées, orientation, « à partir du bord » de l'en-tête/pied, « première page différente », texte justifié, bordure de page, aperçu en direct, et « Définir par défaut » pour que les nouveaux documents naissent avec vos réglages.
- **En-tête et pied de page riches** : du contenu Markdown ordinaire dupliqué sur chaque page — police, taille, couleur, alignement, tableaux, tout se met en forme depuis le ruban habituel. Variables dynamiques (`{{page}}`, `{{pages}}`, `{{date}}`, `{{filename}}`, `{{version}}`, `{{author}}` et champs personnalisés) insérables en un clic. Édition directement en cliquant sur la zone dans la page.
- **Styles de titres et numérotation automatique** : police, taille, couleur, soulignement, majuscules, centrage, bandeau (avec ou non pleine largeur) par niveau de titre (H1 à H6), schéma de numérotation configurable (1.1., A., I....) écrit directement dans le texte — donc toujours correct, même ouvert ailleurs.
- **Styles de document enregistrables** : toute la mise en forme (styles de titres, marges, en-tête/pied, sommaire) se sauvegarde, s'applique en un clic à un autre document, s'exporte et s'importe en `.json`. Un style « CCTP » prêt à l'emploi est fourni.
- **Sommaire automatique** avec liens cliquables, mise en forme réglable (retrait, puces, couleur) et numéros de page avec points de conduite.
- **Pages de garde** : cinq modèles éditables directement sur la page (thèmes, marges propres), enregistrables comme types personnalisés.
- **Correcteur orthographique** français intégré (suggestions au clic droit, mots ajoutés au dictionnaire personnel) et **correction automatique** (guillemets français « », majuscule en début de phrase).
- **Zoom** façon Word/Google Docs (25 % à 400 %).

### Contenu riche, toujours du Markdown standard
- **Tableaux** avec alignement de colonnes, fusion/scission de cellules, **bordures éditées directement sur un schéma**, fonds de cellule, alignement vertical, redimensionnement des colonnes à la souris — un tableau plus long que la page se coupe proprement.
- **Images** : insertion par bouton, collage de capture d'écran ou glisser-déposer ; redimensionnement à la poignée ou au pourcentage (y compris dans les tableaux), rotation, miroirs, bordure, texte alternatif.
- **Blocs de code avec coloration syntaxique** (une trentaine de langages), **diagrammes Mermaid**, **formules LaTeX** (KaTeX) avec édition et aperçu en direct.
- **Notes de fin de document** (syntaxe `[^1]`, standard Pandoc/GFM), liens, signets et renvois, citations, listes, séparateurs, emoji.
- **Saut de page manuel**, sommaire, réglages de mise en page : tout encodé en commentaires HTML Markdown standards, invisibles ailleurs.

### Format conteneur `.xmd`
Un `.xmd` est un ZIP qui contient le `document.md` (Markdown standard, rien de visible en plus dans un autre lecteur), ses `images/`, `comments.json` et `history.json`. Il ajoute :
- **Commentaires de relecture** façon Word : sélectionner un passage, commenter, répondre, résoudre — le surlignage ne sort jamais dans le PDF.
- **Historique des versions** : instantanés automatiques à l'enregistrement, versions nommées, restauration avec différence chiffrée, comparaison mot par mot de deux versions.

### Conversion Word et LibreOffice
- **Importer** un `.docx`/`.odt` (onglet « Convertir », clic droit ou double-clic dans l'explorateur) : un `.xmd` est créé à côté de l'original, jamais d'écrasement — texte, mise en forme, tableaux (proportions conservées) et images repris.
- **Exporter** le document actif en `.docx` ou `.odt`, images comprises. La conversion passe par [Pandoc](https://pandoc.org) (gratuit, open source, à installer une fois).

### Autour de l'édition
- **Ruban à la Word** : onglets Accueil, Insertion et Convertir, icônes SVG dessinées pour l'application, et au coin droit Explorateur, Commenter et Historique.
- **Panneaux contextuels latéraux** : « Outils de tableau », « En-tête/Pied de page », « Sommaire », « Image »... apparaissent selon le contexte, sans jamais recouvrir la page.
- **Explorateur de fichiers** intégré : recherche instantanée, menu contextuel complet (dialogues maison, jamais d'invite système), badge « modifié », rafraîchissement en direct du disque. Les `.docx`, `.odt` et `.pdf` y apparaissent avec leur icône et un menu « Convertir ».
- **Ouverture directe de fichiers**, **Enregistrer sous**, **association de fichiers Windows** (double-clic sur un `.md`/`.xmd`).
- **Onglets multi-fichiers**, avec indicateur de modifications non enregistrées.
- **Export PDF réel** et impression avec aperçu, directement depuis la mise en page affichée à l'écran. Un bouton « Vérifier » détecte et répare un fichier abîmé (zone de page de garde non refermée...), avec copie de sauvegarde.
- Interface en français, aux couleurs de la charte MBEF, testée unitairement (Vitest + Testing Library).

## Principe technique clé

Tout ce qui n'a pas d'équivalent Markdown standard est encodé en commentaires HTML (`<!-- pagebreak -->`, `<!-- toc -->`, `<!-- pagina:config {...} -->`...) : ce sont des balises reconnues et rendues invisibles par n'importe quel moteur Markdown, donc le fichier reste toujours lisible et correctement affiché ailleurs, même sans Pagina. Les rares mises en forme sans équivalent Markdown (couleur de texte, alignement...) sont sérialisées en `<span style="...">`, lisible partout mais hors syntaxe Markdown pure — un compromis assumé, toujours réversible.

## Installation (Windows)

Les installeurs prêts à l'emploi sont publiés dans la section **Releases** de ce dépôt GitHub (à droite de la page d'accueil, puis choisir la version) :
- `Pagina_x64-setup.exe` — installation manuelle simple.
- `Pagina_x64_en-US.msi` — pour un déploiement centralisé (GPO/Intune).

Aucun certificat de signature de code n'est configuré : Windows SmartScreen affichera un avertissement « éditeur non reconnu » au premier lancement — cliquer sur « Informations complémentaires → Exécuter quand même ».

## Documentation

- [Guide d'utilisation](docs/guide-utilisation.md) — chaque commande de l'application, fonction par fonction (ruban, panneaux contextuels, explorateur, mise en page, images, équations, en-têtes/pieds, conversion, impression, raccourcis).
- [Référence technique](docs/reference-technique.md) — architecture (éditeur invisible + couche peinte, index des clones), sérialisation Markdown, extensions, panneaux, charte MBEF, tests, version légère.

## Version légère intégrable

Une version réduite (WYSIWYG + pages A4, sans explorateur ni Tauri) existe pour être intégrée dans d'autres applications : voir [`docs/version-legere.md`](docs/version-legere.md).

## Stack technique

Tauri (Rust) + React + TypeScript, éditeur riche basé sur Tiptap/ProseMirror.

## Statut

En développement actif. Version courante : **0.4.11**.

## Feuille de route

- **Palette de commandes** (Ctrl+K) et **plan du document** (panneau de titres cliquables).
- **Markdown à la frappe** : taper `**gras**` le convertit automatiquement en gras visuel.
- **Export HTML autonome** — un fichier autonome, mise en page incluse, pour publication web ou partage sans lecteur PDF.
- **Thème sombre**, **langue** de l'interface.
- **Tableaux imbriqués** (dans les cellules, pour les pages de garde complexes).
- **Autres pistes à évaluer** : multi-fenêtres natives, signature de l'installeur Windows.

## Licence

Pagina est publié sous licence **MIT** (voir le fichier [`LICENSE`](LICENSE)).

En résumé, en français : n'importe qui peut utiliser, copier, modifier et redistribuer ce logiciel librement, y compris dans un contexte commercial — la seule obligation est de conserver la mention de copyright et le texte de la licence dans les copies. Le logiciel est fourni "tel quel", sans garantie d'aucune sorte.

## À propos

Pagina est développé par [**Mon BE Fluides**](https://www.monbefluides.fr), bureau d'études fluides.
