# Format de fichier Pagina (.md) — Spécification de référence

> **Document vivant.** Ce fichier décrit le format `.md` tel qu'implémenté dans Pagina. Il sert de source unique de vérité pour la cohérence du format. Vous pouvez ajouter vos propres commentaires, décisions et annotations directement dedans — c'est fait pour ça.

<!-- ================================================================ -->
<!-- VOS COMMENTAIRES / DÉCISIONS ==================================== -->
<!-- Ajoutez ci-dessous vos remarques, arbitrages, idées pour le .xmd -->
<!-- ... -->
<!-- ================================================================ -->

---

## 1. PRINCIPE DIRECTEUR

Le fichier enregistré est un **Markdown 100 % standard** (GFM). Tout ce qui n'existe pas nativement en Markdown est encodé dans des **commentaires HTML** (`<!-- ... -->`) — invisibles et sans effet de bord dans n'importe quel autre outil (GitHub, VS Code, Obsidian, Typora…).

**Règle d'or** : un fichier Pagina ouvert dans un autre outil doit s'afficher correctement, sans aucun artefact visible.

---

## 2. STRUCTURE DU FICHIER (de haut en bas)

```
<!-- pagina:config {"configVersion":1,"layout":{...}} -->     ← ligne 1 (toujours)
<!-- pagina:generator {...} -->                               ← ligne 2 (toujours)

[contenu du document — Markdown standard]
```

### 2.1 Les deux commentaires de tête

| Commentaire | Rôle | Relu au chargement ? |
|---|---|---|
| `<!-- pagina:config {...} -->` | TOUT le réglage de mise en page du document (voir §3) | **Oui** — c'est lui qui pilote le rendu |
| `<!-- pagina:generator {...} -->` | Identité de l'outil qui a écrit le fichier (nom, version, éditeur, licence) | **Non** — purement informatif, réécrit à chaque sauvegarde |

**Règle** : maximum **2 lignes** de commentaire en tête de fichier. Toute nouvelle information de configuration future doit rejoindre le **JSON du commentaire `pagina:config` existant**, jamais une troisième ligne.

### 2.2 Les commentaires dans le corps du texte

| Commentaire | Rôle | Emplacement |
|---|---|---|
| `<!-- pagebreak -->` | Saut de page manuel | N'importe où dans le texte |
| `<!-- toc -->` | Emplacement du sommaire (remplacé par la liste réelle à la génération) | Généralement après le titre |
| `<!-- coverzone-start [header] [theme=nom] -->` … `<!-- coverzone-end -->` | Page de garde : deux marqueurs encadrent du contenu NORMAL (voir §5.4) | En général en tête de document |

---

## 3. LE JSON `pagina:config` — champs de `layout`

> **Version de schéma** : `configVersion: 1` — permet de distinguer un ancien format à migrer d'un format inconnu à ignorer.

```json
{
  "configVersion": 1,
  "layout": {
    "fontFamily": "Arial, sans-serif",
    "fontSize": "10pt",
    "lineHeight": 1.15,
    "paragraphSpacingPt": 8,

    "marginTopMm": 25,
    "marginBottomMm": 25,
    "marginLeftMm": 20,
    "marginRightMm": 20,

    "paperSize": "A4",
    "orientation": "portrait",
    "widthMm": null,
    "heightMm": null,

    "header": {
      "text": "",
      "heightMm": 12,
      "showOnFirstPage": true,
      "fromEdgeMm": 12.5
    },
    "footer": {
      "text": "",
      "heightMm": 12,
      "showOnFirstPage": true,
      "fromEdgeMm": 12.5
    },

    "documentVersion": "",
    "author": "",

    "headingStyles": {
      "1": { "fontFamily": "…", "fontSize": "20pt", "color": "#2f52a0", "bold": true, "italic": false, "numbering": "none" },
      "2": { "…": "…" },
      "3": { "…": "…" },
      "4": { "…": "…" },
      "5": { "…": "…" },
      "6": { "…": "…" }
    }
  }
}
```

### Règles de cohérence

