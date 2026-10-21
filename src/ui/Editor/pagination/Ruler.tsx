/**
 * Règles horizontale et verticale (2026-10-17, roadmap 1.1 — demandées
 * « comme CasualOffice/Word »). Réimplémentées sur NOTRE modèle :
 * - Graduation en millimètres (notre unité de référence, pas des twips)
 *   : grandes marques tous les 10 mm avec libellé (1, 2, 3… cm), moyennes
 *   tous les 5 mm, petites tous les 1 mm.
 * - Zones grises pour les marges (gauche/droite pour l'horizontale,
 *   haut/bas pour la verticale).
 * - Triangles (charte MBEF) aux positions de marge, comme Word.
 * - Lecture seule pour l'instant (le glisser viendra ensuite) — la
 *   disposition et l'échelle suivent le zoom et la mise en page.
 *
 * Disposition (voir MarkdownEditor.tsx / MarkdownEditor.css) :
 * - Horizontale : sticky en haut du wrapper de pages, pleine largeur du
 *   contenu — un COIN de 18px (au-dessus de la règle verticale) puis la
 *   zone de page, centrée sur la même largeur que .xmd-canvas-frame pour
 *   rester alignée sur les pages quel que soit le zoom.
 * - Verticale : sticky à gauche, DANS la ligne flex (.xmd-editor-row) qui
 *   contient aussi la couche peinte. Elle reste visible pendant le
 *   défilement et affiche la graduation de la page courante : un motif de
 *   page (graduations + marges + triangles) est répété avec la période
 *   « hauteur de page + espace entre pages », et translaté en continu par
 *   MarkdownEditor via les variables CSS --xmd-ruler-v-offset /
 *   --xmd-ruler-v-stride pour rester calé sur les pages réelles.
 */
import { useMemo } from "react";
import type { CSSProperties } from "react";
import type { PageLayoutSettings } from "../../../core/pageLayout";
import { resolvePageSizeMm } from "../../../core/pageLayout";
import "./Ruler.css";

/** mm → px CSS à l'écran (le zoom multiplie la taille du canvas transform). */
const MM_TO_PX = 96 / 25.4; // ≈ 3.7795 px par mm à 100 %

/**
 * Espace entre deux pages peintes — DOIT rester synchronisé avec `gap`
 * de `.xmd-page-canvas` dans MarkdownEditor.css (la règle verticale s'en
 * sert comme période entre deux motifs de page).
 */
export const PAGE_GAP_PX = 24;

/** Largeur des règles (horizontale : hauteur ; verticale : largeur). */
const RULER_SIZE_PX = 18;

interface Tick {
  /** Position en px depuis l'origine de la règle. */
  pos: number;
  /** Hauteur/largeur de la marque en px (selon l'orientation). */
  size: number;
  /** Libellé en cm (10, 20, 30… mm → 1, 2, 3… cm). */
  label?: string;
}

/** Génère les graduations pour `totalMm` millimètres à l'échelle `zoom`. */
function generateTicks(totalMm: number, zoom: number): Tick[] {
  const ticks: Tick[] = [];
  for (let mm = 0; mm <= totalMm; mm++) {
    const pos = mm * MM_TO_PX * zoom;
    if (mm % 10 === 0) {
      ticks.push({ pos, size: 12, label: mm === 0 ? undefined : String(mm / 10) });
    } else if (mm % 5 === 0) {
      ticks.push({ pos, size: 8 });
    } else {
      ticks.push({ pos, size: 4 });
    }
  }
  return ticks;
}

