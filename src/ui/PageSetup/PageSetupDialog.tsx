/**
 * Boîte de dialogue « Mise en page » — reproduction fidèle du dialogue Word
 * (demande 2026-10-17 : « exactement identique aux 3 premières captures »),
 * trois onglets :
 * - Marges : haut/bas/gauche/droite (cm), relure (inerte), orientation
 *   portrait/paysage, « Afficher plusieurs pages » (inert), aperçu,
 *   « Appliquer à » (figé : sections pas encore traitées).
 * - Papier : format (A3/A4/A5/Letter/Legal) + largeur/hauteur éditables
 *   (dimensions personnalisées, voir pageLayout.ts), alimentation (inerte),
 *   Document (version/auteur — spécifique Pagina), options d'impression (inert).
 * - Mise en page : Section (inerte), en-têtes et pieds de page (« Première
 *   page différente » câblée sur l'affichage page 1 existant ; « Paires et
 *   impaires » inert), « À partir du bord » (câblé), alignement vertical
 *   (inert), Numérotation des lignes/Bordures (inerts).
 *
 * Les champs INERTS sont volontairement grisés : visibles comme dans Word,
 * mais clairement non fonctionnels tant que la notion n'est pas traitée
 * (sections, relure, pages paires/impaires…) — ils s'activeront ensuite.
 * Modifie le `PageLayoutSettings` d'un seul document ; « Définir par
 * défaut » persiste les réglages pour les NOUVEAUX documents
 * (localStorage, voir pageLayout.ts). Le texte de l'en-tête/pied ne se
 * règle PAS ici : il s'édite sur la page même (comme Word).
 */
import { useState } from "react";
import type { PageLayoutSettings } from "../../core/pageLayout";
import { PAPER_SIZE_LABELS, PAPER_SIZES_MM, resolvePageSizeMm, saveDefaultPageLayout } from "../../core/pageLayout";
import "./PageSetupDialog.css";

type PsTab = "marges" | "papier" | "miseEnPage";

/** mm (stockage) → cm (affichage Word) et retour, sans erreur de flottant. */
const mmToCm = (mm: number) => Math.round((mm / 10) * 100) / 100;
const cmToMm = (cm: number) => Math.round(cm * 100) / 10;

/** Champ numérique « Word » : libellé AU-DESSUS, valeur en cm à virgule,
 * flèches incrément/décrément natives du navigateur. */
function CmField({
  label,
  valueMm,
  disabled,
  onChange,
  min = 0,
  max = 200,
}: {
  label: string;
  valueMm: number;
  disabled?: boolean;
  onChange: (mm: number) => void;
  min?: number;
  max?: number;
}) {
  return (
    <label className={`ps-num${disabled ? " ps-disabled-field" : ""}`}>
      <span>{label}</span>
      <span className="ps-num-box">
        <input
          type="number"
          disabled={disabled}
          min={min}
          max={max}
          step={0.1}
          value={mmToCm(valueMm)}
          onChange={(e) => {
            const cm = Number(e.target.value);
            if (!Number.isNaN(cm)) onChange(Math.min(Math.max(cmToMm(cm), min), max));
          }}
        />
        <span className="ps-num-unit">cm</span>
      </span>
    </label>
  );
}

/** Aperçu « Word » : mini-page SVG reflétant marges, orientation, format,
 * zones d'en-tête/pied de page et lignes de texte simulées. */