| Champ | Type | Défaut | Règle |
|---|---|---|---|
| `paperSize` | `"A3"` \| `"A4"` \| `"A5"` \| `"Letter"` \| `"Legal"` | `"A4"` | Si `widthMm`/`heightMm` sont définis, ils priment sur le format |
| `widthMm`, `heightMm` | `number?` (optionnel) | absent | Définis = dimensions personnalisées ; absents = celles du `paperSize` |
| `orientation` | `"portrait"` \| `"landscape"` | `"portrait"` | Inverse largeur/hauteur réelles |
| `header.text` / `footer.text` | `string` (Markdown) | `""` | Vide = pas d'en-tête/pied. Le contenu est du **Markdown** (converti en HTML uniquement au moment de la peinture) |
| `header.fromEdgeMm` | `number` | `12.5` | Distance du bord de la page au début de la zone |
| `header.showOnFirstPage` | `boolean` | `true` | `false` = masqué sur la première page uniquement |
| `headingStyles.{n}.numbering` | `"none"` \| `"decimal"` \| `"upperRoman"` \| `"lowerRoman"` \| `"upperAlpha"` \| `"lowerAlpha"` | `"none"` | Le préfixe de numérotation est **écrit dans le texte des titres** (pas en CSS), donc toujours correct ouvert ailleurs |
| `documentVersion`, `author` | `string` | `""` | Champs libres — disponibles comme variables `{{version}}`/`{{author}}` dans l'en-tête/pied |

---

## 4. VARIABLES DYNAMIQUES (dans l'en-tête/pied de page)

| Variable | Substituée par |
|---|---|
| `{{page}}` | Numéro de la page courante |
| `{{pages}}` | Nombre total de pages du document |
| `{{date}}` | Date du jour (jj/mm/aaaa) |
| `{{filename}}` | Nom du fichier (sans extension) |
| `{{version}}` | Valeur de `layout.documentVersion` |
| `{{author}}` | Valeur de `layout.author` |

