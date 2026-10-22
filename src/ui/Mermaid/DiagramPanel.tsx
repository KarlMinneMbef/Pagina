/**
 * Panneau « Diagramme » (refonte de l'édition Mermaid, 2026-10-21 —
 * demande utilisateur : « trouver une solution pour l'éditeur de
 * diagramme Mermaid »). Même patron que le panneau Équation :
 *
 * - La PAGE ne montre QUE le diagramme rendu (comme une image Word) ;
 *   l'ancien textarea de source affiché en permanence sur la page a été
 *   retiré (MermaidDiagram.ts).
 * - Clic sur le diagramme peint → NodeSelection → ce panneau s'ouvre :
 *   SOURCE éditable (monospace) + APERÇU rendu en direct (mermaid,
 *   re-rendu débouncé à chaque frappe) + PALETTE DE MODÈLES
 *   (organigramme, séquence, Gantt, camembert, classes, état…) qui
 *   remplace la source par un squelette prêt à compléter.
 * - Toute frappe met à jour le document EN DIRECT
 * (updateMermaidSource → setNodeAttribute → repaint) — la page suit.
 * - Monté dans ContextualPanelHost (App.tsx), remonté à chaque
 * changement de diagramme (key = position du nœud), JAMAIS à la
 * frappe (le textarea garde son curseur).
 */
import { useEffect, useRef, useState } from "react";
import { PanelHeader } from "../ContextualPanels/PanelHeader";
import { IconTrash } from "../Toolbar/icons";
import {
  DIAGRAM_THEMES,
  buildMermaidConfig,
  diagramThemeVersion,
  setDiagramTheme,
  useDiagramTheme,
} from "../../core/diagramTheme";
import { refreshAllMermaidDiagrams } from "../Editor/extensions/MermaidDiagram";
import "./DiagramPanel.css";

/** Un modèle de diagramme : libellé + squelette Mermaid prêt à
 * compléter (textes en français, adaptés aux documents du bureau
 * d'études — organigrammes de chantier, séquences d'intervention…). */
interface DiagramTemplate {
  id: string;
  label: string;
  source: string;
}

const TEMPLATES: DiagramTemplate[] = [
  {
    id: "flowchart",
    label: "Organigramme",
    source: `flowchart TD
    A[Dossier d'études] --> B{Visa synthétique}
    B -->|Conforme| C[DCE émis]
    B -->|Réserve| D[Fiche de réserves]
    D --> A
    C --> E[Réponse AT / consultation]
    E --> F[Marché attribué]
    F --> G[Visite de chantier]
    G --> H[Levée des observations]
    H --> I[DIUO + DOE]`,
  },
  {
    id: "sequence",
    label: "Séquence",
    source: `sequenceDiagram
    participant MOA
    participant BE
    participant MOE
    participant Entreprise
    MOA->>BE: Dossier d'études
    BE->>MOE: Visa synthétique
    MOE-->>BE: Observations / réserves
    BE->>MOA: Dossier corrigé
    MOA->>Entreprise: Notification de marché
    Entreprise-->>BE: Questions AT
    BE->>Entreprise: Réponse au plus tard 12 jours avant`,
  },
  {
    id: "gantt",
    label: "Gantt",
    source: `gantt
    title Planning d'études — Lot 2 CVC
    dateFormat YYYY-MM-DD
    section Études
    Conception APS       :done, a1, 2026-09-01, 20d
    Visite de chantier   :active, a2, after a1, 5d
    Synthèse APD         :a3, after a2, 15d
    section Consultation
    DCE émis             :b1, after a3, 3d
    Réponses AT          :b2, after b1, 21d
    section Chantier
    Travaux              :c1, after b2, 60d
    DOE                  :milestone, c2, after c1, 0d`,
  },
  {
    id: "pie",
    label: "Camembert",
    source: `pie showData
    title Répartition du chiffrage — Lot 2
    "Génie climatique" : 42
    "Plomberie sanitaire" : 28
    "Régulation GTC" : 15
    "Essais et mise en service" : 9
    "DOE et Diagnostics" : 6`,
  },
  {
    id: "class",
    label: "Classes",
    source: `classDiagram
    class Dossier {
        +String numero
        +String designation
        +Etat etat
        +valider()
        +cloturer()
    }
    class Reserves {
        +List items
        +ajouter()
        +lever()
    }
    class Plan {
        +String indice
        +String discipline
        +incrementer()
    }
    Dossier "1" --> "*" Plan
    Dossier "1" --> "*" Reserves`,
  },
  {
    id: "state",
    label: "État",
    source: `stateDiagram-v2
    [*] --> EnCours
    EnCours --> EnVisa : dossier complet
    EnVisa --> Reserve : observations
    EnVisa --> Valide : conforme
    Reserve --> EnCours : corrections
    Valide --> Cloture : DOE rendu
    Cloture --> [*]`,
  },
  {
    id: "er",
    label: "Relations",
    source: `erDiagram
    AFFAIRE ||--o{ DOSSIER : contient
    DOSSIER ||--|{ PLAN : "comporte"
    DOSSIER ||--o{ RESERVES : "génère"
    PLAN }o--|| DISCIPLINE : "appartient à"
    AFFAIRE {
        string numero
        string client
        date date_commande
    }
    PLAN {
        string indice
        string designation
    }`,
  },
];

