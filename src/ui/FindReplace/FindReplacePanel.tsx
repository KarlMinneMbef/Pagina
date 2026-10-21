/**
 * Panneau latéral « Rechercher » — refonte façon VOLET DE NAVIGATION de
 * Word (retour utilisateur 2026-10-21 : « plus comme Word, on garde le
 * remplacer ») :
 *
 * - Champ de recherche PLEINE LARGEUR avec bouton ✕ d'effacement.
 * - « n résultats » puis ONGLETS : « Résultats » (chaque occurrence avec
 *   son contexte, l'occurrence en gras — clic = y aller, la sélection se
 *   peint sur la page et le document y défile) et « Titres » (plan du
 *   document : chaque titre, clic = y aller).
 * - REMPLACER conservé : champ « Remplacer par… », Remplacer (l'occurrence
 *   sélectionnée) et Tout remplacer (une seule étape d'annulation),
 *   options Respecter la casse / Mots entiers.
 * - Entrée = occurrence suivante, Maj+Entrée = précédente, Échap ferme.
 * - Recherche RAPIDE : le champ de la barre de titre (TitleBar) porte sa
 *   frappe ici via `seed`.
 *
 * Le moteur vit dans MarkdownEditor (handle listFindMatches/selectMatch/
 * replaceCurrent/replaceAll/listHeadings) — le panneau ne présente et
 * ne navigue jamais ; les positions viennent du document.
 */
import { useEffect, useRef, useState } from "react";
import type { FindReplaceOptions, FindMatchResult, HeadingEntry } from "../Editor/MarkdownEditor";
import { PanelHeader } from "../ContextualPanels/PanelHeader";
import { IconTrash } from "../Toolbar/icons";
import "./FindReplacePanel.css";

type PanelTab = "resultats" | "titres";

