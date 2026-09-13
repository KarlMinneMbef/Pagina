/**
 * Boîte de dialogue "Mise en page" : format papier, orientation, marges,
 * en-tête/pied de page, styles de titre. Modifie le `PageLayoutSettings`
 * d'un seul document (voir `core/pageLayout.ts` pour le stockage — un
 * commentaire invisible en tête du fichier .md). Ne connaît rien du store ni
 * du filesystem : reçoit la valeur actuelle et renvoie la nouvelle valeur
 * via `onApply`.
 *
 * Organisée en onglets internes (Page / En-tête et pied de page / Titres et
 * sommaire) — même contenu et même logique de sauvegarde qu'avant, purement
 * réorganisés visuellement. Le troisième onglet ouvre `HeadingStyleDialog`
 * (déjà existant) par-dessus plutôt que de dupliquer son contenu : plus sûr
 * qu'une fusion manuelle (aucun risque de désynchroniser deux copies de la
 * même logique de styles de titre/numérotation), et cohérent avec le fait
 * que ce dialogue reste accessible aussi directement depuis le ruban.
 */
import { useState } from "react";
import type { PageLayoutSettings } from "../../core/pageLayout";
import { HeadingStyleDialog } from "../HeadingStyles/HeadingStyleDialog";
import "./PageSetupDialog.css";

type PsTab = "page" | "headerFooter" | "headings";

const PAPER_SIZES: { value: PageLayoutSettings["paperSize"]; label: string }[] = [
  { value: "A4", label: "A4" },
  { value: "Letter", label: "Letter" },
];

const ORIENTATIONS: { value: PageLayoutSettings["orientation"]; label: string; glyph: string }[] = [
  { value: "portrait", label: "Portrait", glyph: "▯" },
  { value: "landscape", label: "Paysage", glyph: "▭" },
];

