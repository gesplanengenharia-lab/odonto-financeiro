import { useSyncExternalStore } from "react";
import { monthKey, todayISO } from "@/lib/finance";

const key = "essencial-financial-month";
const event = "essencial-financial-month-change";
let fallback: string | undefined;
const valid = (value: string | null): value is string => !!value && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
function snapshot() {
  try {
    const saved = window.sessionStorage.getItem(key);
    return valid(saved) ? saved : monthKey(todayISO());
  } catch {
    return fallback ?? monthKey(todayISO());
  }
}
function subscribe(callback: () => void) {
  window.addEventListener(event, callback);
  return () => window.removeEventListener(event, callback);
}
function setMonth(value: string) {
  if (!valid(value)) return;
  fallback = value;
  try { window.sessionStorage.setItem(key, value); } catch { /* Session preference remains in memory. */ }
  window.dispatchEvent(new Event(event));
}
/** Only the viewing period is remembered; financial records stay in the database. */
export function useFinancialMonth() {
  const month = useSyncExternalStore(subscribe, snapshot, () => monthKey(todayISO()));
  return [month, setMonth] as const;
}
