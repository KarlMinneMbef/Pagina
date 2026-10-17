import { useEffect, useRef, useState } from "react";

/** Caractères interdits dans un nom de fichier/dossier Windows. */
const INVALID_CHARS = /[\\/:*?"<>|]/;

/**
 * Boîte de dialogue inline (pas de window.prompt, qui échoue silencieusement
 * dans WebView2) pour créer ou renommer un fichier/dossier. Valide le nom :
 * vide interdit, caractères invalides refusés avec un message explicite.
 */
export function NameDialog({
  title,
  initialName,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  title: string;
  initialName: string;
  submitLabel: string;
  onSubmit: (name: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initialName);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const el = inputRef.current;
    if (el) {
      el.focus();
      el.select();
    }
  }, []);

  const submit = () => {
    const n = name.trim();
    if (!n) {
      setError("Le nom ne peut pas être vide.");
      return;
    }
    if (INVALID_CHARS.test(n)) {
      setError("Caractères interdits dans un nom de fichier : \\ / : * ? \" < > |");
      return;
    }
    onSubmit(n);
  };

  return (
    <div
      className="fx-dialog-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        className="fx-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.stopPropagation();
            onCancel();
          } else if (e.key === "Enter") {
            e.preventDefault();
            submit();
          }
        }}
      >
        <div className="fx-dialog-title">{title}</div>
        <input
          ref={inputRef}
          className="fx-dialog-input"
          aria-label="Nom"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setError(null);
          }}
        />
        {error && (
          <div className="fx-dialog-error" role="alert">
            {error}
          </div>
        )}
        <div className="fx-dialog-actions">
          <button className="fx-dialog-btn fx-dialog-cancel" onClick={onCancel}>
            Annuler
          </button>
          <button className="fx-dialog-btn fx-dialog-submit" onClick={submit}>
            {submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
