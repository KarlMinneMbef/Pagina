/**
 * Boîte de dialogue de confirmation React (pas de window.confirm, qui échoue
 * silencieusement dans WebView2) — utilisée pour la suppression dans
 * l'explorateur, avec avertissement renforcé si l'onglet est modifié.
 */
export function ConfirmDialog({
  title,
  message,
  confirmLabel = "Supprimer",
  onConfirm,
  onCancel,
}: {
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      className="fx-dialog-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        className="fx-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.stopPropagation();
            onCancel();
          }
        }}
      >
        <div className="fx-dialog-title">{title}</div>
        <div className="fx-dialog-message">{message}</div>
        <div className="fx-dialog-actions">
          <button className="fx-dialog-btn fx-dialog-cancel" onClick={onCancel}>
            Annuler
          </button>
          <button className="fx-dialog-btn fx-dialog-danger" onClick={onConfirm} autoFocus>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
