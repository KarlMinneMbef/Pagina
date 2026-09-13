/**
 * Barre de statut façon Word : nombre de mots, page courante / nombre total
 * de pages, et sélecteur de vue (Pages / Markdown / Code).
 */
import "./StatusBar.css";
import { formatZoom, nextZoomPreset, previousZoomPreset } from "../Editor/pagination/zoom";

export type ViewMode = "pages" | "preview" | "source";

export function StatusBar({
  words,
  currentPage,
  pageCount,
  viewMode,
  onViewModeChange,
  disabled,
  zoom,
  onZoomChange,
}: {
  words: number;
  currentPage: number;
  pageCount: number;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  disabled: boolean;
  zoom: number;
  onZoomChange: (zoom: number) => void;
}) {
  return (
    <div className="sb-bar">
      <span className="sb-item">
        Page {currentPage} sur {pageCount}
      </span>
      <span className="sb-sep" />
      <span className="sb-item">{words} mot{words !== 1 ? "s" : ""}</span>
      <span className="sb-spacer" />
      {viewMode === "pages" && (
        <div className="sb-zoom">
          <button
            className="sb-zoom-btn"
            disabled={disabled}
            onClick={() => onZoomChange(previousZoomPreset(zoom))}
            title="Zoom arrière"
          >
            −
          </button>
          <span className="sb-zoom-value">{formatZoom(zoom)}</span>
          <button
            className="sb-zoom-btn"
            disabled={disabled}
            onClick={() => onZoomChange(nextZoomPreset(zoom))}
            title="Zoom avant"
          >
            +
          </button>
        </div>
      )}
      <div className="sb-view-switch">
        <button
          className={`sb-view-btn${viewMode === "pages" ? " sb-view-btn-active" : ""}`}
          disabled={disabled}
          onClick={() => onViewModeChange("pages")}
          title="Vue Pages (mise en page A4)"
        >
          📄 Pages
        </button>
        <button
          className={`sb-view-btn${viewMode === "preview" ? " sb-view-btn-active" : ""}`}
          disabled={disabled}
          onClick={() => onViewModeChange("preview")}
          title="Vue Markdown basique (rendu simple, sans mise en page)"
        >
          🔤 Markdown
        </button>
        <button
          className={`sb-view-btn${viewMode === "source" ? " sb-view-btn-active" : ""}`}
          disabled={disabled}
          onClick={() => onViewModeChange("source")}
          title="Vue code Markdown (texte source brut, éditable)"
        >
          {"</>"} Code
        </button>
      </div>
    </div>
  );
}
