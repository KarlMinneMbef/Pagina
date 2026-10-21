/**
 * Panneau « Équation » (2026-10-17, demande : « pour chaque fonction un
 * panneau latéral droit, très simple — les utilisateurs ne peuvent pas
 * coder une équation ») : éditeur WYSIWYG MathLive pour la formule
 * sélectionnée (`inlineMath`/`blockMath`, NodeSelection posée à
 * l'insertion ou au clic sur la formule peinte).
 *
 * - Champ mathématique <math-field> (MathLive, MIT) : on TAPE l'équation
 *   comme du texte, les structures (exposant, fraction, racine…) se
 *   posent et se parcourent naturellement ; un CLAVIER MATHÉMATIQUE
 *   VIRTUEL s'ouvre par le bouton dédié (onglets basique/grec/
 *   opérateurs). Aucun LaTeX à connaître — MathLive produit le LaTeX
 *   en sortie, KaTeX rend la formule dans la page comme avant.
 * - Toute frappe met à jour le document EN DIRECT (updateMathSource →
 *   setNodeAttribute → repaint), comme le reste de l'éditeur.
 * - Monté dans ContextualPanelHost (App.tsx), remonté à chaque changement
 *   de formule (key = position du nœud) : le champ se réinitialise au
 *   changement de formule, JAMAIS à la frappe (sinon le curseur
 *   sauterait à chaque caractère).
 * - 100 % local (tout tourne dans l'app Tauri, aucun service en ligne).
 */
import { useEffect, useRef } from "react";
import type { MathfieldElement } from "mathlive";
import { PanelHeader } from "../ContextualPanels/PanelHeader";
import { IconKeyboard, IconTrash } from "../Toolbar/icons";
import "mathlive/static.css";
import "mathlive/fonts.css";
import "./EquationPanel.css";

export function EquationPanel({
  kind,
  source,
  onChange,
  onDelete,
  onClose,
}: {
  /** En ligne (`$…$`) ou en bloc (`$$…$$`) — affiché dans le titre. */
  kind: "inline" | "block";
  /** Source LaTeX ACTUELLE du nœud (à l'ouverture du panneau/nœud). */
  source: string;
  /** Appelé à CHAQUE frappe dans le champ (mise à jour en direct). */
  onChange: (source: string) => void;
  /** Supprime la formule du document. */
  onDelete: () => void;
  /** Ferme le panneau (la formule reste sélectionnée). */
  onClose: () => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    let disposed = false;
    let mf: MathfieldElement | null = null;

    // Import DYNAMIQUE : MathLive est volumineux (champ + clavier virtuel) —
    // il n'est chargé que la première fois qu'une équation est éditée, pas
    // au démarrage de l'application (découpage de bundle automatique).
    void import("mathlive").then(({ MathfieldElement: MathfieldElementClass }) => {
      if (disposed || !hostRef.current) return;
      mf = new MathfieldElementClass();
      mf.classList.add("eq-field");
      // « manual » : un BOUTON DE CLAVIER apparaît dans le champ — on
      // n'impose pas le clavier virtuel à l'écran, on l'ouvre à la demande
      // (les utilisateurs avancés tapent au clavier physique).
      mf.setAttribute("virtual-keyboard-mode", "manual");
      mf.setAttribute("locale", "fr");
      mf.setValue(source, { silenceNotifications: true });
      mf.addEventListener("input", () => {
        onChangeRef.current(mf?.value ?? "");
      });
      hostRef.current.appendChild(mf);
      // Focus : prêt à saisir dès l'ouverture du panneau.
      mf.focus();
    });

    return () => {
      disposed = true;
      mf?.remove();
    };
    // Monté une seule fois PAR FORMULE (key = position du nœud dans App) :
    // `source` n'est volontairement PAS dans les dépendances — remettre la
    // valeur à chaque frappe ferait sauter le curseur du champ.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="eq-panel">
      <PanelHeader
        title="Équation"
        chip={kind === "block" ? "En bloc" : "En ligne"}
        actions={[
          // Palette de symboles dans le panneau : maquette validée, à venir
          // (point ②) — le bouton est déjà là, désactivé jusqu'ici.
          {
            icon: <IconKeyboard size={15} />,
            title: "Palette de symboles (à venir)",
            onClick: () => {},
            disabled: true,
          },
          {
            icon: <IconTrash size={15} />,
            title: "Supprimer la formule du document",
            onClick: onDelete,
            danger: true,
          },
        ]}
        onClose={onClose}
        closeTitle="Fermer le panneau (la sélection reste)"
      />
      <div className="eq-body">
        <div className="eq-field-host" ref={hostRef} />
        <p className="eq-hint">Tapez l'équation — le bouton clavier du champ ouvre les symboles (fractions, racines, lettres grecques). L'aperçu dans la page suit en direct.</p>
      </div>
    </div>
  );
}
