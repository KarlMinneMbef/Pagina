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
    source: "flowchart TD\n    A[Départ] --> B{Décision ?}\n    B -- Oui --> C[Action]\n    B -- Non --> D[Fin]\n    C --> D",
  },
  {
    id: "sequence",
    label: "Séquence",
    source:
      "sequenceDiagram\n    participant U as Utilisateur\n    participant S as Système\n    U->>S: Demande\n    S-->>U: Réponse",
  },
  {
    id: "gantt",
    label: "Gantt",
    source:
      "gantt\n    title Planning du chantier\n    dateFormat YYYY-MM-DD\n    section Études\n    Conception      :a1, 2026-11-01, 10d\n    section Chantier\n    Travaux         :a2, after a1, 20d",
  },
  {
    id: "pie",
    label: "Camembert",
    source: "pie title Répartition\n    \"Lot 1\" : 45\n    \"Lot 2\" : 35\n    \"Reste\" : 20",
  },
  {
    id: "class",
    label: "Classes",
    source: "classDiagram\n    class Equipement {\n        +String nom\n        +puissance\n    }\n    Equipement <|-- Chaudiere",
  },
  {
    id: "state",
    label: "État",
    source: "stateDiagram-v2\n    [*] --> EnService\n    EnService --> Arret : Maintenance\n    Arret --> [*]",
  },
  {
    id: "er",
    label: "Relations",
    source:
      "erDiagram\n    CHANTIER ||--o{ LOT : contient\n    LOT ||--|{ EQUIPEMENT : comporte",
  },
];

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
  const renderSeq = useRef(0);
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
      mermaid.initialize({ startOnLoad: false, theme: "neutral" });
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
