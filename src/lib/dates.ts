/**
 * Utilidades de data puras (sem Node), para poder ser importadas tanto pelos
 * route handlers quanto pelos client components. `@/lib/nasa` usa `node:fs` e
 * não é importável no browser.
 */

/** Primeira data disponível no APOD, confirmada pela mensagem de erro da própria API. */
export const APOD_FIRST_DATE = "1995-06-16";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: string): boolean {
  return ISO_DATE.test(value);
}

export function todayIso(at: Date = new Date()): string {
  const y = at.getFullYear();
  const m = String(at.getMonth() + 1).padStart(2, "0");
  const d = String(at.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Desloca uma data ISO em dias, sem depender de fuso horário. */
export function shiftDays(iso: string, days: number): string {
  const [y = 1970, m = 1, d = 1] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

export function clampIso(iso: string, min: string, max: string): string {
  if (iso < min) return min;
  if (iso > max) return max;
  return iso;
}