export function PageSetupDialog({
  layout,
  onApply,
  onClose,
}: {
  layout: PageLayoutSettings;
  onApply: (layout: PageLayoutSettings) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<PageLayoutSettings>(layout);
  const [tab, setTab] = useState<PsTab>("page");
  const [headingsOpen, setHeadingsOpen] = useState(false);

  const set = <K extends keyof PageLayoutSettings>(key: K, value: PageLayoutSettings[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const setHeader = (patch: Partial<PageLayoutSettings["header"]>) =>
    setDraft((d) => ({ ...d, header: { ...d.header, ...patch } }));

  const setFooter = (patch: Partial<PageLayoutSettings["footer"]>) =>
    setDraft((d) => ({ ...d, footer: { ...d.footer, ...patch } }));

  const handleApply = () => {
    onApply(draft);
    onClose();
  };

  return (
    <div className="ps-overlay" onMouseDown={onClose}>
      <div className="ps-dialog" onMouseDown={(e) => e.stopPropagation()}>
        <div className="ps-header">
          <span>Mise en page</span>
          <button className="ps-close" onClick={onClose} title="Fermer">
            ✕
          </button>
        </div>

        <div className="ps-tabbar">
          <button className={`ps-tab${tab === "page" ? " ps-tab-active" : ""}`} onClick={() => setTab("page")}>
            Page
          </button>
          <button
            className={`ps-tab${tab === "headerFooter" ? " ps-tab-active" : ""}`}
            onClick={() => setTab("headerFooter")}
          >
            En-tête / pied de page
          </button>
          <button className={`ps-tab${tab === "headings" ? " ps-tab-active" : ""}`} onClick={() => setTab("headings")}>
            Titres et sommaire
          </button>
        </div>

        <div className="ps-body">
          {tab === "page" && (
            <>
              <fieldset className="ps-group">
                <legend>Format papier</legend>
                <div className="ps-cards">
                  {PAPER_SIZES.map(({ value, label }) => (
                    <button
                      key={value}
                      type="button"
                      className={`ps-card${draft.paperSize === value ? " ps-card-active" : ""}`}
                      onClick={() => set("paperSize", value)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </fieldset>

              <fieldset className="ps-group">
                <legend>Orientation</legend>
                <div className="ps-cards">
                  {ORIENTATIONS.map(({ value, label, glyph }) => (
                    <button
                      key={value}
                      type="button"
                      className={`ps-card${draft.orientation === value ? " ps-card-active" : ""}`}
                      onClick={() => set("orientation", value)}
                    >
                      <span className="ps-card-glyph">{glyph}</span>
                      {label}
                    </button>
                  ))}
                </div>
              </fieldset>

              <fieldset className="ps-group">
                <legend>Document</legend>
                <label className="ps-field">
                  Version du document
                  <input
                    type="text"
                    placeholder="ex. v1.3"
                    value={draft.documentVersion}
                    onChange={(e) => set("documentVersion", e.target.value)}
                  />
                </label>
                <label className="ps-field">
                  Auteur / rédacteur
                  <input type="text" value={draft.author} onChange={(e) => set("author", e.target.value)} />
                </label>
              </fieldset>

              <fieldset className="ps-group">
                <legend>Marges (mm)</legend>
                <div className="ps-margins-grid">
                  <label className="ps-field">
                    Haut
                    <input
                      type="number"
                      min={0}
                      value={draft.marginTopMm}
                      onChange={(e) => set("marginTopMm", Number(e.target.value))}
                    />
                  </label>
                  <label className="ps-field">
                    Bas
                    <input
                      type="number"
                      min={0}
                      value={draft.marginBottomMm}
                      onChange={(e) => set("marginBottomMm", Number(e.target.value))}
                    />
                  </label>
                  <label className="ps-field">
                    Gauche
                    <input
                      type="number"
                      min={0}
                      value={draft.marginLeftMm}
                      onChange={(e) => set("marginLeftMm", Number(e.target.value))}
                    />
                  </label>
                  <label className="ps-field">
                    Droite
                    <input
                      type="number"
                      min={0}
                      value={draft.marginRightMm}
                      onChange={(e) => set("marginRightMm", Number(e.target.value))}
                    />
                  </label>
                </div>
              </fieldset>
            </>
          )}

          {tab === "headerFooter" && (
            <>
              <p className="ps-hint">
                Variables disponibles dans l'en-tête et le pied de page :{" "}
                <code>{"{{page}}"}</code> <code>{"{{pages}}"}</code> <code>{"{{date}}"}</code>{" "}
                <code>{"{{filename}}"}</code> <code>{"{{version}}"}</code> <code>{"{{author}}"}</code> — ou cliquez
                directement sur l'en-tête/le pied de page d'une page dans l'éditeur pour les modifier sur place.
              </p>

              <fieldset className="ps-group">
                <legend>En-tête</legend>
                <label className="ps-field ps-field-wide">
                  Texte (vide = pas d'en-tête)
                  <input type="text" value={draft.header.text} onChange={(e) => setHeader({ text: e.target.value })} />
                </label>
                <label className="ps-field">
                  Hauteur (mm)
                  <input
                    type="number"
                    min={0}
                    value={draft.header.heightMm}
                    onChange={(e) => setHeader({ heightMm: Number(e.target.value) })}
                  />
                </label>
                <label className="ps-field ps-field-checkbox">
                  <input
                    type="checkbox"
                    checked={draft.header.showOnFirstPage}
                    onChange={(e) => setHeader({ showOnFirstPage: e.target.checked })}
                  />
                  Afficher sur la première page
                </label>
              </fieldset>

              <fieldset className="ps-group">
                <legend>Pied de page</legend>
                <label className="ps-field ps-field-wide">
                  Texte (vide = pas de pied de page)
                  <input type="text" value={draft.footer.text} onChange={(e) => setFooter({ text: e.target.value })} />
                </label>
                <label className="ps-field">
                  Hauteur (mm)
                  <input
                    type="number"
                    min={0}
                    value={draft.footer.heightMm}
                    onChange={(e) => setFooter({ heightMm: Number(e.target.value) })}
                  />
                </label>
                <label className="ps-field ps-field-checkbox">
                  <input
                    type="checkbox"
                    checked={draft.footer.showOnFirstPage}
                    onChange={(e) => setFooter({ showOnFirstPage: e.target.checked })}
                  />
                  Afficher sur la première page
                </label>
              </fieldset>
            </>
          )}

          {tab === "headings" && (
            <div className="ps-headings-tab">
              <p className="ps-hint">
                Police, taille, couleur et numérotation automatique de chaque niveau de titre (Titre 1 à 6), ainsi que
                le sommaire, se gèrent dans une boîte de dialogue dédiée.
              </p>
              <button type="button" className="ps-btn ps-btn-primary" onClick={() => setHeadingsOpen(true)}>
                Ouvrir les styles de titres…
              </button>
            </div>
          )}
        </div>

        <div className="ps-actions">
          <button className="ps-btn" onClick={onClose}>
            Annuler
          </button>
          <button className="ps-btn ps-btn-primary" onClick={handleApply}>
            Appliquer
          </button>
        </div>
      </div>

      {headingsOpen && (
        <HeadingStyleDialog
          layout={draft}
          onApply={(newLayout) => setDraft(newLayout)}
          onClose={() => setHeadingsOpen(false)}
        />
      )}
    </div>
  );
}