/** Un champ de couleur personnalisée : nuancier natif + témoin « auto »
 *  quand aucune surcharge n'est posée (la couleur du thème s'applique). */
function DiagramColorField({
  label,
  value,
  onChange,
  onClear,
}: {
  label: string;
  /** Couleur de surcharge, "" = aucune (couleur du thème). */
  value: string;
  onChange: (color: string) => void;
  onClear: () => void;
}) {
  return (
    <span className="dm-color-field">
      <span className="dm-color-label">{label}</span>
      {/* React mappe onChange sur l'évènement natif « input » des
       * <input type="color"> — le piège « change » (CLAUDE.md) ne
       * s'applique pas ici, la couleur suit le glissement en direct. */}
      <input
        type="color"
        value={value || "#e8f4ee"}
        onChange={(e) => onChange(e.target.value)}
        title={value ? `${label} : ${value} (cliquez pour changer)` : `${label} : automatique (couleur du thème)`}
      />
      {value ? (
        <button type="button" className="dm-color-clear" onClick={onClear} title={`Retirer la surcharge « ${label} »`}>
          ✕
        </button>
      ) : (
        <span className="dm-color-none">auto</span>
      )}
    </span>
  );
}

/** Panneau Diagramme : édition de la source Mermaid avec rendu SVG live. */
export function DiagramPanel({
  source,
  onSourceChange,
  onDelete,
  onClose,
}: {
  /** Source Mermaid ACTUELLE du nœud (à l'ouverture seulement — le panneau
   * garde ensuite la main sur son textarea pour ne jamais faire sauter
   * le curseur à la frappe). */
  source: string;
  /** Appelé à CHAQUE frappe (mise à jour en direct du document). */
  onSourceChange: (source: string) => void;
  /** Supprime le diagramme du document. */
  onDelete: () => void;
  /** Ferme le panneau (le diagramme reste sélectionné). */
  onClose: () => void;
}) {
  const [value, setValue] = useState(source);
  const [previewHtml, setPreviewHtml] = useState<string>("");
  const [previewError, setPreviewError] = useState<string | null>(null);
  // Thème de couleurs (thème + surcharges) — réglage GLOBAL (tous les
  // diagrammes, persisted via core/diagramTheme.ts), édité depuis ici.
  const diagramTheme = useDiagramTheme();
  const [colorsOpen, setColorsOpen] = useState(false);
  const renderSeq = useRef(0);
  // Version de la config de thème déjà appliquée par CE panneau (le
  // module MermaidDiagram a la sienne — le garde interne de
  // mermaid.initialize rend la ré-application gratuite).
  const appliedThemeVersion = useRef(-1);
  // Debounce du rendu : re-rendre le SVG à CHAQUE caractère coûterait
  // trop (mermaid.render est asynchrone et loin d'être gratuit).
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Rendu de l'aperçu du panneau (indépendant de la page — la page
   * montre déjà le résultat, l'aperçu sert quand le diagramme est hors
   * écran et donne un retour immédiat sur la syntaxe). */
  const renderPreview = async (src: string) => {
    renderSeq.current += 1;
    const seq = renderSeq.current;
    try {
      const { default: mermaid } = await import("mermaid");
      const v = diagramThemeVersion();
      if (v !== appliedThemeVersion.current) {
        mermaid.initialize({ startOnLoad: false, ...buildMermaidConfig() });
        appliedThemeVersion.current = v;
      }
      const { svg } = await mermaid.render(`xmd-diagram-panel-${seq}`, src);
      if (seq === renderSeq.current) {
        setPreviewHtml(svg);
        setPreviewError(null);
      }
    } catch {
      if (seq === renderSeq.current) {
        setPreviewError("Erreur de syntaxe — vérifiez la source ci-dessous.");
      }
    }
  };

  useEffect(() => {
    void renderPreview(value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onInput = (v: string) => {
    setValue(v);
    onSourceChange(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => void renderPreview(v), 250);
  };

  /** Un modèle REMPLACE la source (undoable : une étape d'annulation
   * par remplacement, l'ancienne source reste récupérable par Ctrl+Z). */
  const applyTemplate = (tpl: DiagramTemplate) => {
    setValue(tpl.source);
    onSourceChange(tpl.source);
    void renderPreview(tpl.source);
  };

  /** Applique un changement de thème/couleurs : persiste (API isolée,
   * core/diagramTheme.ts), re-rend l'aperçu ET toutes les vues de la
   * page (refreshAllMermaidDiagrams — le repaint de la couche peinte
   * ne fait que cloner le SVG, il ne relance pas mermaid). */
  const applyTheme = (patch: Parameters<typeof setDiagramTheme>[0]) => {
    setDiagramTheme(patch);
    void renderPreview(value);
    refreshAllMermaidDiagrams();
  };

  return (
    <div className="dm-panel">
      <PanelHeader
        title="Diagramme"
        chip="Mermaid"
        actions={[
          {
            icon: <IconTrash size={15} />,
            title: "Supprimer le diagramme du document",
            onClick: onDelete,
            danger: true,
          },
        ]}
        onClose={onClose}
        closeTitle="Fermer le panneau (la sélection reste)"
      />
      <div className="dm-body">
        {/* Thème de couleurs — réglage GLOBAL (tous les diagrammes du
         * document et des prochains), jamais écrit dans la source. */}
        <div className="dm-theme-row">
          <label className="dm-theme-field">
            <span>Thème</span>
            <select
              value={diagramTheme.theme}
              onChange={(e) => applyTheme({ theme: e.target.value as typeof diagramTheme.theme })}
              title="Couleurs appliquées à tous les diagrammes (rendu uniquement)"
            >
              {DIAGRAM_THEMES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="dm-theme-btn"
            onClick={() => setColorsOpen((o) => !o)}
            title="Surcharger les couleurs du thème (rendu uniquement, jamais dans la source)"
          >
            {colorsOpen ? "Masquer les couleurs" : "Personnaliser…"}
          </button>
        </div>
        {colorsOpen && (
          <div className="dm-colors">
            <DiagramColorField
              label="Principale"
              value={diagramTheme.colors.primary}
              onChange={(c) => applyTheme({ colors: { ...diagramTheme.colors, primary: c } })}
              onClear={() => applyTheme({ colors: { ...diagramTheme.colors, primary: "" } })}
            />
            <DiagramColorField
              label="Secondaire"
              value={diagramTheme.colors.secondary}
              onChange={(c) => applyTheme({ colors: { ...diagramTheme.colors, secondary: c } })}
              onClear={() => applyTheme({ colors: { ...diagramTheme.colors, secondary: "" } })}
            />
            <DiagramColorField
              label="Accent"
              value={diagramTheme.colors.accent}
              onChange={(c) => applyTheme({ colors: { ...diagramTheme.colors, accent: c } })}
              onClear={() => applyTheme({ colors: { ...diagramTheme.colors, accent: "" } })}
            />
            <button
              type="button"
              className="dm-colors-reset"
              onClick={() => applyTheme({ colors: { primary: "", secondary: "", accent: "" } })}
              title="Revenir aux couleurs pures du thème choisi"
            >
              Réinitialiser
            </button>
          </div>
        )}
        <div className="dm-templates">
          {TEMPLATES.map((t) => (
            <button
              key={t.id}
              type="button"
              className="dm-template-btn"
              title={`Remplacer la source par un modèle « ${t.label} » prêt à compléter (Ctrl+Z pour annuler)`}
              onClick={() => applyTemplate(t)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <textarea
          className="dm-source"
          spellCheck={false}
          value={value}
          onChange={(e) => onInput(e.target.value)}
          placeholder="Source Mermaid du diagramme…"
        />
        {previewError ? (
          <p className="dm-error">{previewError}</p>
        ) : (
          <div className="dm-preview" dangerouslySetInnerHTML={{ __html: previewHtml }} />
        )}
        <p className="dm-hint">
          Le diagramme se met à jour dans la page à chaque frappe. Les modèles remplacent la source (Ctrl+Z pour revenir en arrière).
        </p>
      </div>
    </div>
  );
}