Substituées **au moment de la peinture** (et à l'impression) — jamais écrites dans le fichier.

---

## 5. MISE EN FORME DANS LE CORPS DU TEXTE

### 5.1 Syntaxe Markdown standard (rien à faire — c'est du GFM natif)

| Élément | Syntaxe | Persisté tel quel |
|---|---|---|
| Gras | `**texte**` | Oui |
| Italique | `*texte*` | Oui |
| Souligné | `<u>texte</u>` | Oui (HTML inline) |
| Barré | `~~texte~~` | Oui |
| Code en ligne | `` `code` `` | Oui |
| Liens | `[texte](url)` | Oui |
| Images | `![alt](url)` | Oui |
| Listes | `- item` / `1. item` / `- [ ] tâche` | Oui |
| Citation | `> texte` | Oui |
| Bloc de code | ` ```langage … ``` ` | Oui |
| Séparateur | `---` | Oui |
| Tableaux GFM | `\| Col A \| Col B \|` | Oui |
| Notes de bas de page | `[^1]` / `[^1]: …` | Oui |
| Formules | `$formule$` / `$$formule$$` | Oui (convention Pandoc) |
| Diagrammes | Bloc ` ```mermaid ` | Oui |

### 5.2 Mise en forme hors Markdown standard (repli HTML)

| Élément | Sérialisation | Repli ailleurs |
|---|---|---|
| Couleur du texte | `<span style="color: …">texte</span>` | Lisible partout, hors syntaxe pure |
| Police personnalisée | `<span style="font-family: …">texte</span>` | Idem |
| Taille personnalisée | `<span style="font-size: …">texte</span>` | Idem |
| Surlignage | `<mark>texte</mark>` ou `<span style="background: …">` | HTML standard |
| Tableau avec fusion | HTML de tableau complet | Lisible partout |
| Bordures de cellule complexes | HTML de tableau complet | Lisible partout |

**Règle** : le repli HTML n'est utilisé QUE quand le GFM ne sait pas le faire — jamais par défaut, jamais pour quelque chose que GFM couvre.

### 5.3 Atomes Pagina spécifiques

| Élément | Dans le fichier | Repli ailleurs |
|---|---|---|
| Signet (ancre) | `<a id="signet"></a>` | HTML standard, invisible |
| Renvoi | `[texte](#signet)` | Lien Markdown standard |
| Saut de page | `<!-- pagebreak -->` | Commentaire HTML, invisible |
| Marqueur sommaire | `<!-- toc -->` | Commentaire HTML, invisible |
| Page de garde | `<!-- coverzone-start theme=chantier -->` … `<!-- coverzone-end -->` | Commentaires HTML invisibles ; le contenu s'affiche comme du Markdown ordinaire |

### 5.4 Pages de garde

Une page de garde est une page NORMALE : le contenu entre les deux marqueurs est du
Markdown pur — aucun HTML dans le fichier. Le marqueur de début porte les propriétés :
`header` (afficher l'en-tête/pied sur la page ; absent = masqués) et `theme=nom`
(apparence). Exemple :

```
<!-- coverzone-start theme=chantier -->

# {{title}}

## {{subject}}

Rédigé par : {{author}}

Émis le : {{date}}

<!-- coverzone-end -->

<!-- pagebreak -->
```

- `{{title}}`, `{{author}}`… sont des champs : l'application affiche la valeur des propriétés
  du document (on peut la saisir en cliquant sur le champ) ; le fichier garde la variable.
- Le thème (`classique`, `moderne`, `technique`, `minimal`, `chantier`) ne change QUE
  l'apparence, par type de bloc (`#` titre, `##` sous-titre, `###` repère, texte) — il
  n'est jamais écrit dans le contenu. Sans `theme`, la page est en style libre.
- Les titres d'une page de garde n'entrent ni dans le sommaire ni dans la numérotation.
- Anciens fichiers : une page de garde écrite en paragraphes `<p style="…">` reste lisible et
  éditable (style libre) ; elle n'est pas convertie automatiquement.

---

## 6. RÈGLES DE REPLI (fichier ouvert dans un autre outil)

| Cas | Comportement |
|---|---|
| Fichier **sans** les 2 commentaires de tête | Utilise `DEFAULT_PAGE_LAYOUT` — aucune erreur, aucun dialogue |
| Fichier avec un **JSON invalide** dans `pagina:config` | Idem — repli silencieux sur les défauts |
| Fichier avec `configVersion` **inconnu** (futur) | Idem — le schéma inconnu est ignoré |
| `widthMm`/`heightMm` **absents** | Utilise les dimensions du `paperSize` |
| `headingStyles` **partiel** (certains niveaux manquants) | Fusion niveau par niveau avec les défauts individuels |
| `header.fromEdgeMm` **absent** (ancien fichier) | Défaut 12,5 mm — placement ≈ identique à l'ancien comportement |

---

## 7. CYCLE DE VIE (aller-retour éditeur → fichier → éditeur)

1. **Au chargement** : `tabsStore.ts` dépouille les 2 commentaires de tête AVANT de donner le texte à Tiptap (qui ne les voit jamais). Le JSON de `pagina:config` est fusionné avec les défauts niveau par niveau (une clé manquante retombe sur sa valeur par défaut individuelle).
2. **À l'édition** : le contenu est du Markdown pur ; les mises en forme hors GFM sont des `<span style>` inline ; les atomes (pagebreak, toc, signets) sont des nœuds ProseMirror custom sérialisés en commentaires/HTML.
3. **À la sauvegarde** : `tiptap-markdown` sérialise le document en Markdown (avec replis HTML quand nécessaire), `withDocumentConfig` réinjecte le commentaire `pagina:config` en tête, le commentaire `pagina:generator` est reconstruit à neuf avec la version actuelle de l'app.

---

## 8. LIMITEURS / CHOIX ASSUMÉS

| Choix | Raison |
|---|---|
| Pas de front-matter YAML | Un YAML s'affiche comme un bloc de texte brut dans un outil qui ne le comprend pas ; un commentaire HTML est invisible partout |
| Mise en forme hors GFM en `<span style>` | Lisible et correctement rendu par tout moteur Markdown→HTML — juste pas en syntaxe Markdown pure |
| Numérotation des titres **dans le texte** (pas en CSS) | Toujours correct ouvert ailleurs, même sans Pagina |
| Les commentaires vivent HORS de Tiptap | `tiptap-markdown` fait disparaître un HTML comment au premier aller-retour — dépouillés/réinjectés par `tabsStore.ts` |
| Tableaux avec fusion = repli HTML complet | Le GFM ne sait pas représenter des cellules fusionnées ; le repli HTML reste lisible et correctement affiché partout |

---

## 9. VERS LE FORMAT `.xmd` — questions ouvertes

> **À définir ensemble avant de coder.** Ajoutez vos préférences en commentaire de cette section.

| Question | Option A | Option B | Statut |
|---|---|---|---|
| Conteneur ? | **ZIP** renommé `.xmd` (fichier `.md` + dossier `images/` + `settings.json`) | **Extension + dossier compagnon** (fichier `.xmd` = `.md` avec extension différente, images dans un dossier du même nom) | À trancher |
| Détection ? | Bascule automatique `.md` → `.xmd` à l'ajout d'une image (avec toast) | Choix explicite de l'utilisateur à la création | À trancher |
| Images ? | Dossier `images/` à l'intérieur du conteneur (chemin relatif dans le `.md`) | Dossier compagnon (chemin relatif à côté du fichier) | Dépend du choix conteneur |
| Ouverture ? | `.xmd` ouvrable comme un `.md` (repli : le ZIP contient le `.md` lisible en décompressant) | `.xmd` nécessite Pagina (sinon message explicite) | À trancher |
| Compatibilité ? | Toujours sauvegarder une copie `.md` à côté (option « double écriture ») | Uniquement le conteneur `.xmd` | À trancher |

<!-- ================================================================ -->
<!-- VOS COMMENTAIRES SUR LE .XMD ==================================== -->
<!-- ... -->
<!-- ================================================================ -->
