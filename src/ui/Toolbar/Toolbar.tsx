/**
 * Ruban principal, façon Word : une barre d'onglets (Accueil / Format avancé)
 * au-dessus de groupes de commandes légendés. Reste volontairement mince :
 * n'appelle que des commandes exposées par l'éditeur actif (voir
 * MarkdownEditorHandle) ou des actions globales (enregistrer). Ne connaît
 * pas le filesystem.
 *
 * Séparation des deux onglets (voulue explicitement) :
 * - "Accueil" : uniquement des commandes qui produisent du Markdown standard
 *   (CommonMark/GFM) ou un marqueur HTML universellement lisible
 *   (`<!-- pagebreak -->`) — rien ici ne dépend d'un rendu HTML particulier.
 * - "Format avancé" : tout ce qui n'a pas d'équivalent en Markdown standard
 *   et est sérialisé en `<span style="…">` dans le fichier .md (toujours
 *   lisible ailleurs, mais plus de la syntaxe Markdown pure).
 */
import { useEffect, useRef, useState } from "react";
import "./Toolbar.css";

/** Variables disponibles dans l'en-tête/pied de page — voir
 * `resolveHeaderFooterText` dans `core/pageLayout.ts` pour la substitution
 * réelle, ce tableau ne fait que lister les jetons pour ce menu. */
const HEADER_FOOTER_VARIABLES: { label: string; token: string }[] = [
  { label: "Numéro de page", token: "{{page}}" },
  { label: "Nombre de pages", token: "{{pages}}" },
  { label: "Date du jour", token: "{{date}}" },
  { label: "Nom du fichier", token: "{{filename}}" },
  { label: "Version du document", token: "{{version}}" },
  { label: "Auteur", token: "{{author}}" },
];

/** Emoji courants — insérés comme caractère Unicode réel (pas un code
 * `:smile:` à convertir), donc lisibles tels quels dans n'importe quel
 * autre outil Markdown, sans dépendance à un rendu spécial. */
const EMOJI_LIST = [
  "😀", "😉", "😂", "🙂", "😍", "🤔", "😢", "😮", "👍", "👎",
  "🙏", "👏", "💪", "✅", "❌", "⚠️", "❗", "❓", "💡", "🔥",
  "⭐", "🎯", "📌", "📅", "🕒", "📎", "🔗", "📧", "📞", "🏗️",
];

const HEADING_PREVIEW_SIZE: Record<1 | 2 | 3 | 4 | 5 | 6, number> = {
  1: 22,
  2: 19,
  3: 17,
  4: 15,
  5: 13,
  6: 12,
};

export interface ToolbarActions {
  undo: () => void;
  redo: () => void;
  toggleBold: () => void;
  toggleItalic: () => void;
  toggleUnderline: () => void;
  toggleStrike: () => void;
  toggleHeading: (level: 1 | 2 | 3 | 4 | 5 | 6) => void;
  setParagraph: () => void;
  toggleBulletList: () => void;
  toggleOrderedList: () => void;
  toggleBlockquote: () => void;
  toggleCodeBlock: () => void;
  toggleCode: () => void;
  setCodeBlockLanguage: (language: string) => void;
  setLink: () => void;
  insertImage: () => void;
  insertTable: () => void;
  insertHorizontalRule: () => void;
  insertPageBreak: () => void;
  setFontFamily: (family: string) => void;
  unsetFontFamily: () => void;
  setFontSize: (size: string) => void;
  unsetFontSize: () => void;
  setColor: (color: string) => void;
  toggleHighlight: () => void;
  setTextAlign: (align: "left" | "center" | "right" | "justify") => void;
  toggleSubscript: () => void;
  toggleSuperscript: () => void;
  toggleTaskList: () => void;
  clearFormatting: () => void;
  editHeader: () => void;
  editFooter: () => void;
  insertHeaderFooterVariable: (token: string) => void;
  insertTocMarker: () => void;
  generateToc: () => void;
  insertFootnote: () => void;
  insertMermaidDiagram: () => void;
  insertInlineMath: () => void;
  insertBlockMath: () => void;
  insertEmoji: (emoji: string) => void;
}