export function FindReplacePanel({
  seed = "",
  onListMatches,
  onSelectMatch,
  onListHeadings,
  onReplaceCurrent,
  onReplaceAll,
  onClose,
}: {
  /** Requête venant du champ de recherche rapide de la barre de titre :
   * posée dans le champ à chaque changement (et comme valeur initiale
   * au montage du panneau). */
  seed?: string;
  /** Handle listFindMatches — occurrences avec contexte. */
  onListMatches: (query: string, options: FindReplaceOptions) => FindMatchResult[];
  /** Handle selectMatch — sélectionne une occurrence et y défile. */
  onSelectMatch: (from: number, to: number) => void;
  /** Handle listHeadings — titres du document (onglet « Titres »). */
  onListHeadings: () => HeadingEntry[];
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
  const [query, setQuery] = useState(seed);
  const [replacement, setReplacement] = useState("");
  const [matchCase, setMatchCase] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [matches, setMatches] = useState<FindMatchResult[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [tab, setTab] = useState<PanelTab>("resultats");
  const [headings, setHeadings] = useState<HeadingEntry[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const options: FindReplaceOptions = { matchCase, wholeWord };

  /** (Re)lance la recherche : à chaque frappe/option, comme Word —
   * sélectionne automatiquement la PREMIÈRE occurrence. */
  const refresh = (q: string, opts: FindReplaceOptions, jump = true) => {
    if (!q) {
      setMatches([]);
      setActiveIndex(0);
      return;
    }
    const list = onListMatches(q, opts);
    setMatches(list);
    setActiveIndex(0);
    if (jump && list.length > 0) {
      onSelectMatch(list[0].from, list[0].to);
    }
  };

  // Requête venant de la recherche rapide de la barre de titre.
  useEffect(() => {
    setQuery(seed);
    refresh(seed, options);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed]);

  // Recherche en direct à chaque changement de texte/options.
  useEffect(() => {
    refresh(query, options);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, matchCase, wholeWord]);

  // Titres : chargés à l'ouverture de l'onglet.
  useEffect(() => {
    if (tab === "titres") setHeadings(onListHeadings());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  /** Occurrence suivante/précédente (Entrée / Maj+Entrée, ou boutons) —
   * en boucle, comme Word. */
  const goto = (delta: 1 | -1) => {
    if (!matches.length) return;
    const next = (activeIndex + delta + matches.length) % matches.length;
    setActiveIndex(next);
    onSelectMatch(matches[next].from, matches[next].to);
    // Fait défiler la liste du panneau sur l'élément actif.
    listRef.current?.querySelectorAll(".fr-result")[next]?.scrollIntoView({ block: "nearest" });
  };

  const gotoMatch = (index: number) => {
    setActiveIndex(index);
    onSelectMatch(matches[index].from, matches[index].to);
  };

  const gotoHeading = (h: HeadingEntry) => {
    // Curseur au début du titre (position + 1 = début du contenu).
    onSelectMatch(h.pos + 1, h.pos + 1);
  };

  const replaceOne = () => {
    if (!query) return;
    const r = onReplaceCurrent(query, options, replacement);
    if (r === null) {
      // Rien de remplaçable sous le curseur : avancer vers l'occurrence.
      if (matches.length) goto(1);
      return;
    }
    // Liste rafraîchie (le remplacement a changé les occurrences) puis
    // l'occurrence active (déjà sélectionnée par replaceCurrent) est
    // retrouvée dans la nouvelle liste.
    const list = onListMatches(query, options);
    setMatches(list);
    const idx = list.findIndex((m) => m.from >= (matches[activeIndex]?.from ?? 0));
    setActiveIndex(idx === -1 ? 0 : idx);
    setMessage(null);
  };

  const replaceEverything = () => {
    if (!query) return;
    const count = onReplaceAll(query, options, replacement);
    const list = onListMatches(query, options);
    setMatches(list);
    setActiveIndex(0);
    setMessage(
      count > 0
        ? `${count} remplacement${count > 1 ? "s" : ""} effectué${count > 1 ? "s" : ""}`
        : "Aucune occurrence",
    );
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
              setMatches([]);
              setActiveIndex(0);
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
        {/* Champ pleine largeur + bouton ✕, comme Word. */}
        <div className="fr-search-box">
          <input
            ref={inputRef}
            className="fr-input fr-input-search"
            type="text"
            placeholder="Rechercher dans le document…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                goto(e.shiftKey ? -1 : 1);
              }
              if (e.key === "Escape") {
                e.preventDefault();
                onClose();
              }
            }}
          />
          {query && (
            <button
              type="button"
              className="fr-clear-btn"
              title="Effacer la recherche"
              onClick={() => {
                setQuery("");
                inputRef.current?.focus();
              }}
            >
              ✕
            </button>
          )}
        </div>

        <div className="fr-row fr-row-nav">
          <span className="fr-results-label">
            {query ? (matches.length > 0 ? `${matches.length} résultat${matches.length > 1 ? "s" : ""}` : "Aucun résultat") : ""}
          </span>
          <span className="fr-nav-spacer" />
          <span
            className={`fr-counter${matches.length === 0 && query ? " fr-counter-none" : ""}`}
            title={matches.length ? `Occurrence ${activeIndex + 1} sur ${matches.length}` : "Occurrences"}
          >
            {matches.length ? `${activeIndex + 1}/${matches.length}` : query ? "0/0" : ""}
          </span>
          <button type="button" className="fr-nav-btn" title="Occurrence précédente (Maj+Entrée)" onClick={() => goto(-1)} disabled={!matches.length}>
            ‹
          </button>
          <button type="button" className="fr-nav-btn" title="Occurrence suivante (Entrée)" onClick={() => goto(1)} disabled={!matches.length}>
            ›
          </button>
        </div>

        {/* Onglets façon volet Word : Résultats (occurrences avec
         * contexte) / Titres (plan du document). */}
        <div className="fr-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "resultats"}
            className={`fr-tab${tab === "resultats" ? " fr-tab-active" : ""}`}
            onClick={() => setTab("resultats")}
          >
            Résultats
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "titres"}
            className={`fr-tab${tab === "titres" ? " fr-tab-active" : ""}`}
            onClick={() => setTab("titres")}
          >
            Titres
          </button>
        </div>

        <div className="fr-list" ref={listRef}>
          {tab === "resultats" &&
            (matches.length === 0 ? (
              <p className="fr-empty">{query ? "Aucune occurrence trouvée." : "Tapez une recherche pour voir les occurrences du document."}</p>
            ) : (
              matches.map((m, i) => (
                <button
                  key={`${m.from}-${i}`}
                  type="button"
                  className={`fr-result${i === activeIndex ? " fr-result-active" : ""}`}
                  onClick={() => gotoMatch(i)}
                  title={`Aller à l'occurrence ${i + 1}`}
                >
                  <span className="fr-result-text">
                    {m.before && <span className="fr-result-ctx">…{m.before} </span>}
                    <strong className="fr-result-match">{m.match}</strong>
                    {m.after && <span className="fr-result-ctx"> {m.after}…</span>}
                  </span>
                </button>
              ))
            ))}
          {tab === "titres" &&
            (headings.length === 0 ? (
              <p className="fr-empty">Ce document ne contient aucun titre.</p>
            ) : (
              headings.map((h, i) => (
                <button
                  key={`${h.pos}-${i}`}
                  type="button"
                  className="fr-result fr-heading"
                  style={{ paddingLeft: 8 + (h.level - 1) * 12 }}
                  onClick={() => gotoHeading(h)}
                  title={`Aller au titre ${h.text}`}
                >
                  <span className="fr-result-text">{h.text || "(sans titre)"}</span>
                </button>
              ))
            ))}
        </div>

        {/* Remplacement (conservé, comme demandé). */}
        <div className="fr-replace">
          <input
            className="fr-input"
            type="text"
            placeholder="Remplacer par…"
            value={replacement}
            onChange={(e) => setReplacement(e.target.value)}
          />
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
          <div className="fr-actions">
            <button type="button" className="fr-btn" onClick={replaceOne} disabled={!query || !matches.length}>
              Remplacer
            </button>
            <button type="button" className="fr-btn fr-btn-primary" onClick={replaceEverything} disabled={!query || !matches.length}>
              Tout remplacer
            </button>
          </div>
          {message && <p className="fr-message">{message}</p>}
        </div>
      </div>
    </div>
  );
}
