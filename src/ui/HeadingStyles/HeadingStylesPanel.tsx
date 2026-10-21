/**
 * Panneau latéral « Styles de titres » — remplace l'ancien menu déroulant du
 * chevron de la galerie de styles (qui n'affichait que 3 niveaux sur 6 sans
 * indiquer lequel était actif). Liste Normal + Titre 1 à 6, chacun rendu avec
 * SA vraie mise en forme (police, taille, couleur, gras/italique, tirées de
 * `layout.headingStyles` — donc fidèle aux réglages du document), le niveau
 * sous le curseur surligné ; un clic applique le style au bloc courant.
 * Monté dans ContextualPanelHost (qui fournit le châssis).
 */
import type { HeadingLevel, HeadingLevelStyle } from "../../core/pageLayout";
import "./HeadingStylesPanel.css";
import { PanelHeader } from "../ContextualPanels/PanelHeader";
import { IconGear } from "../Toolbar/icons";

type Active = "paragraph" | HeadingLevel;

const LEVELS: HeadingLevel[] = [1, 2, 3, 4, 5, 6];

export function HeadingStylesPanel({
  headingStyles,
  active,
  onPick,
  onPickParagraph,
  onOpenSettings,
  onClose,
}: {
  headingStyles: Record<HeadingLevel, HeadingLevelStyle>;
  /** Style du bloc sous le curseur (`EditorStats.activeBlockStyle`). */
  active: Active;
  onPick: (level: HeadingLevel) => void;
  onPickParagraph: () => void;
  /** Ouvre le dialogue de réglage (police/couleur/numérotation par niveau). */
  onOpenSettings: () => void;
  onClose: () => void;
}) {
  return (
    <div className="hsp-panel">
      <PanelHeader
        title="Styles de titres"
        actions={[
          {
            icon: <IconGear size={15} />,
            title: "Régler les styles (police, taille, couleur, numérotation)",
            onClick: onOpenSettings,
          },
        ]}
        onClose={onClose}
      />

      <div className="hsp-current">
        Style actuel : <strong>{active === "paragraph" ? "Normal" : `Titre ${active}`}</strong>
      </div>

      <div className="hsp-list" role="listbox" aria-label="Styles de titres">
        <button
          type="button"
          role="option"
          aria-selected={active === "paragraph"}
          className={`hsp-item${active === "paragraph" ? " hsp-item-active" : ""}`}
          // Garde le focus (et donc la sélection) dans l'éditeur : sans ça le
          // mousedown vide la sélection avant que le clic ne s'applique.
          onMouseDown={(e) => e.preventDefault()}
          onClick={onPickParagraph}
          title="Texte normal (paragraphe)"
        >
          <span className="hsp-item-label">Normal</span>
          <span className="hsp-item-meta">Paragraphe</span>
        </button>
        {LEVELS.map((level) => {
          const s = headingStyles[level];
          return (
            <button
              key={level}
              type="button"
              role="option"
              aria-selected={active === level}
              className={`hsp-item${active === level ? " hsp-item-active" : ""}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onPick(level)}
              title={`Appliquer le style Titre ${level} (cliquer à nouveau sur le niveau actif le repasse en texte normal)`}
            >
              <span
                className="hsp-item-label"
                style={{
                  fontFamily: s.fontFamily,
                  fontSize: s.fontSize,
                  color: s.color,
                  fontWeight: s.bold ? 700 : 400,
                  fontStyle: s.italic ? "italic" : "normal",
                }}
              >
                Titre {level}
              </span>
              <span className="hsp-item-meta">{s.fontSize}</span>
            </button>
          );
        })}
      </div>


      <div className="hsp-list" role="listbox" aria-label="Styles de titres">
        <button
          type="button"
          role="option"
          aria-selected={active === "paragraph"}
          className={`hsp-item${active === "paragraph" ? " hsp-item-active" : ""}`}
          // Garde le focus (et donc la sélection) dans l'éditeur : sans ça le
          // mousedown vide la sélection avant que le clic ne s'applique.
          onMouseDown={(e) => e.preventDefault()}
          onClick={onPickParagraph}
          title="Texte normal (paragraphe)"
        >
          <span className="hsp-item-label">Normal</span>
          <span className="hsp-item-meta">Paragraphe</span>
        </button>
        {LEVELS.map((level) => {
          const s = headingStyles[level];
          return (
            <button
              key={level}
              type="button"
              role="option"
              aria-selected={active === level}
              className={`hsp-item${active === level ? " hsp-item-active" : ""}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onPick(level)}
              title={`Appliquer le style Titre ${level} (cliquer à nouveau sur le niveau actif le repasse en texte normal)`}
            >
              <span
                className="hsp-item-label"
                style={{
                  fontFamily: s.fontFamily,
                  fontSize: s.fontSize,
                  color: s.color,
                  fontWeight: s.bold ? 700 : 400,
                  fontStyle: s.italic ? "italic" : "normal",
                }}
              >
                Titre {level}
              </span>
              <span className="hsp-item-meta">{s.fontSize}</span>
            </button>
          );
        })}
      </div>

      <div className="hsp-footer">
        <button type="button" className="hsp-settings" onClick={onOpenSettings}>
          Régler les styles…
        </button>
      </div>
    </div>
  );
}