const FONT_FAMILIES = [
  { label: "Arial", value: "Arial, sans-serif" },
  { label: "Times New Roman", value: "'Times New Roman', serif" },
  { label: "Calibri", value: "Calibri, sans-serif" },
  { label: "Georgia", value: "Georgia, serif" },
  { label: "Courier New", value: "'Courier New', monospace" },
  { label: "Verdana", value: "Verdana, sans-serif" },
];

const FONT_SIZES = ["8pt", "9pt", "10pt", "11pt", "12pt", "14pt", "16pt", "18pt", "24pt", "36pt"];

/** Doit correspondre aux clés de `common` de lowlight (voir
 * `createLowlight(common)` dans MarkdownEditor.tsx) — vérifié une fois via
 * `Object.keys(common)`, pas d'import direct pour éviter de coupler ce
 * fichier à la config interne de l'éditeur. */
const CODE_BLOCK_LANGUAGE_OPTIONS = [
  "javascript", "typescript", "python", "java", "c", "cpp", "csharp",
  "html", "css", "scss", "less", "json", "yaml", "xml", "markdown",
  "bash", "shell", "sql", "php", "ruby", "go", "rust", "swift", "kotlin",
  "r", "lua", "perl", "graphql", "makefile", "ini", "diff",
];

type RibbonTab = "accueil" | "avance" | "extras";

