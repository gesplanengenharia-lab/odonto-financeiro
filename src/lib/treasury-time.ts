/**
 * Calendário financeiro padronizado no mesmo fuso empregado pelo PostgreSQL.
 * Nunca dependa do fuso local do navegador em validações de datas da Tesouraria.
 */
export function treasuryTodayISO(now: Date = new Date()): string {
  if (!Number.isFinite(now.getTime())) throw new Error("Instante inválido.");
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const y = parts.find((part) => part.type === "year")?.value;
  const m = parts.find((part) => part.type === "month")?.value;
  const d = parts.find((part) => part.type === "day")?.value;
  if (!y || !m || !d) throw new Error("Não foi possível determinar a data da Tesouraria.");
  return `${y}-${m}-${d}`;
}
