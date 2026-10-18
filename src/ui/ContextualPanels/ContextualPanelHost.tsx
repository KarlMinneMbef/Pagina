/**
 * Hôte UNIQUE des panneaux contextuels latéraux droits : une seule colonne
 * redimensionnable, avec des ONGLETS quand plusieurs contextes sont actifs
 * en même temps (ex. curseur dans un tableau + édition d'en-tête/pied de
 * page) — au lieu de panneaux côte à côte qui compressaient la page
 * (demande utilisateur 2026-10-17 : "des onglets latéraux du panneau").
 * Avec un seul contexte, pas de barre d'onglets : le panneau occupe tout.
 */
import type { ReactNode } from "react";
import { useHorizontalResize } from "../ResizeHandle/useHorizontalResize";
import { ResizeHandle } from "../ResizeHandle/ResizeHandle";
import "./ContextualPanelHost.css";

export interface ContextualTab {
  id: string;
  label: string;
}

export function ContextualPanelHost({
  tabs,
  activeId,
  onSelect,
  children,
}: {
  tabs: ContextualTab[];
  activeId: string | null;
  onSelect: (id: string) => void;
  children: ReactNode;
}) {
  const { width, onHandleMouseDown } = useHorizontalResize(260, { min: 220, max: 520, anchor: "right" });
  if (tabs.length === 0) return null;
  return (
    <aside className="ctx-host" style={{ width }}>
      <ResizeHandle side="left" onMouseDown={onHandleMouseDown} />
      {tabs.length > 1 && (
        <div className="ctx-tabs" role="tablist">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              className={`ctx-tab${t.id === activeId ? " ctx-tab-active" : ""}`}
              onClick={() => onSelect(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}
      {children}
    </aside>
  );
}
