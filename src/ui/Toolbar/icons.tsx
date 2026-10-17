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

export function IconAlignLeft({ size, className }: IconProps) {
  return (
    <Svg24 size={size} className={className}>
      <rect x="4" y="6" width="16" height="1.8" rx="0.9" fill="currentColor" stroke="none" />
      <rect x="4" y="10.6" width="11" height="1.8" rx="0.9" fill="currentColor" stroke="none" />
      <rect x="4" y="15.2" width="16" height="1.8" rx="0.9" fill="currentColor" stroke="none" />
    </Svg24>
  );
}

export function IconAlignCenter({ size, className }: IconProps) {
  return (
    <Svg24 size={size} className={className}>
      <rect x="4" y="6" width="16" height="1.8" rx="0.9" fill="currentColor" stroke="none" />
      <rect x="6.5" y="10.6" width="11" height="1.8" rx="0.9" fill="currentColor" stroke="none" />
      <rect x="4" y="15.2" width="16" height="1.8" rx="0.9" fill="currentColor" stroke="none" />
    </Svg24>
  );
}

export function IconAlignRight({ size, className }: IconProps) {
  return (
    <Svg24 size={size} className={className}>
      <rect x="4" y="6" width="16" height="1.8" rx="0.9" fill="currentColor" stroke="none" />
      <rect x="9" y="10.6" width="11" height="1.8" rx="0.9" fill="currentColor" stroke="none" />
      <rect x="4" y="15.2" width="16" height="1.8" rx="0.9" fill="currentColor" stroke="none" />
    </Svg24>
  );
}

export function IconAlignJustify({ size, className }: IconProps) {
  return (
    <Svg24 size={size} className={className}>
      <rect x="4" y="6" width="16" height="1.8" rx="0.9" fill="currentColor" stroke="none" />
      <rect x="4" y="10.6" width="16" height="1.8" rx="0.9" fill="currentColor" stroke="none" />
      <rect x="4" y="15.2" width="16" height="1.8" rx="0.9" fill="currentColor" stroke="none" />
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

export function IconVariable({ size, className }: IconProps) {
  return (
    <Svg24 size={size} className={className}>
      <path d="M4 7h6a2 2 0 0 1 2 2v6a2 2 0 0 0 2 2h6" />
      <path d="M4 21h6" />
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

// --- Panneau contextuel : Outils de tableau ---

export function IconRowAbove({ size, className }: IconProps) {
  return (
    <Svg24 size={size} className={className}>
      <rect x="4" y="8" width="16" height="10" rx="1" />
      <path d="M4 12.5h16" />
      <path d="M12 3v5M9.5 5L12 2.5 14.5 5" />
    </Svg24>
  );
}

export function IconRowBelow({ size, className }: IconProps) {
  return (
    <Svg24 size={size} className={className}>
      <rect x="4" y="6" width="16" height="10" rx="1" />
      <path d="M4 10.5h16" />
      <path d="M12 14v6M9.5 18L12 20.5 14.5 18" />
    </Svg24>
  );
}

export function IconColLeft({ size, className }: IconProps) {
  return (
    <Svg24 size={size} className={className}>
      <rect x="8" y="4" width="10" height="16" rx="1" />
      <path d="M12.5 4v16" />
      <path d="M3 12h5M5 9.5L7.5 12 5 14.5" />
    </Svg24>
  );
}

export function IconColRight({ size, className }: IconProps) {
  return (
    <Svg24 size={size} className={className}>
      <rect x="6" y="4" width="10" height="16" rx="1" />
      <path d="M10.5 4v16" />
      <path d="M16 12h5M19 9.5L21.5 12 19 14.5" />
    </Svg24>
  );
}

/** Dérivé des tracés fournis (RowAbove : rect + séparateur) : la flèche
 * est remplacée par une croix pour « Supprimer la ligne » — aucun tracé
 * dédié n'était fourni pour cette commande. */
export function IconDeleteRow({ size, className }: IconProps) {
  return (
    <Svg24 size={size} className={className}>
      <rect x="4" y="8" width="16" height="10" rx="1" />
      <path d="M4 12.5h16" />
      <path d="M16 2l5 5M21 2l-5 5" />
    </Svg24>
  );
}

/** Dérivé des tracés fournis (ColLeft : rect + séparateur), croix pour
 * « Supprimer la colonne » — voir IconDeleteRow. */
export function IconDeleteColumn({ size, className }: IconProps) {
  return (
    <Svg24 size={size} className={className}>
      <rect x="8" y="4" width="10" height="16" rx="1" />
      <path d="M12.5 4v16" />
      <path d="M18 2l4 4M22 2l-4 4" />
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

export function IconTableHeader({ size, className }: IconProps) {
  return (
    <Svg24 size={size} className={className}>
      <rect x="4" y="5" width="16" height="14" rx="1" />
      <path d="M4 10h16" />
      <path d="M10 5v14" />
    </Svg24>
  );
}