export function Toolbar({
  actions,
  onToggleSidebar,
  sidebarOpen,
  onOpenPageSetup,
  onOpenHeadingStyles,
  activeBlockStyle = "paragraph",
}: {
  actions: ToolbarActions | null;
  onToggleSidebar: () => void;
  sidebarOpen: boolean;
  onOpenPageSetup: () => void;
  onOpenHeadingStyles: () => void;
  /** Style de bloc sous le curseur — surligne le bon bouton de la galerie
   * "Styles" (voir `EditorStats.activeBlockStyle` dans MarkdownEditor.tsx). */
  activeBlockStyle?: "paragraph" | 1 | 2 | 3 | 4 | 5 | 6;
}) {
  const disabled = actions === null;
  const [tab, setTab] = useState<RibbonTab>("accueil");

  return (
    <div className="tb-ribbon-stack">

      {/* Barre d'onglets du ruban. */}
      <div className="tb-tabbar">
        <button
          className={`tb-tab${tab === "accueil" ? " tb-tab-active" : ""}`}
          onClick={() => setTab("accueil")}
        >
          Accueil
        </button>
        <button
          className={`tb-tab${tab === "avance" ? " tb-tab-active" : ""}`}
          onClick={() => setTab("avance")}
          title="Mise en forme sans équivalent en Markdown standard (enregistrée en HTML dans le .md)"
        >
          Format avancé
        </button>
        <button
          className={`tb-tab${tab === "extras" ? " tb-tab-active" : ""}`}
          onClick={() => setTab("extras")}
          title="Diagrammes, formules mathématiques, emoji"
        >
          Extras
        </button>
      </div>

      {tab === "accueil" && (
        <div className="tb-ribbon">
          <button
            className="tb-big-icon"
            onClick={onToggleSidebar}
            title={sidebarOpen ? "Masquer l'explorateur" : "Afficher l'explorateur"}
          >
            <span className="tb-big-icon-glyph">🗀</span>
            <span className="tb-big-icon-label">Explorateur</span>
          </button>

          <RibbonGroup
            label="Police"
            launcher={{ title: "Autres réglages de police (à venir)" }}
          >
            <button className="tb-btn-icon" disabled={disabled} onClick={() => actions?.toggleBold()} title="Gras (Ctrl+B)">
              <b>G</b>
            </button>
            <button className="tb-btn-icon" disabled={disabled} onClick={() => actions?.toggleItalic()} title="Italique (Ctrl+I)">
              <i>I</i>
            </button>
            <button className="tb-btn-icon" disabled={disabled} onClick={() => actions?.toggleStrike()} title="Texte barré">
              <s>S</s>
            </button>
            <button
              className="tb-btn-icon"
              disabled={disabled}
              onClick={() => actions?.toggleCode()}
              title="Code en ligne — distinct du bloc de code (dans une phrase, ex. `variable`)"
            >
              {"</>"}
            </button>
            <button className="tb-btn-icon" disabled={disabled} onClick={() => actions?.toggleHighlight()} title="Surlignage">
              🖍️
            </button>
          </RibbonGroup>

          <RibbonGroup
            label="Paragraphe"
            launcher={{ onClick: onOpenPageSetup, title: "Mise en page (format, marges, en-tête/pied de page)" }}
          >
            <button className="tb-btn-icon" disabled={disabled} onClick={() => actions?.toggleBulletList()} title="Liste à puces">
              ☰•
            </button>
            <button className="tb-btn-icon" disabled={disabled} onClick={() => actions?.toggleOrderedList()} title="Liste numérotée">
              ☰1
            </button>
            <button className="tb-btn-icon" disabled={disabled} onClick={() => actions?.toggleTaskList()} title="Liste de tâches (case à cocher)">
              ☑
            </button>
            <button className="tb-btn-icon" disabled={disabled} onClick={() => actions?.toggleBlockquote()} title="Citation">
              ❝
            </button>
            <button
              className="tb-btn-icon"
              disabled={disabled}
              onClick={() => actions?.insertPageBreak()}
              title="Saut de page (Ctrl+Entrée) — commentaire HTML invisible, compatible partout"
            >
              ⤓
            </button>
            <button
              className="tb-btn-icon"
              disabled={disabled}
              onClick={() => actions?.insertFootnote()}
              title="Insérer une note de bas de page (numérotée automatiquement, ajoutée en fin de document)"
            >
              [^]
            </button>
          </RibbonGroup>

          <RibbonGroup
            label="Styles"
            launcher={{ onClick: onOpenHeadingStyles, title: "Styles de titres (police, couleur, numérotation automatique par niveau)" }}
          >
            <StyleGallery
              disabled={disabled}
              active={activeBlockStyle}
              onPick={(level) => actions?.toggleHeading(level)}
              onPickParagraph={() => actions?.setParagraph()}
            />
          </RibbonGroup>

          <RibbonGroup label="Liens et médias">
            <button className="tb-btn-icon" disabled={disabled} onClick={() => actions?.setLink()} title="Lien">
              🔗
            </button>
            <button className="tb-btn-icon" disabled={disabled} onClick={() => actions?.insertImage()} title="Image">
              🖼️
            </button>
          </RibbonGroup>

          <RibbonGroup label="Éléments">
            <button className="tb-btn-icon" disabled={disabled} onClick={() => actions?.insertTable()} title="Tableau">
              ▦
            </button>
            <button className="tb-btn-icon" disabled={disabled} onClick={() => actions?.insertHorizontalRule()} title="Séparateur">
              ─
            </button>
            <button className="tb-btn-icon" disabled={disabled} onClick={() => actions?.toggleCodeBlock()} title="Bloc de code">
              {"</>"}
            </button>
            <select
              className="tb-select tb-select-narrow"
              disabled={disabled}
              defaultValue=""
              title="Langage du bloc de code (curseur dans un bloc de code)"
              onChange={(e) => {
                if (e.target.value) actions?.setCodeBlockLanguage(e.target.value);
              }}
            >
              <option value="">Langage</option>
              {/* Doit correspondre aux clés de `common` de lowlight (voir
               * `MarkdownEditor.tsx`, `createLowlight(common)`) — sinon la
               * coloration syntaxique ne s'applique pas silencieusement. */}
              {CODE_BLOCK_LANGUAGE_OPTIONS.map((lang) => (
                <option key={lang} value={lang}>
                  {lang}
                </option>
              ))}
            </select>
          </RibbonGroup>

          <RibbonGroup label="En-tête et pied de page">
            <button
              className="tb-btn"
              disabled={disabled}
              onClick={() => actions?.editHeader()}
              title="Modifier l'en-tête (identique à cliquer directement sur l'en-tête d'une page)"
            >
              En-tête
            </button>
            <button
              className="tb-btn"
              disabled={disabled}
              onClick={() => actions?.editFooter()}
              title="Modifier le pied de page (identique à cliquer directement sur le pied de page d'une page)"
            >
              Pied de page
            </button>
            <VariablePicker disabled={disabled} onPick={(token) => actions?.insertHeaderFooterVariable(token)} />
          </RibbonGroup>

          <RibbonGroup label="Sommaire">
            <button
              className="tb-btn-icon"
              disabled={disabled}
              onClick={() => actions?.insertTocMarker()}
              title="Insérer un marqueur de sommaire (commentaire HTML invisible, compatible partout)"
            >
              ☰+
            </button>
            <button
              className="tb-btn-icon"
              disabled={disabled}
              onClick={() => actions?.generateToc()}
              title="Générer/mettre à jour le sommaire (remplace le marqueur par la liste réelle des titres)"
            >
              ↻
            </button>
          </RibbonGroup>
        </div>
      )}

      {tab === "avance" && (
        <div className="tb-ribbon">
          <RibbonGroup
            label="Police"
            title="Ces réglages n'existent pas en Markdown standard : ils sont enregistrés sous forme de balises HTML dans le fichier .md (toujours lisibles ailleurs, mais pas en syntaxe Markdown pure)."
          >
            <div className="tb-group-row">
              <select
                className="tb-select"
                disabled={disabled}
                defaultValue=""
                title="Police"
                onChange={(e) => {
                  if (e.target.value) actions?.setFontFamily(e.target.value);
                  else actions?.unsetFontFamily();
                }}
              >
                <option value="">Police</option>
                {FONT_FAMILIES.map((f) => (
                  <option key={f.value} value={f.value} style={{ fontFamily: f.value }}>
                    {f.label}
                  </option>
                ))}
              </select>
              <select
                className="tb-select tb-select-narrow"
                disabled={disabled}
                defaultValue=""
                title="Taille"
                onChange={(e) => {
                  if (e.target.value) actions?.setFontSize(e.target.value);
                  else actions?.unsetFontSize();
                }}
              >
                <option value="">Taille</option>
                {FONT_SIZES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              {/* TODO : "agrandir/réduire la police" n'existe pas encore comme
               * action (pas de notion de "police actuelle + 1 taille" côté
               * éditeur, seulement un choix direct dans la liste ci-dessus) —
               * boutons posés ici en pur repère visuel façon Word, sans
               * logique, en attendant qu'on définisse le comportement exact
               * (quelle liste de tailles, arrondi...). */}
              <button className="tb-btn-icon" disabled title="Agrandir la police (à venir)">
                A˄
              </button>
              <button className="tb-btn-icon" disabled title="Réduire la police (à venir)">
                A˅
              </button>
              {/* TODO : "changement de casse" (MAJUSCULES/minuscules/Cas de
               * titre) n'existe pas non plus comme action côté éditeur —
               * même traitement que ci-dessus, pur repère visuel. */}
              <button className="tb-btn-icon" disabled title="Modifier la casse (à venir)">
                Aa
              </button>
              <button
                className="tb-btn-icon"
                disabled={disabled}
                onClick={() => actions?.clearFormatting()}
                title="Effacer toute la mise en forme avancée"
              >
                🧹
              </button>
            </div>
            <div className="tb-group-row">
              <button className="tb-btn-icon" disabled={disabled} onClick={() => actions?.toggleUnderline()} title="Souligné (Ctrl+U)">
                <u>S</u>
              </button>
              <button className="tb-btn-icon" disabled={disabled} onClick={() => actions?.toggleSubscript()} title="Indice">
                X₂
              </button>
              <button className="tb-btn-icon" disabled={disabled} onClick={() => actions?.toggleSuperscript()} title="Exposant">
                X²
              </button>
              {/* Le petit chevron est purement visuel (façon Word) : toute la
               * zone du bouton ouvre déjà le même sélecteur de couleur natif
               * (input[type=color] superposé, voir .tb-color-swatch) — pas
               * un second contrôle, juste une meilleure affordance. */}
              <label className="tb-btn-icon tb-color-swatch" title="Couleur du texte">
                A
                <span className="tb-swatch-caret">▾</span>
                <input
                  type="color"
                  disabled={disabled}
                  defaultValue="#343334"
                  onChange={(e) => actions?.setColor(e.target.value)}
                />
              </label>
              <button
                className="tb-btn-icon tb-btn-with-caret"
                disabled={disabled}
                onClick={() => actions?.toggleHighlight()}
                title="Surlignage"
              >
                🖍️
                <span className="tb-swatch-caret">▾</span>
              </button>
            </div>
          </RibbonGroup>

          <RibbonGroup label="Alignement" title="Sans équivalent en Markdown standard, sérialisé en HTML.">
            <button className="tb-btn-icon" disabled={disabled} onClick={() => actions?.setTextAlign("left")} title="Aligner à gauche">
              <AlignIcon variant="left" />
            </button>
            <button className="tb-btn-icon" disabled={disabled} onClick={() => actions?.setTextAlign("center")} title="Centrer">
              <AlignIcon variant="center" />
            </button>
            <button className="tb-btn-icon" disabled={disabled} onClick={() => actions?.setTextAlign("right")} title="Aligner à droite">
              <AlignIcon variant="right" />
            </button>
            <button className="tb-btn-icon" disabled={disabled} onClick={() => actions?.setTextAlign("justify")} title="Justifier">
              <AlignIcon variant="justify" />
            </button>
          </RibbonGroup>
        </div>
      )}

      {tab === "extras" && (
        <div className="tb-ribbon">
          <RibbonGroup label="Diagrammes">
            <button
              className="tb-btn"
              disabled={disabled}
              onClick={() => actions?.insertMermaidDiagram()}
              title="Insérer un diagramme Mermaid (source éditable, aperçu rendu en direct)"
            >
              ⛓ Mermaid
            </button>
          </RibbonGroup>

          <RibbonGroup label="Mathématiques" title="Formules LaTeX, rendues via KaTeX.">
            <button
              className="tb-btn-icon"
              disabled={disabled}
              onClick={() => actions?.insertInlineMath()}
              title="Formule en ligne (dans une phrase)"
            >
              x²
            </button>
            <button
              className="tb-btn-icon"
              disabled={disabled}
              onClick={() => actions?.insertBlockMath()}
              title="Formule en bloc (seule sur sa ligne, centrée)"
            >
              ∑
            </button>
          </RibbonGroup>

          <EmojiPicker disabled={disabled} onPick={(emoji) => actions?.insertEmoji(emoji)} />
        </div>
      )}
    </div>
  );
}

/** Icône standard "barres alignées" (façon Word/Google Docs) — remplace les
 * anciens glyphes texte (⯇≡/≡/≡⯈/☰), peu lisibles à 13px. Barres dessinées en
 * SVG (`fill="currentColor"`, hérite la couleur du bouton) plutôt qu'un
 * caractère Unicode : rendu identique quelle que soit la police système. */
function AlignIcon({ variant }: { variant: "left" | "center" | "right" | "justify" }) {
  // 4 barres, largeurs décroissantes façon icône standard ; position (x) de
  // chaque barre selon l'alignement représenté.
  const widths = [16, 11, 16, 8];
  const bars = widths.map((w) => {
    let x = 0;
    if (variant === "center") x = (16 - w) / 2;
    else if (variant === "right") x = 16 - w;
    const width = variant === "justify" ? 16 : w;
    return { x: variant === "justify" ? 0 : x, width };
  });
  return (
    <svg width="16" height="12" viewBox="0 0 16 12" fill="currentColor" aria-hidden="true">
      {bars.map((bar, i) => (
        <rect key={i} x={bar.x} y={i * 3.2} width={bar.width} height="1.6" rx="0.8" />
      ))}
    </svg>
  );
}

/** Un groupe de commandes légendé, comme dans le ruban de Word (icônes en
 * haut, nom du groupe centré en dessous). */
function RibbonGroup({
  label,
  title,
  launcher,
  children,
}: {
  label: string;
  title?: string;
  /** Icône "lanceur" affichée juste après le libellé du groupe (façon Word,
   * la petite flèche qui ouvre une boîte de dialogue détaillée). Sans
   * `onClick`, c'est un pur repère visuel — TODO en attendant une boîte de
   * dialogue dédiée (voir Police/Paragraphe, qui n'en ont pas encore). */
  launcher?: { onClick?: () => void; title?: string };
  children: React.ReactNode;
}) {
  return (
    <div className="tb-group">
      <div className="tb-group-buttons">{children}</div>
      <div className="tb-group-caption" title={title}>
        {label}
        {launcher && (
          <button
            type="button"
            className="tb-group-launcher"
            onClick={launcher.onClick}
            disabled={!launcher.onClick}
            title={launcher.title}
          >
            ›
          </button>
        )}
      </div>
    </div>
  );
}

/** Galerie de styles de paragraphe (Normal / Titre 1 / Titre 2 / autres
 * niveaux via le chevron), façon groupe "Styles" de Word — remplace
 * l'ancien menu déroulant "Titre ▾". Le bouton du style courant (sous le
 * curseur) est mis en évidence. */
function StyleGallery({
  disabled,
  active,
  onPick,
  onPickParagraph,
}: {
  disabled: boolean;
  active: "paragraph" | 1 | 2 | 3 | 4 | 5 | 6;
  onPick: (level: 1 | 2 | 3 | 4 | 5 | 6) => void;
  onPickParagraph: () => void;
}) {
  return (
    <div className="tb-style-gallery">
      <button
        className={`tb-style-btn${active === "paragraph" ? " tb-style-btn-active" : ""}`}
        disabled={disabled}
        onClick={onPickParagraph}
        title="Normal"
      >
        Normal
      </button>
      {([1, 2] as const).map((level) => (
        <button
          key={level}
          className={`tb-style-btn${active === level ? " tb-style-btn-active" : ""}`}
          disabled={disabled}
          onClick={() => onPick(level)}
          title={`Titre ${level}`}
        >
          Titre {level}
        </button>
      ))}
      <HeadingPicker disabled={disabled} onPick={onPick} />
    </div>
  );
}

/** Sélecteur de titre affichant chaque niveau dans sa vraie taille (galerie de styles, comme Word). */
function HeadingPicker({
  disabled,
  onPick,
}: {
  disabled: boolean;
  onPick: (level: 1 | 2 | 3 | 4 | 5 | 6) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  return (
    <div className="tb-heading-picker" ref={rootRef}>
      <button
        className="tb-btn-icon tb-heading-picker-trigger"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        title="Autres niveaux de titre"
      >
        ⌄
      </button>
      {open && (
        <div className="tb-heading-menu">
          {([1, 2, 3, 4, 5, 6] as const).map((level) => (
            <button
              key={level}
              className="tb-heading-option"
              style={{ fontSize: HEADING_PREVIEW_SIZE[level] }}
              onClick={() => {
                onPick(level);
                setOpen(false);
              }}
            >
              Titre {level}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Menu d'insertion des variables d'en-tête/pied de page (numéro de page,
 * date...). Insère dans le champ actuellement ouvert (voir
 * `insertHeaderFooterVariable` dans MarkdownEditor.tsx) — s'il n'y en a
 * aucun, l'en-tête est ouvert par défaut. `onMouseDown` avec
 * `preventDefault()` sur chaque option : sans ça, cliquer sur une option
 * ferait perdre le focus au champ flottant (événement `blur`, qui le
 * referme) AVANT que `onClick` n'ait la moindre chance de s'exécuter. */
function VariablePicker({ disabled, onPick }: { disabled: boolean; onPick: (token: string) => void }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  return (
    <div className="tb-heading-picker" ref={rootRef}>
      <button
        className="tb-btn tb-heading-picker-trigger"
        disabled={disabled}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen((o) => !o)}
        title="Insérer une variable dans l'en-tête/le pied de page (numéro de page, date...)"
      >
        Variable ▾
      </button>
      {open && (
        <div className="tb-heading-menu">
          {HEADER_FOOTER_VARIABLES.map(({ label, token }) => (
            <button
              key={token}
              className="tb-heading-option"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onPick(token);
                setOpen(false);
              }}
            >
              {label} <span className="tb-heading-option-token">{token}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Menu d'insertion d'emoji — grille plutôt qu'une liste verticale (les
 * libellés textuels des autres menus n'ont pas de sens ici, l'emoji EST
 * son propre libellé). */
function EmojiPicker({ disabled, onPick }: { disabled: boolean; onPick: (emoji: string) => void }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  return (
    <div className="tb-heading-picker" ref={rootRef}>
      <button
        className="tb-btn tb-heading-picker-trigger"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        title="Insérer un emoji"
      >
        😀 Emoji ▾
      </button>
      {open && (
        <div className="tb-emoji-menu">
          {EMOJI_LIST.map((emoji) => (
            <button
              key={emoji}
              className="tb-emoji-option"
              onClick={() => {
                onPick(emoji);
                setOpen(false);
              }}
            >
              {emoji}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
