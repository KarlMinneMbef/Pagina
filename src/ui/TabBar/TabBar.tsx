import type { EditorTab } from "../../core/store/tabsStore";
import "./TabBar.css";

export function TabBar({
  tabs,
  activePath,
  onSelect,
  onClose,
}: {
  tabs: EditorTab[];
  activePath: string | null;
  onSelect: (path: string) => void;
  onClose: (path: string) => void;
}) {
  return (
    <div className="tabbar">
      {tabs.map((tab) => (
        <div
          key={tab.path}
          className={`tabbar-tab${tab.path === activePath ? " tabbar-tab-active" : ""}`}
          onClick={() => onSelect(tab.path)}
          title={tab.path}
        >
          <span className="tabbar-title">
            {tab.title}
            {tab.dirty ? " •" : ""}
          </span>
          <button
            className="tabbar-close"
            onClick={(e) => {
              e.stopPropagation();
              onClose(tab.path);
            }}
            title="Fermer"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
