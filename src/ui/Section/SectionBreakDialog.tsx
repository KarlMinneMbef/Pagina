/**
 * Fenêtre « Saut de section » (2026-10-22) — insère le marqueur de section
 * (SectionBreak.ts) : titre de la nouvelle section + reprise de la
 * numérotation des titres à « 1. » (comme Word). Même châssis compact que
 * les autres dialogues de l'app (overlay, barre de titre sapin, actions).
 */
import { useState } from "react";
import "./SectionBreakDialog.css";

/** Fenêtre Saut de section : titre + reprise de numérotation. */
export function SectionBreakDialog({ onApply, onClose }: { onApply: (attrs: { title: string; restart: boolean }) => void; onClose: () => void }) {
  const [title, setTitle] = useState("");
  const [restart, setRestart] = useState(true);

  return (
    <div className="sbk-overlay" onMouseDown={onClose}>
      <div className="sbk-dialog" onMouseDown={(e) => e.stopPropagation()}>
        <div className="sbk-header">
          <span>Saut de section</span>
          <button className="sbk-close" onClick={onClose} title="Fermer">
            ✕
          </button>
        </div>
        <div className="sbk-body">
          <p className="sbk-note">
            La section commence à cet endroit (la précédente se termine) : numérotation des titres et sommaire dédiés, comme un sous-document.
          </p>
          <label className="sbk-field">
            <span>Titre de la section :</span>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex. CCTP — Lot 2 CVC"
              autoFocus
            />
          </label>
          <label className="sbk-check">
            <input type="checkbox" checked={restart} onChange={(e) => setRestart(e.target.checked)} />
            Reprendre la numérotation des titres à « 1. »
          </label>
        </div>
        <div className="sbk-actions">
          <span className="sbk-actions-spacer" />
          <button
            className="sbk-btn sbk-btn-primary"
            onClick={() => {
              onApply({ title: title.trim(), restart });
              onClose();
            }}
          >
            Insérer
          </button>
          <button className="sbk-btn" onClick={onClose}>
            Annuler
          </button>
        </div>
      </div>
    </div>
  );
}