export function HorizontalRuler({ layout, zoom }: { layout: PageLayoutSettings; zoom: number }) {
  const { widthMm } = resolvePageSizeMm(layout);
  const ticks = useMemo(() => generateTicks(widthMm, zoom), [widthMm, zoom]);
  const marginLeftPx = layout.marginLeftMm * MM_TO_PX * zoom;
  const marginRightPx = layout.marginRightMm * MM_TO_PX * zoom;
  const widthPx = widthMm * MM_TO_PX * zoom;

  return (
    <div className="xmd-ruler xmd-ruler-h" aria-hidden="true">
      {/* Coin, au-dessus de la règle verticale (comme Word) — sa largeur
       * (bordure comprise, box-sizing global border-box) est IDENTIQUE à
       * celle de .xmd-ruler-v pour que la zone qui suit reste alignée sur
       * .xmd-canvas-frame, donc sur les pages. */}
      <div className="xmd-ruler-corner" style={{ width: RULER_SIZE_PX }} />
      {/* Zone de la page — centrée sur la largeur restante, celle-là même
       * qu'occupe .xmd-canvas-frame dans .xmd-editor-row. `safe center` :
       * si la page est plus large que la zone, on se cale à gauche (même
       * comportement que les pages peintes, atteignables au scroll). */}
      <div className="xmd-ruler-zone">
        <div className="xmd-ruler-page" style={{ width: `${widthPx}px` }}>
          {/* Graduations */}
          <div className="xmd-ruler-ticks">
            {ticks.map((t, i) => (
              <div key={i} className="xmd-ruler-tick" style={{ left: `${t.pos}px`, height: `${t.size}px` }} />
            ))}
          </div>
          {/* Libellés (cm) */}
          <div className="xmd-ruler-labels">
            {ticks
              .filter((t) => t.label !== undefined)
              .map((t, i) => (
                <span key={i} className="xmd-ruler-label" style={{ left: `${t.pos}px` }}>
                  {t.label}
                </span>
              ))}
          </div>
          {/* Zones grises = marges */}
          <div className="xmd-ruler-margin" style={{ left: 0, width: `${marginLeftPx}px` }} />
          <div className="xmd-ruler-margin" style={{ right: 0, width: `${marginRightPx}px` }} />
          {/* Triangles de marge */}
          <div className="xmd-ruler-marker xmd-ruler-marker-left" style={{ left: `${marginLeftPx}px` }} />
          <div className="xmd-ruler-marker xmd-ruler-marker-right" style={{ left: `${widthPx - marginRightPx}px` }} />
        </div>
      </div>
    </div>
  );
}

export function VerticalRuler({
  layout,
  zoom,
  periods,
}: {
  layout: PageLayoutSettings;
  zoom: number;
  /** Nombre de motifs de page rendus — piloté par MarkdownEditor (assez
   * pour couvrir la hauteur visible, voir recomputeVRuler). */
  periods: number;
}) {
  const { heightMm } = resolvePageSizeMm(layout);
  const ticks = useMemo(() => generateTicks(heightMm, zoom), [heightMm, zoom]);
  const pageHeightPx = heightMm * MM_TO_PX * zoom;
  const marginTopPx = layout.marginTopMm * MM_TO_PX * zoom;
  const marginBottomPx = layout.marginBottomMm * MM_TO_PX * zoom;

  return (
    <div
      className="xmd-ruler xmd-ruler-v"
      style={{ width: RULER_SIZE_PX }}
      aria-hidden="true"
    >
      {/* Un motif par page : graduations, marges et triangles. La
       * translation continue (calage sur les pages pendant le défilement)
       * se fait SANS re-render React : MarkdownEditor pose les variables
       * CSS --xmd-ruler-v-offset / --xmd-ruler-v-stride sur le conteneur,
       * chaque motif décale de k périodes en plus (voir Ruler.css). */}
      {Array.from({ length: periods }, (_, k) => (
        <div
          key={k}
          className="xmd-ruler-strip"
          style={{ height: `${pageHeightPx}px`, "--xmd-k": k } as CSSProperties}
        >
          {/* Graduations */}
          <div className="xmd-ruler-ticks xmd-ruler-ticks-v">
            {ticks.map((t, i) => (
              <div key={i} className="xmd-ruler-tick xmd-ruler-tick-v" style={{ top: `${t.pos}px`, width: `${t.size}px` }} />
            ))}
          </div>
          {/* Libellés (cm) */}
          <div className="xmd-ruler-labels xmd-ruler-labels-v">
            {ticks
              .filter((t) => t.label !== undefined)
              .map((t, i) => (
                <span key={i} className="xmd-ruler-label xmd-ruler-label-v" style={{ top: `${t.pos}px` }}>
                  {t.label}
                </span>
              ))}
          </div>
          {/* Zones grises = marges */}
          <div className="xmd-ruler-margin xmd-ruler-margin-v" style={{ top: 0, height: `${marginTopPx}px` }} />
          <div className="xmd-ruler-margin xmd-ruler-margin-v" style={{ bottom: 0, height: `${marginBottomPx}px` }} />
          {/* Triangles de marge */}
          <div className="xmd-ruler-marker xmd-ruler-marker-v xmd-ruler-marker-top" style={{ top: `${marginTopPx}px` }} />
          <div
            className="xmd-ruler-marker xmd-ruler-marker-v xmd-ruler-marker-bottom"
            style={{ top: `${pageHeightPx - marginBottomPx}px` }}
          />
        </div>
      ))}
    </div>
  );
}
