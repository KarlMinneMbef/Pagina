/**
 * Hôte des dialogues de saisie (voir `promptStore.ts`) — à monter UNE fois à la racine de l'application.
 * Entrée valide, Échap annule, un clic sur le fond annule ; le premier champ est sélectionné à l'ouverture.
 */
import { useEffect, useRef, useState } from "react";
import { usePromptStore, type PromptRequest } from "./promptStore";
import "./PromptDialog.css";

function PromptDialog({ request }: { request: PromptRequest }) {
  const close = usePromptStore((s) => s.close);
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(request.fields.map((f) => [f.key, f.initial ?? ""])),
  );
  const [error, setError] = useState<string | null>(null);
  const firstRef = useRef<HTMLInputElement | null>(null);
  const okRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    // Premier champ sélectionné ; sans champ (confirmation), le bouton principal prend le focus (Entrée valide).
    if (firstRef.current) {
      firstRef.current.focus();
      firstRef.current.select();
    } else {
      okRef.current?.focus();
    }
  }, []);

  const finish = (result: Record<string, string> | null) => {
    close();
    request.resolve(result);
  };

  const submit = () => {
    const message = request.validate?.(values) ?? null;
    if (message) {
      setError(message);
      return;
    }
    finish(values);
  };

  return (
    <div
      className="pd-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) finish(null);
      }}
    >
      <div
        className="pd-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={request.title}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.stopPropagation();
            finish(null);
          } else if (e.key === "Enter") {
            e.preventDefault();
            submit();
          }
        }}
      >
        <div className="pd-title">{request.title}</div>
        {request.message && <p className="pd-message">{request.message}</p>}
        {request.fields.map((f, i) => {
          const listId = f.suggestions && f.suggestions.length > 0 ? `pd-list-${f.key}` : undefined;
          return (
            <label key={f.key} className="pd-field">
              <span>{f.label}</span>
              <input
                ref={i === 0 ? firstRef : undefined}
                type="text"
                className="pd-input"
                value={values[f.key]}
                placeholder={f.placeholder}
                list={listId}
                onChange={(e) => {
                  setValues((v) => ({ ...v, [f.key]: e.target.value }));
                  setError(null);
                }}
              />
              {listId && (
                <datalist id={listId}>
                  {f.suggestions!.map((s) => (
                    <option key={s} value={s} />
                  ))}
                </datalist>
              )}
            </label>
          );
        })}
        {error && (
          <div className="pd-error" role="alert">
            {error}
          </div>
        )}
        <div className="pd-actions">
          <button type="button" className="pd-btn" onClick={() => finish(null)}>
            Annuler
          </button>
          <button ref={okRef} type="button" className="pd-btn pd-btn-primary" onClick={submit}>
            {request.okLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function PromptHost() {
  const request = usePromptStore((s) => s.request);
  return request ? <PromptDialog key={request.title + request.fields.map((f) => f.key).join()} request={request} /> : null;
}
