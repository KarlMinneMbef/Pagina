/**
 * Champ numérique à saisie libre (virgule OU point, décimales, vide momentané) — remplace les
 * `<input value={String(n)} onChange={n = parse(texte)}>` du projet : ce schéma réécrit la
 * valeur à CHAQUE frappe, donc « 1, » ou « 1. » redevenait « 1 » et la virgule était impossible
 * à taper (bug du 2026-10-26, fenêtre Paragraphe). Ici le TEXTE tapé est conservé tel quel
 * pendant la saisie ; la valeur est transmise dès qu'il forme un nombre valide ; au retrait du
 * focus, le texte est remis au format de la valeur retenue (virgule décimale).
 */
import { useEffect, useRef, useState } from "react";

const fmt = (v: number | null): string => (v === null ? "" : String(v).replace(".", ","));

/** Nombre contenu dans un texte saisi (« 1,5 », « 1.5 », « -2 »), ou null si incomplet/invalide. */
export function parseNumberText(text: string): number | null {
  const t = text.trim().replace(",", ".");
  if (!/^-?(\d+\.?\d*|\.\d+)$/.test(t)) return null;
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : null;
}

export function NumberField({
  value,
  onCommit,
  min = 0,
  max = Number.POSITIVE_INFINITY,
  decimals = 2,
  allowEmpty = false,
  className,
  title,
  disabled,
  placeholder,
}: {
  value: number | null;
  /** Reçoit la valeur (bornée et arrondie) dès que la saisie est un nombre valide ; `null` si
   *  le champ est vidé et que `allowEmpty` est vrai. */
  onCommit: (value: number | null) => void;
  min?: number;
  max?: number;
  /** Nombre maximal de décimales conservées. */
  decimals?: number;
  allowEmpty?: boolean;
  className?: string;
  title?: string;
  disabled?: boolean;
  placeholder?: string;
}) {
  const [text, setText] = useState(fmt(value));
  // Dernière valeur transmise : un changement venu de l'EXTÉRIEUR (autre réglage, annulation)
  // remplace le texte ; l'écho de notre propre saisie ne le touche pas.
  const last = useRef<number | null>(value);
  useEffect(() => {
    if (value !== last.current) {
      last.current = value;
      setText(fmt(value));
    }
  }, [value]);

  const clamp = (n: number) => {
    const f = 10 ** decimals;
    return Math.round(Math.min(Math.max(n, min), max) * f) / f;
  };

  return (
    <input
      type="text"
      inputMode="decimal"
      className={className}
      title={title}
      disabled={disabled}
      placeholder={placeholder}
      value={text}
      onChange={(e) => {
        const raw = e.target.value;
        setText(raw);
        if (raw.trim() === "") {
          if (allowEmpty) {
            last.current = null;
            onCommit(null);
          }
          return;
        }
        const n = parseNumberText(raw);
        if (n === null) return; // saisie en cours (« 1, », « - ») : on attend la suite
        const v = clamp(n);
        last.current = v;
        onCommit(v);
      }}
      onBlur={() => setText(fmt(last.current))}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
    />
  );
}