function PagePreview({ layout }: { layout: PageLayoutSettings }) {
  const { widthMm, heightMm } = resolvePageSizeMm(layout);
  const maxW = 120;
  const scale = maxW / widthMm;
  const w = widthMm * scale;
  const h = heightMm * scale;
  const mx = (v: number) => v * scale;
  const lines = 9;
  const lineH = (heightMm - layout.marginTopMm - layout.marginBottomMm) / (lines * 1.9);
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="ps-preview" aria-hidden="true">
      <rect x="0.5" y="0.5" width={w - 1} height={h - 1} fill="#ffffff" stroke="#8a8a8a" />
      {/* marges (pointillés) */}
      <rect
        x={mx(layout.marginLeftMm)}
        y={mx(layout.marginTopMm)}
        width={Math.max(w - mx(layout.marginLeftMm) - mx(layout.marginRightMm), 0)}
        height={Math.max(h - mx(layout.marginTopMm) - mx(layout.marginBottomMm), 0)}
        fill="none"
        stroke="#b9b9b7"
        strokeDasharray="2 2"
      />
      {/* zones en-tête / pied de page */}
      {layout.header.text && (
        <rect x={mx(layout.marginLeftMm)} y={mx(layout.header.fromEdgeMm)} width={Math.max(w - mx(layout.marginLeftMm) - mx(layout.marginRightMm), 0)} height={mx(layout.header.heightMm)} fill="#e8e8e6" />
      )}
      {layout.footer.text && (
        <rect x={mx(layout.marginLeftMm)} y={h - mx(layout.footer.fromEdgeMm) - mx(layout.footer.heightMm)} width={Math.max(w - mx(layout.marginLeftMm) - mx(layout.marginRightMm), 0)} height={mx(layout.footer.heightMm)} fill="#e8e8e6" />
      )}
      {/* lignes de texte simulées */}
      {Array.from({ length: lines }, (_, i) => (
        <rect
          key={i}
          x={mx(layout.marginLeftMm)}
          y={mx(layout.marginTopMm) + (i + 0.4) * mx(lineH) * 1.9}
          width={Math.max(w - mx(layout.marginLeftMm) - mx(layout.marginRightMm), 0) * (i % 3 === 2 ? 0.72 : 1)}
          height={Math.max(mx(lineH), 1)}
          fill="#c9c9c7"
        />
      ))}
    </svg>
  );
}

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
  const [tab, setTab] = useState<PsTab>("marges");
  const [defaultSaved, setDefaultSaved] = useState(false);

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

  const handleSetDefault = () => {
    saveDefaultPageLayout(draft);
    setDefaultSaved(true);
  };

  // « Première page différente » (Word) : cochée = l'en-tête/pied ORDINAIRE
  // n'apparaît pas sur la page 1 (notion existante showOnFirstPage, inversée).
  const firstPageDifferent = !draft.header.showOnFirstPage || !draft.footer.showOnFirstPage;
  const setFirstPageDifferent = (checked: boolean) => {
    setHeader({ showOnFirstPage: !checked });
    setFooter({ showOnFirstPage: !checked });
  };

  // Largeur/Hauteur affichées : dimensions réelles (orientation appliquée).
  const pageDims = resolvePageSizeMm(draft);

  return (
    <div className="ps-overlay" onMouseDown={onClose}>
      <div className="ps-dialog" onMouseDown={(e) => e.stopPropagation()}>
        <div className="ps-titlebar">
          <span className="ps-titlebar-text">Mise en page</span>
          <button className="ps-close" onClick={onClose} title="Fermer">
            ✕
          </button>
        </div>

        <div className="ps-tabbar">
          <button className={`ps-tab${tab === "marges" ? " ps-tab-active" : ""}`} onClick={() => setTab("marges")}>
            Marges
          </button>
          <button className={`ps-tab${tab === "papier" ? " ps-tab-active" : ""}`} onClick={() => setTab("papier")}>
            Papier
          </button>
          <button className={`ps-tab${tab === "miseEnPage" ? " ps-tab-active" : ""}`} onClick={() => setTab("miseEnPage")}>
            Mise en page
          </button>
        </div>

        <div className="ps-body">
          {tab === "marges" && (
            <div className="ps-cols">
              <div className="ps-col-main">
                <fieldset className="ps-group">
                  <legend>Marges</legend>
                  <div className="ps-margins-grid">
                    <CmField label="Haut :" valueMm={draft.marginTopMm} onChange={(mm) => set("marginTopMm", mm)} />
                    <CmField label="Bas :" valueMm={draft.marginBottomMm} onChange={(mm) => set("marginBottomMm", mm)} />
                    <CmField label="Gauche :" valueMm={draft.marginLeftMm} onChange={(mm) => set("marginLeftMm", mm)} />
                    <CmField label="Droite :" valueMm={draft.marginRightMm} onChange={(mm) => set("marginRightMm", mm)} />
                    <CmField label="Relure :" valueMm={0} disabled onChange={() => {}} />
                    <label className="ps-num ps-disabled-field">
                      <span>Position de la relure :</span>
                      <select disabled>
                        <option>Gauche</option>
                      </select>
                    </label>
                  </div>
                </fieldset>

                <fieldset className="ps-group">
                  <legend>Orientation</legend>
                  <div className="ps-orient">
                    <button
                      type="button"
                      className={`ps-orient-btn${draft.orientation === "portrait" ? " ps-orient-active" : ""}`}
                      onClick={() => set("orientation", "portrait")}
                    >
                      <svg width="26" height="34" viewBox="0 0 26 34" aria-hidden="true">
                        <rect x="4" y="4" width="18" height="26" fill="none" stroke="currentColor" />
                        <path d="M7 9h12M7 13h12M7 17h8" stroke="currentColor" />
                      </svg>
                      Portrait
                    </button>
                    <button
                      type="button"
                      className={`ps-orient-btn${draft.orientation === "landscape" ? " ps-orient-active" : ""}`}
                      onClick={() => set("orientation", "landscape")}
                    >
                      <svg width="34" height="26" viewBox="0 0 34 26" aria-hidden="true">
                        <rect x="4" y="4" width="26" height="18" fill="none" stroke="currentColor" />
                        <path d="M8 8h18M8 12h18M8 16h12" stroke="currentColor" />
                      </svg>
                      Paysage
                    </button>
                  </div>
                </fieldset>

                <fieldset className="ps-group">
                  <legend>Pages</legend>
                  <label className="ps-num ps-disabled-field">
                    <span>Afficher plusieurs pages :</span>
                    <select disabled>
                      <option>Normal</option>
                    </select>
                  </label>
                </fieldset>
              </div>

              <div className="ps-col-preview">
                <fieldset className="ps-group">
                  <legend>Aperçu</legend>
                  <PagePreview layout={draft} />
                </fieldset>
                <label className="ps-num ps-disabled-field">
                  <span>Appliquer à :</span>
                  <select disabled>
                    <option>À tout le document</option>
                  </select>
                </label>
              </div>
            </div>
          )}

          {tab === "papier" && (
            <div className="ps-cols">
              <div className="ps-col-main">
                <fieldset className="ps-group">
                  <legend>Format du papier</legend>
                  <label className="ps-num ps-select">
                    <span>Format du papier :</span>
                    <select
                      value={draft.paperSize}
                      onChange={(e) => {
                        // Choisir un format remplace les dimensions
                        // personnalisées par celles du format.
                        setDraft((d) => ({ ...d, paperSize: e.target.value as PageLayoutSettings["paperSize"], widthMm: undefined, heightMm: undefined }));
                      }}
                    >
                      {(Object.keys(PAPER_SIZES_MM) as PageLayoutSettings["paperSize"][]).map((p) => (
                        <option key={p} value={p}>
                          {PAPER_SIZE_LABELS[p]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="ps-margins-grid">
                    <CmField
                      label="Largeur :"
                      valueMm={pageDims.widthMm}
                      max={500}
                      onChange={(mm) =>
                        setDraft((d) =>
                          d.orientation === "landscape" ? { ...d, heightMm: mm } : { ...d, widthMm: mm },
                        )
                      }
                    />
                    <CmField
                      label="Hauteur :"
                      valueMm={pageDims.heightMm}
                      max={500}
                      onChange={(mm) =>
                        setDraft((d) =>
                          d.orientation === "landscape" ? { ...d, widthMm: mm } : { ...d, heightMm: mm },
                        )
                      }
                    />
                  </div>
                </fieldset>

                <fieldset className="ps-group">
                  <legend>Alimentation papier</legend>
                  <div className="ps-margins-grid">
                    <label className="ps-num ps-disabled-field">
                      <span>Première page :</span>
                      <select disabled>
                        <option>Bac par défaut</option>
                      </select>
                    </label>
                    <label className="ps-num ps-disabled-field">
                      <span>Autres pages :</span>
                      <select disabled>
                        <option>Bac par défaut</option>
                      </select>
                    </label>
                  </div>
                </fieldset>

                <button type="button" className="ps-btn ps-btn-link" disabled>
                  Options d&apos;impression…
                </button>
              </div>

              <div className="ps-col-preview">
                <fieldset className="ps-group">
                  <legend>Aperçu</legend>
                  <PagePreview layout={draft} />
                </fieldset>
                <label className="ps-num ps-disabled-field">
                  <span>Appliquer à :</span>
                  <select disabled>
                    <option>À tout le document</option>
                  </select>
                </label>
              </div>
            </div>
          )}

          {tab === "miseEnPage" && (
            <div className="ps-cols">
              <div className="ps-col-main">
                <fieldset className="ps-group">
                  <legend>Section</legend>
                  <label className="ps-num ps-disabled-field">
                    <span>Début de la section :</span>
                    <select disabled>
                      <option>Nouvelle page</option>
                    </select>
                  </label>
                  <label className="ps-check ps-disabled-field">
                    <input type="checkbox" disabled />
                    Supprimer les notes de fin
                  </label>
                </fieldset>

                <fieldset className="ps-group">
                  <legend>En-têtes et pieds de page</legend>
                  <label className="ps-check ps-disabled-field">
                    <input type="checkbox" disabled />
                    Paires et impaires différentes
                  </label>
                  <label className="ps-check">
                    <input type="checkbox" checked={firstPageDifferent} onChange={(e) => setFirstPageDifferent(e.target.checked)} />
                    Première page différente
                  </label>
                  <div className="ps-margins-grid ps-indent">
                    <CmField label="À partir du bord — En-tête :" valueMm={draft.header.fromEdgeMm} max={50} onChange={(mm) => setHeader({ fromEdgeMm: mm })} />
                    <CmField label="À partir du bord — Pied de page :" valueMm={draft.footer.fromEdgeMm} max={50} onChange={(mm) => setFooter({ fromEdgeMm: mm })} />
                  </div>
                </fieldset>

                <fieldset className="ps-group">
                  <legend>Page</legend>
                  <label className="ps-num ps-disabled-field">
                    <span>Alignement vertical :</span>
                    <select disabled>
                      <option>Haut</option>
                    </select>
                  </label>
                </fieldset>
              </div>

              <div className="ps-col-preview">
                <fieldset className="ps-group">
                  <legend>Aperçu</legend>
                  <PagePreview layout={draft} />
                </fieldset>
                <label className="ps-num ps-disabled-field">
                  <span>Appliquer à :</span>
                  <select disabled>
                    <option>À tout le document</option>
                  </select>
                </label>
              </div>
            </div>
          )}
        </div>

        <div className="ps-actions">
          <button type="button" className="ps-btn" onClick={handleSetDefault} title="Enregistrer ces réglages comme valeurs par défaut des nouveaux documents">
            {defaultSaved ? "Défini par défaut ✓" : "Définir par défaut"}
          </button>
          {tab === "miseEnPage" && (
            <>
              <button type="button" className="ps-btn ps-btn-link" disabled>
                Numérotation des lignes…
              </button>
              <button type="button" className="ps-btn ps-btn-link" disabled>
                Bordures…
              </button>
            </>
          )}
          <div className="ps-actions-right">
            <button type="button" className="ps-btn ps-btn-primary" onClick={handleApply}>
              OK
            </button>
            <button type="button" className="ps-btn" onClick={onClose}>
              Annuler
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
