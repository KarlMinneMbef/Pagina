/**
 * Liste des extensions Tiptap de l'éditeur principal (extraite de MarkdownEditor.tsx, dette technique 0.4, 2026-10-26).
 * L'ordre compte (priorités de règles de parse, voir les commentaires de chaque extension).
 */
import type { Extensions } from "@tiptap/core";
import { common, createLowlight } from "lowlight";
import StarterKit from "@tiptap/starter-kit";
import { ImageAsset } from "./extensions/ImageAsset";
import { CommentMark } from "./extensions/CommentMark";
import { TableMarkdown as Table } from "./extensions/TableMarkdown";
import { TableRowStyled as TableRow } from "./extensions/TableRowStyle";
import { TableCellStyled as TableCell, TableHeaderStyled as TableHeader } from "./extensions/TableCellStyle";
import Placeholder from "@tiptap/extension-placeholder";
import { TextStyle } from "@tiptap/extension-text-style";
import FontFamily from "@tiptap/extension-font-family";
import Color from "@tiptap/extension-color";
import Highlight from "@tiptap/extension-highlight";
import TextAlign from "@tiptap/extension-text-align";
import Subscript from "@tiptap/extension-subscript";
import Superscript from "@tiptap/extension-superscript";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import CharacterCount from "@tiptap/extension-character-count";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import { FontSize } from "./extensions/FontSize";
import { Markdown } from "tiptap-markdown";
import { PageBreak } from "./extensions/PageBreak";
import { Bookmark } from "./extensions/Bookmark";
import { ParagraphMarkdown } from "./extensions/ParagraphMarkdown";
import { TocMarker } from "./extensions/TocMarker";
import { FootnoteReference, FootnoteDefinition } from "./extensions/Footnote";
import { MermaidDiagram } from "./extensions/MermaidDiagram";
import { SectionBreak } from "./extensions/SectionBreak";
import { CoverPage } from "./extensions/CoverPage";
import { CoverZoneStart, CoverZoneEnd, CoverZoneRepair } from "./extensions/CoverZone";
import { DocField } from "./extensions/DocField";
import { CoverTheme } from "./extensions/CoverTheme";
import { TocStyle } from "./extensions/TocStyle";
import { Spellcheck } from "./extensions/Spellcheck";
import { AutoCorrect } from "./extensions/AutoCorrect";
import { InlineMath, BlockMath } from "./extensions/Math";

const lowlight = createLowlight(common);

/** `onSpellChanged` : la couche peinte est redessinée quand les soulignements orthographiques changent. */
export function buildEditorExtensions({ onSpellChanged }: { onSpellChanged: () => void }): Extensions {
  return [
    StarterKit.configure({
      link: { openOnClick: false },
      // Remplacé par CodeBlockLowlight (coloration syntaxique) juste
      // en dessous — désactiver ici, sinon Tiptap se plaint de deux
      // extensions enregistrant le même nom de nœud ("codeBlock").
      codeBlock: false,
      // Remplacé par ParagraphMarkdown juste en dessous (préserve les
      // paragraphes vides — plusieurs Entrée pour espacer visuellement
      // deux paragraphes — à la sauvegarde, voir ce fichier).
      paragraph: false,
    }),
    CodeBlockLowlight.configure({ lowlight }),
    ParagraphMarkdown,
    ImageAsset,
    // Commentaires de relecture (format .xmd, roadmap 5.2) : marque
    // surlignée `<span data-comment="id">`, contenu dans comments.json.
    CommentMark,
    Table.configure({ resizable: true }),
    TableRow,
    TableHeader,
    TableCell,
    Placeholder.configure({ placeholder: "Commencez à rédiger…" }),
    TextStyle,
    FontFamily,
    FontSize,
    Color,
    // multicolor (roadmap 2.3) : le bouton Surlignage du ruban
    // mémorise/applique une couleur choisie, comme Word. Sérialisation
    // en repli HTML <mark style="background-color: …"> pour les
    // couleurs — lisible partout, comme tous les réglages avancés.
    Highlight.configure({ multicolor: true }),
    TextAlign.configure({ types: ["heading", "paragraph", "tableCell", "tableHeader"] }),
    Subscript,
    Superscript,
    TaskList,
    TaskItem.configure({ nested: true }),
    CharacterCount,
    PageBreak,
    Bookmark,
    TocMarker,
    FootnoteReference,
    FootnoteDefinition,
    MermaidDiagram,
    SectionBreak,
    CoverPage,
    // Zone « Page de garde » transparente (refonte 2026-10-22) : deux
    // marqueurs encadrent du contenu NORMAL — tout l'éditeur y
    // fonctionne (ruban, tableaux, champs de document inline).
    CoverZoneStart,
    CoverZoneEnd,
    CoverZoneRepair,
    CoverTheme,
    TocStyle,
    // Correction orthographique : la couche peinte est redessinée quand les soulignements changent.
    Spellcheck.configure({ onChanged: onSpellChanged }),
    // Correction automatique à la frappe : guillemets français, majuscule en début de phrase.
    AutoCorrect,
    // Champ de document {{variable}} inline — valeur résolue affichée
    // (comme les en-têtes/pieds), variable gardée dans le .md.
    DocField,
    InlineMath,
    BlockMath,
    Markdown.configure({
      // Nécessaire pour que police/taille/couleur/surlignage/alignement
      // (qui n'ont pas d'équivalent en Markdown standard) survivent à la
      // sauvegarde : ils sont sérialisés en <span style="…"> — toujours
      // lisible et correctement rendu par tout moteur Markdown→HTML
      // (GitHub, VS Code, Obsidian…), juste pas en syntaxe Markdown pure.
      html: true,
      transformPastedText: true,
    }),
  ];
}
