/**
 * Icônes SVG du ruban (grille 24x24, `stroke-width` 1.6, `fill="none"`,
 * `stroke="currentColor"` sauf indication contraire dans le tracé lui-même).
 * Tracés fournis par la maquette validée : utilisés TELS QUELS, à ne pas
 * redessiner (les exceptions lettrées — G/I/S/x²/x₂/Aa/A — restent en texte
 * stylé, pas en SVG).
 */
import type { ReactNode } from "react";

interface IconProps {
  /** Taille de rendu en pixels (le viewBox reste 24x24). */
  size?: number;
  className?: string;
}

function Svg24({ size = 16, className, children }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

// --- Presse-papiers ---

export function IconPaste({ size, className }: IconProps) {
  return (
    <Svg24 size={size} className={className}>
      <path d="M9 4h6v3H9zM8 5H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
      <path d="M11 16l2 2 4-4" />
    </Svg24>
  );
}

export function IconCut({ size, className }: IconProps) {
  return (
    <Svg24 size={size} className={className}>
      <circle cx="6.5" cy="7" r="2.5" />
      <circle cx="6.5" cy="17" r="2.5" />
      <path d="M8.5 8.5L20 19M8.5 15.5L20 5" />
    </Svg24>
  );
}

export function IconCopy({ size, className }: IconProps) {
  return (
    <Svg24 size={size} className={className}>
      <rect x="8" y="8" width="12" height="12" rx="2" />
      <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
    </Svg24>
  );
}

// --- Police ---

export function IconCodeInline({ size, className }: IconProps) {
  return (
    <Svg24 size={size} className={className}>
      <path d="M8 8l-4 4 4 4M16 8l4 4-4 4" strokeWidth={1.8} />
    </Svg24>
  );
}

export function IconClearFormat({ size, className }: IconProps) {
  return (
    <Svg24 size={size} className={className}>
      <path d="M4 20h16" />
      <path d="M7 17L16.5 7.5a2.1 2.1 0 0 1 3 3L10 20H7z" />
      <path d="M13.5 6.5l3 3" />
    </Svg24>
  );
}

// --- Paragraphe ---

export function IconBulletList({ size, className }: IconProps) {
  return (
    <Svg24 size={size} className={className}>
      <path d="M9 6h11M9 12h11M9 18h11" />
      <circle cx="5" cy="6" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="5" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="5" cy="18" r="1.4" fill="currentColor" stroke="none" />
    </Svg24>
  );
}

export function IconOrderedList({ size, className }: IconProps) {
  return (
    <Svg24 size={size} className={className}>
      <path d="M9 6h11M9 12h11M9 18h11" />
      <text x="3" y="8" fontSize="7" fill="currentColor" stroke="none">1</text>
      <text x="3" y="14" fontSize="7" fill="currentColor" stroke="none">2</text>
      <text x="3" y="20" fontSize="7" fill="currentColor" stroke="none">3</text>
    </Svg24>
  );
}

export function IconTaskList({ size, className }: IconProps) {
  return (
    <Svg24 size={size} className={className}>
      <rect x="3" y="5" width="7" height="7" rx="1" />
      <path d="M5 8.5l1.5 1.5L10 6.5" />
      <path d="M13 8h8M13 16h8" />
      <rect x="3" y="13" width="7" height="7" rx="1" />
    </Svg24>
  );
}

export function IconBlockquote({ size, className }: IconProps) {
  return (
    <Svg24 size={size} className={className}>
      <path d="M5 5v14" />
      <path d="M9 8h11M9 13h8M9 18h11" />
    </Svg24>
  );
}

// Alignements (demande 2026-10-17 : les 4 icônes paraissaient identiques
// à 16px — une seule barre du milieu différait, déplacement quasi
// imperceptible). Modèle à QUATRE barres, barres courtes franchement
// positionnées selon l'alignement (pleine largeur : 4→20 ; courte : 11).
function alignBars(shortX: number | null): ReactNode {
  const bar = (y: number, x: number, w: number) => (
    <rect key={y} x={x} y={y} width={w} height={1.8} rx="0.9" fill="currentColor" stroke="none" />
  );
  return (
    <>
      {bar(6, 4, 16)}
      {shortX === null ? bar(10, 4, 16) : bar(10, shortX, 11)}
      {bar(14, 4, 16)}
      {shortX === null ? bar(18, 4, 16) : bar(18, shortX, 11)}
    </>
  );
}

export function IconAlignLeft({ size, className }: IconProps) {
  return (
    <Svg24 size={size} className={className}>
      {alignBars(4)}
    </Svg24>
  );
}

export function IconAlignCenter({ size, className }: IconProps) {
  return (
    <Svg24 size={size} className={className}>
      {alignBars(6.5)}
    </Svg24>
  );
}

export function IconAlignRight({ size, className }: IconProps) {
  return (
    <Svg24 size={size} className={className}>
      {alignBars(9)}
    </Svg24>
  );
}

export function IconAlignJustify({ size, className }: IconProps) {
  return (
    <Svg24 size={size} className={className}>
      {alignBars(null)}
    </Svg24>
  );
}

// --- Explorateur ---

export function IconExplorer({ size, className }: IconProps) {
  return (
    <Svg24 size={size} className={className}>
      <path d="M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <path d="M6.5 12h11M6.5 16h7" />
    </Svg24>
  );
}

// --- Mise en page (bouton fin d'Accueil, demande 2026-10-17 : reprend
// la place de l'ancien bouton Explorateur) : page + marges pointillées. ---

export function IconPageSetup({ size, className }: IconProps) {
  return (
    <Svg24 size={size} className={className}>
      <rect x="5" y="3.5" width="14" height="17" rx="1" />
      <rect x="7.8" y="6.3" width="8.4" height="11.4" rx="0.4" strokeDasharray="2 2" />
      <path d="M7.8 9.5h1.4" />
    </Svg24>
  );
}

// --- Commentaire (bouton « Commenter » à côté de l'Explorateur, coin
// droit du ruban comme « Partager » dans Word — inactif pour l'instant). ---

export function IconComment({ size, className }: IconProps) {
  return (
    <Svg24 size={size} className={className}>
      <path d="M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-8l-5 4v-4a2 2 0 0 1-2-2z" />
      <path d="M8 8.5h8M8 11.5h5" />
    </Svg24>
  );
}

// --- Insertion : Pages ---

export function IconPageBreak({ size, className }: IconProps) {
  return (
    <Svg24 size={size} className={className}>
      <path d="M6 3h9l4 4v14H6z" />
      <path d="M14 3v5h5" />
      <path d="M9 12h6" strokeDasharray="1.5 1.5" />
    </Svg24>
  );
}

export function IconFootnote({ size, className }: IconProps) {
  return (
    <Svg24 size={size} className={className}>
      <path d="M6 4h12v10l-4 6H6z" />
      <path d="M18 14l-4 0v6z" />
      <path d="M9 8h6M9 11h4" />
    </Svg24>
  );
}

// --- Insertion : Tableaux et éléments ---

export function IconTable({ size, className }: IconProps) {
  return (
    <Svg24 size={size} className={className}>
      <rect x="4" y="5" width="16" height="14" rx="1.5" />
      <path d="M4 10h16M4 15h16M10 5v14" />
    </Svg24>
  );
}

export function IconHorizontalRule({ size, className }: IconProps) {
  return (
    <Svg24 size={size} className={className}>
      <path d="M4 9h16" />
      <path d="M4 15h10" strokeDasharray="2 2" />
    </Svg24>
  );
}

export function IconCodeBlock({ size, className }: IconProps) {
  return (
    <Svg24 size={size} className={className}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M9 9l-2.5 3L9 15M15 9l2.5 3L15 15" />
    </Svg24>
  );
}

// --- Insertion : Liens ---

export function IconLink({ size, className }: IconProps) {
  return (
    <Svg24 size={size} className={className}>
      <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1.5 1.5" />
      <path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1.5-1.5" />
    </Svg24>
  );
}

/** Signet (marque-page) — AUCUN tracé fourni par la maquette pour les deux
 * nouvelles commandes du groupe « Liens » : dérivation minimale dans le
 * même langage graphique (grille 24x24, stroke 1.6). */
export function IconBookmark({ size, className }: IconProps) {
  return (
    <Svg24 size={size} className={className}>
      <path d="M7 3.5h10V20l-5-3.8L7 20z" />
    </Svg24>
  );
}

/** Renvoi (renvoi vers un signet). */
export function IconCrossReference({ size, className }: IconProps) {
  return (
    <Svg24 size={size} className={className}>
      <rect x="4" y="14" width="6" height="6" rx="1" />
      <path d="M10 17h5a4 4 0 0 0 4-4v-3" />
      <path d="M16 12.5l3-3 3 3" />
    </Svg24>
  );
}

// --- Insertion : En-tête et pied ---

export function IconHeader({ size, className }: IconProps) {
  return (
    <Svg24 size={size} className={className}>
      <rect x="5" y="4" width="14" height="16" rx="1.5" />
      <path d="M8 8h8M8 11h5" />
      <path d="M5 16h14" />
    </Svg24>
  );
}

export function IconFooter({ size, className }: IconProps) {
  return (
    <Svg24 size={size} className={className}>
      <rect x="5" y="4" width="14" height="16" rx="1.5" />
      <path d="M5 8h14" />
      <path d="M16 13h-8M16 16h-5" />
    </Svg24>
  );
}

// --- Insertion : Sommaire ---

export function IconTocMarker({ size, className }: IconProps) {
  return (
    <Svg24 size={size} className={className}>
      <path d="M4 6h12M4 10h12M4 14h8" />
      <path d="M17 17h4M19 15v4" />
    </Svg24>
  );
}

export function IconTocRefresh({ size, className }: IconProps) {
  return (
    <Svg24 size={size} className={className}>
      <path d="M20 12a8 8 0 1 1-2.3-5.7" />
      <path d="M20 4v4h-4" />
    </Svg24>
  );
}

// --- Insertion : Diagrammes et formules ---

export function IconMermaid({ size, className }: IconProps) {
  return (
    <Svg24 size={size} className={className}>
      <rect x="3" y="4" width="7" height="5" rx="1" />
      <rect x="14" y="4" width="7" height="5" rx="1" />
      <rect x="8.5" y="15" width="7" height="5" rx="1" />
      <path d="M6.5 9v3h11V9M12 12v3" />
    </Svg24>
  );
}

export function IconMathInline({ size, className }: IconProps) {
  return (
    <Svg24 size={size} className={className}>
      <path d="M5 18c4-1 4-12 8-12M6 12h8" />
      <path d="M15 10h6M17 7l-1.5 3L17 13" />
    </Svg24>
  );
}

export function IconMathBlock({ size, className }: IconProps) {
  return (
    <Svg24 size={size} className={className}>
      <path d="M7 5h10M7 19h10M9 5l6 14" />
    </Svg24>
  );
}

/** Visage SVG (PAS un emoji) pour le déclencheur du sélecteur Emoji. */
export function IconEmoji({ size, className }: IconProps) {
  return (
    <Svg24 size={size} className={className}>
      <circle cx="12" cy="12" r="9" />
      <path d="M8.5 14a4.5 4.5 0 0 0 7 0" />
      <circle cx="9" cy="9.5" r="1" fill="currentColor" stroke="none" />
      <circle cx="15" cy="9.5" r="1" fill="currentColor" stroke="none" />
    </Svg24>
  );
}

/** Oméga (caractères spéciaux). */
export function IconSpecialChar({ size, className }: IconProps) {
  return (
    <Svg24 size={size} className={className}>
      <path d="M5 19h4v-1.6C6.6 16.2 5 14 5 11.5a7 7 0 0 1 14 0c0 2.5-1.6 4.7-4 5.9V19h4" />
    </Svg24>
  );
}

// --- Panneau contextuel « Tableau » (tracés de la maquette 2026-10-17) ---

export function IconRowAbove({ size, className }: IconProps) {
  return (
    <Svg24 size={size} className={className}>
      <rect x="4" y="9" width="16" height="9" rx="1" />
      <path d="M4 13.5h16" />
      <path d="M12 2.5v5M9.5 4.5L12 2l2.5 2.5" />
    </Svg24>
  );
}

export function IconRowBelow({ size, className }: IconProps) {
  return (
    <Svg24 size={size} className={className}>
      <rect x="4" y="6" width="16" height="9" rx="1" />
      <path d="M4 10.5h16" />
      <path d="M12 16.5v5M9.5 19.5L12 22l2.5-2.5" />
    </Svg24>
  );
}

export function IconRowDelete({ size, className }: IconProps) {
  return (
    <Svg24 size={size} className={className}>
      <rect x="4" y="7" width="16" height="10" rx="1" />
      <path d="M4 12h16" />
      <path d="M3 4l6 16M15 4l6 16" strokeWidth={1.2} />
    </Svg24>
  );
}

export function IconColLeft({ size, className }: IconProps) {
  return (
    <Svg24 size={size} className={className}>
      <rect x="9" y="4" width="9" height="16" rx="1" />
      <path d="M13.5 4v16" />
      <path d="M2.5 12h5M4.5 9.5L2 12l2.5 2.5" />
    </Svg24>
  );
}

export function IconColRight({ size, className }: IconProps) {
  return (
    <Svg24 size={size} className={className}>
      <rect x="6" y="4" width="9" height="16" rx="1" />
      <path d="M10.5 4v16" />
      <path d="M16.5 12h5M19.5 9.5L22 12l-2.5 2.5" />
    </Svg24>
  );
}

export function IconColDelete({ size, className }: IconProps) {
  return (
    <Svg24 size={size} className={className}>
      <rect x="7" y="4" width="10" height="16" rx="1" />
      <path d="M12 4v16" />
      <path d="M3 4l6 16M15 4l6 16" strokeWidth={1.2} />
    </Svg24>
  );
}

export function IconMergeCells({ size, className }: IconProps) {
  return (
    <Svg24 size={size} className={className}>
      <rect x="4" y="5" width="16" height="14" rx="1" />
      <path d="M12 5v14" />
      <path d="M9 12l-2.5 2.5M9 12l-2.5-2.5M15 12l2.5 2.5M15 12l2.5-2.5" strokeWidth={1.2} />
    </Svg24>
  );
}

export function IconSplitCells({ size, className }: IconProps) {
  return (
    <Svg24 size={size} className={className}>
      <rect x="4" y="5" width="16" height="14" rx="1" />
      <path d="M12 5v14" />
      <path d="M6.5 12l2.5-2.5M6.5 12L9 14.5M17.5 12L15 9.5M17.5 12L15 14.5" strokeWidth={1.2} />
    </Svg24>
  );
}

export function IconClearCell({ size, className }: IconProps) {
  return (
    <Svg24 size={size} className={className}>
      <rect x="4" y="5" width="16" height="14" rx="1" />
      <path d="M4 10h16" />
      <path d="M9 13l6 6M15 13l-6 6" strokeWidth={1.2} />
    </Svg24>
  );
}

/** Basculer ligne d'en-tête (tracé de la maquette du ruban, conservé dans
 * la bibliothèque — le bouton n'est plus exposé depuis la refonte du
 * panneau « Tableau » du 2026-10-17, l'action `toggleHeaderRow` reste
 * disponible dans `ToolbarActions`). */
export function IconTableHeader({ size, className }: IconProps) {
  return (
    <Svg24 size={size} className={className}>
      <rect x="4" y="5" width="16" height="14" rx="1" />
      <path d="M4 10h16" />
      <path d="M10 5v14" />
    </Svg24>
  );
}

/** Alignement vertical de cellule — AUCUN tracé fourni par la maquette
 * pour ces trois commandes : dérivation minimale (cadre de cellule +
 * barre de texte pleine largeur positionnée en haut/au milieu/en bas),
 * même grille et même épaisseur que les autres tracés. */
export function IconValignTop({ size, className }: IconProps) {
  return (
    <Svg24 size={size} className={className}>
      <rect x="4" y="5" width="16" height="14" rx="1" />
      <rect x="6.5" y="7" width="11" height="2.4" rx="1" fill="currentColor" stroke="none" />
    </Svg24>
  );
}

export function IconValignMiddle({ size, className }: IconProps) {
  return (
    <Svg24 size={size} className={className}>
      <rect x="4" y="5" width="16" height="14" rx="1" />
      <rect x="6.5" y="10.8" width="11" height="2.4" rx="1" fill="currentColor" stroke="none" />
    </Svg24>
  );
}

export function IconValignBottom({ size, className }: IconProps) {
  return (
    <Svg24 size={size} className={className}>
      <rect x="4" y="5" width="16" height="14" rx="1" />
      <rect x="6.5" y="14.6" width="11" height="2.4" rx="1" fill="currentColor" stroke="none" />
    </Svg24>
  );
}

// --- Variables d'en-tête/pied de page (panneau « Variables », App.tsx) —
// aucun tracé fourni par la maquette pour ces six jetons : dérivation
// minimale dans le même langage graphique (grille 24x24, stroke 1.6). */

/** {{page}} — numéro de la page courante. */
export function IconVarPage({ size, className }: IconProps) {
  return (
    <Svg24 size={size} className={className}>
      <rect x="5" y="4" width="14" height="16" rx="1.5" />
      <path d="M9.5 16h5" />
    </Svg24>
  );
}

/** {{pages}} — nombre total de pages. */
export function IconVarPages({ size, className }: IconProps) {
  return (
    <Svg24 size={size} className={className}>
      <rect x="4" y="7" width="12" height="13" rx="1.5" />
      <path d="M8 4h10a2 2 0 0 1 2 2v10" />
    </Svg24>
  );
}

/** {{date}} — date du jour. */
export function IconVarDate({ size, className }: IconProps) {
  return (
    <Svg24 size={size} className={className}>
      <rect x="4" y="6" width="16" height="14" rx="1.5" />
      <path d="M8 3.5v4M16 3.5v4M4 11h16" />
      <circle cx="9" cy="15" r="1" fill="currentColor" stroke="none" />
      <circle cx="15" cy="15" r="1" fill="currentColor" stroke="none" />
    </Svg24>
  );
}

/** {{filename}} — nom du fichier. */
export function IconVarFile({ size, className }: IconProps) {
  return (
    <Svg24 size={size} className={className}>
      <path d="M6 3h9l4 4v14H6z" />
      <path d="M14 3v5h5" />
      <path d="M9 13h6" />
    </Svg24>
  );
}

/** {{version}} — version du document. */
export function IconVarVersion({ size, className }: IconProps) {
  return (
    <Svg24 size={size} className={className}>
      <path d="M4 12l8-8h8v8l-8 8z" />
      <circle cx="16" cy="8" r="1.2" fill="currentColor" stroke="none" />
    </Svg24>
  );
}

/** {{author}} — auteur du document. */
export function IconVarAuthor({ size, className }: IconProps) {
  return (
    <Svg24 size={size} className={className}>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20a7 7 0 0 1 14 0" />
    </Svg24>
  );
}

// --- Icônes d'en-tête des panneaux latéraux (PanelHeader, 2026-10-17) ---

export function IconTrash({ size, className }: IconProps) {
  return (
    <Svg24 size={size} className={className}>
      <path d="M5 7h14" />
      <path d="M10 7V5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v2" />
      <path d="M7 7l1 12a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1l1-12" />
      <path d="M10 11v5M14 11v5" />
    </Svg24>
  );
}

export function IconGear({ size, className }: IconProps) {
  return (
    <Svg24 size={size} className={className}>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 5v2M12 17v2M5 12h2M17 12h2M7 7l1.4 1.4M15.6 15.6L17 17M17 7l-1.4 1.4M8.4 15.6L7 17" />
    </Svg24>
  );
}

export function IconKeyboard({ size, className }: IconProps) {
  return (
    <Svg24 size={size} className={className}>
      <rect x="3" y="7" width="18" height="10" rx="1.5" />
      <path d="M7 10.5h.01M10 10.5h.01M13 10.5h.01M16 10.5h.01M7 13.5h.01M16 13.5h.01M10 13.5h4" strokeLinecap="round" />
    </Svg24>
  );
}
