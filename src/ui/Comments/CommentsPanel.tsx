/**
 * Panneau « Commentaires » (format .xmd, roadmap 5.2 — modèle adapté de
 * CasualOffice : cartes de commentaires avec fils de réponses et
 * résolution) : liste des commentaires du document, du plus récent au plus
 * ancien ; « Commenter la sélection » crée un commentaire sur le texte
 * sélectionné (surlignage jaune dans le document, contenu dans
 * `comments.json` du conteneur) ; chaque carte permet de répondre, résoudre,
 * supprimer, et de SAUTER au passage surligné. Les commentaires résolus
 * restent visibles (barrés) jusqu'à leur suppression.
 */
import { useState } from "react";
import { PanelHeader } from "../ContextualPanels/PanelHeader";
import { IconTrash } from "../Toolbar/icons";
import type { DocComment } from "../../core/xmd/comments";
import "./CommentsPanel.css";

/** Date affichée : « 27/10/2026 14:05 ». */
function formatDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function CommentsPanel({
  comments,
  onAdd,
  onReply,
  onToggleResolve,
  onDelete,
  onJump,
  onClose,
}: {
  comments: DocComment[];
  /** Crée un commentaire sur la sélection courante (rien si sélection vide). */
  onAdd: () => void;
  onReply: (id: string, text: string) => void;
  onToggleResolve: (id: string) => void;
  onDelete: (id: string) => void;
  /** Sélectionne le passage surligné et l'amène à l'écran. */
  onJump: (id: string) => void;
  onClose: () => void;
}) {
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");

  const active = comments.filter((c) => !c.resolved);
  const resolved = comments.filter((c) => c.resolved);

  const submitReply = (id: string) => {
    const text = replyText.trim();
    if (!text) return;
    onReply(id, text);
    setReplyTo(null);
    setReplyText("");
  };

  return (
    <div className="cm-panel">
      <PanelHeader
        title="Commentaires"
        chip={active.length > 0 ? `${active.length}` : "—"}
        onClose={onClose}
        closeTitle="Fermer le panneau"
      />
      <div className="cm-body">
        <button type="button" className="cm-add" title="Sélectionnez du texte dans le document, puis cliquez" onClick={() => onAdd()}>
          ＋ Commenter la sélection
        </button>

        {active.length === 0 && resolved.length === 0 && (
          <p className="cm-empty">Aucun commentaire. Sélectionnez un passage du texte puis « Commenter la sélection ».</p>
        )}

        {[...active].reverse().map((c) => (
          <article key={c.id} className="cm-card">
            <div className="cm-card-head">
              <span className="cm-author">{c.author || "Anonyme"}</span>
              <span className="cm-date">{formatDate(c.createdAt)}</span>
            </div>
            <p className="cm-text">{c.text}</p>
            {c.quote && (
              <button type="button" className="cm-quote" title="Aller au passage surligné" onClick={() => onJump(c.id)}>
                « {c.quote.length > 90 ? `${c.quote.slice(0, 90)}…` : c.quote} »
              </button>
            )}
            {c.replies.map((r) => (
              <div key={r.id} className="cm-reply">
                <span className="cm-author">{r.author || "Anonyme"}</span>
                <p className="cm-text">{r.text}</p>
              </div>
            ))}
            {replyTo === c.id ? (
              <div className="cm-reply-form">
                <input
                  type="text"
                  className="cm-reply-input"
                  autoFocus
                  value={replyText}
                  placeholder="Votre réponse…"
                  onChange={(e) => setReplyText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") submitReply(c.id);
                    if (e.key === "Escape") setReplyTo(null);
                  }}
                />
                <button type="button" className="cm-reply-ok" onClick={() => submitReply(c.id)}>
                  Répondre
                </button>
              </div>
            ) : (
              <div className="cm-actions">
                <button type="button" className="cm-action" onClick={() => setReplyTo(c.id)}>
                  Répondre
                </button>
                <button type="button" className="cm-action" onClick={() => onToggleResolve(c.id)}>
                  Résoudre
                </button>
                <button type="button" className="cm-action cm-danger" onClick={() => onDelete(c.id)}>
                  Supprimer
                </button>
              </div>
            )}
          </article>
        ))}

        {resolved.length > 0 && (
          <div className="cm-resolved">
            <p className="cm-resolved-title">Résolus ({resolved.length})</p>
            {resolved.map((c) => (
              <article key={c.id} className="cm-card cm-card-resolved">
                <div className="cm-card-head">
                  <span className="cm-author">{c.author || "Anonyme"}</span>
                  <span className="cm-date">{formatDate(c.createdAt)}</span>
                </div>
                <p className="cm-text">{c.text}</p>
                <div className="cm-actions">
                  <button type="button" className="cm-action" onClick={() => onJump(c.id)}>
                    Voir
                  </button>
                  <button type="button" className="cm-action" onClick={() => onToggleResolve(c.id)}>
                    Rouvrir
                  </button>
                  <button type="button" className="cm-action cm-danger" onClick={() => onDelete(c.id)}>
                    <IconTrash size={13} />
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
