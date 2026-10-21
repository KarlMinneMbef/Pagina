/**
 * Panneau latéral « Rechercher / Remplacer » (roadmap 2.4, 2026-10-21) —
 * ouvert par Ctrl+F (comme Word), monté dans ContextualPanelHost. Le
 * MOTEUR vit dans MarkdownEditor (handle findText/replaceCurrent/
 * replaceAll) : le panneau ne fait que présenter et naviguer — la
 * sélection des occurrences est visible sur les pages peintes (même
 * surbrillance que la sélection normale), le défilement vers chaque
 * résultat est assuré par l'éditeur.
 *
 * Présentation façon Word : champ de recherche + compteur « n/m » +
 * Précédent/Suivant (Entrée = suivant, Maj+Entrée = précédent), champ
 * de remplacement + Remplacer / Tout remplacer (une seule étape
 * d'annulation), options Respecter la casse / Mots entiers.
 */
import { useEffect, useRef, useState } from "react";
import type { FindReplaceOptions } from "../Editor/MarkdownEditor";
import { PanelHeader } from "../ContextualPanels/PanelHeader";
import { IconTrash } from "../Toolbar/icons";
import "./FindReplacePanel.css";

export function FindReplacePanel({
  onFind,
  onReplaceCurrent,
  onReplaceAll,
  onClose,
}: {
  /** Handle findText — sélectionne l'occurrence demandée dans la page. */
  onFind: (query: string, options: FindReplaceOptions, direction?: 1 | -1) => { total: number; index: number } | null;
  /** Handle replaceCurrent (remplace la sélection courante si elle correspond). */
  onReplaceCurrent: (
    query: string,
    options: FindReplaceOptions,
    replacement: string,
  ) => { total: number; index: number } | null;
  /** Handle replaceAll — retourne le nombre de remplacements. */
  onReplaceAll: (query: string, options: FindReplaceOptions, replacement: string) => number;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [replacement, setReplacement] = useState("");
  const [matchCase, setMatchCase] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [result, setResult] = useState<{ total: number; index: number } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus dans le champ dès l'ouverture (Ctrl+F => on tape tout de suite).
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const options: FindReplaceOptions = { matchCase, wholeWord };

  /** (Re)lance la recherche : à chaque frappe/options, comme Word. */
  const search = (direction: 1 | -1 = 1) => {
    if (!query) {
      setResult(null);
      return;
    }
    const r = onFind(query, options, direction);
    setResult(r);
    setMessage(null);
  };

  // Recherche en direct à chaque changement de texte/options.
  useEffect(() => {
    if (!query) {
      setResult(null);
      return;
    }
    const r = onFind(query, options, 1);
    setResult(r);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, matchCase, wholeWord]);

  const replaceOne = () => {
    if (!query) return;
    const r = onReplaceCurrent(query, options, replacement);
    if (r === null) {
      // Rien de remplaçable sous le curseur : avancer vers l'occurrence.
      const f = onFind(query, options, 1);
      setResult(f);
      setMessage(f ? null : "Aucune occurrence");
      return;
    }
    setResult(r);
    setMessage(null);
  };

  const replaceEverything = () => {
    if (!query) return;
    const count = onReplaceAll(query, options, replacement);
    setResult(null);
    setMessage(count > 0 ? `${count} remplacement${count > 1 ? "s" : ""} effectué${count > 1 ? "s" : ""}` : "Aucune occurrence");
  };

  return (
    <div className="fr-panel">
      <PanelHeader
        title="Rechercher"
        actions={[
          {
            icon: <IconTrash size={15} />,
            title: "Effacer la recherche",
            onClick: () => {
              setQuery("");
              setReplacement("");
              setResult(null);
              setMessage(null);
              inputRef.current?.focus();
            },
            danger: true,
          },
        ]}
        onClose={onClose}
        closeTitle="Fermer le panneau de recherche (Ctrl+F pour rouvrir)"
      />
      <div className="fr-body">
        <div className="fr-row">
          <input
            ref={inputRef}
            className="fr-input"
            type="text"
            placeholder="Rechercher dans le document…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                search(e.shiftKey ? -1 : 1);
              }
              if (e.key === "Escape") {
                e.preventDefault();
                onClose();
              }
            }}
          />
          <span
            className={`fr-counter${result === null && query ? " fr-counter-none" : ""}`}
            title={result ? `Occurrence ${result.index} sur ${result.total}` : "Occurrences"}
          >
            {result ? `${result.index}/${result.total}` : query ? "0/0" : ""}
          </span>
          <button type="button" className="fr-nav-btn" title="Occurrence précédente (Maj+Entrée)" onClick={() => search(-1)} disabled={!query}>
            ‹
          </button>
          <button type="button" className="fr-nav-btn" title="Occurrence suivante (Entrée)" onClick={() => search(1)} disabled={!query}>
            ›
          </button>
        </div>

        <div className="fr-options">
          <label className="fr-option">
            <input type="checkbox" checked={matchCase} onChange={(e) => setMatchCase(e.target.checked)} />
            Respecter la casse
          </label>
          <label className="fr-option">
            <input type="checkbox" checked={wholeWord} onChange={(e) => setWholeWord(e.target.checked)} />
            Mots entiers
          </label>
        </div>

        <div className="fr-row">
          <input
            className="fr-input"
            type="text"
            placeholder="Remplacer par…"
            value={replacement}
            onChange={(e) => setReplacement(e.target.value)}
          />
        </div>
        <div className="fr-actions">
          <button type="button" className="fr-btn" onClick={replaceOne} disabled={!query}>
            Remplacer
          </button>
          <button type="button" className="fr-btn fr-btn-primary" onClick={replaceEverything} disabled={!query}>
            Tout remplacer
          </button>
        </div>
        {message && <p className="fr-message">{message}</p>}
      </div>
    </div>
  );
}
