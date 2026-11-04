import { addDays } from "./finance";
import { validReportRange } from "./report-export";
export interface UsageTransaction {
  created_at: string;
  created_by: string | null;
  status: string;
  paid_date: string | null;
  kind: string;
}
export function usageDay(timestamp: string) {
  if (Number.isNaN(Date.parse(timestamp))) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(timestamp));
}
export function usageAnalytics(
  profiles: { created_at: string }[],
  transactions: UsageTransaction[],
  start: string,
  end: string,
) {
  if (!validReportRange(start, end) || (Date.parse(end) - Date.parse(start)) / 86400000 > 365)
    return null;
  const days: { day: string; registrations: number; launches: number; settled: number }[] = [];
  for (let day = start; day <= end; day = addDays(day, 1))
    days.push({ day, registrations: 0, launches: 0, settled: 0 });
  const map = new Map(days.map((d) => [d.day, d]));
  const active = new Set<string>();
  let incoming = 0,
    outgoing = 0;
  for (const profile of profiles) {
    const d = map.get(usageDay(profile.created_at));
    if (d) d.registrations++;
  }
  for (const t of transactions) {
    const created = map.get(usageDay(t.created_at));
    if (created) {
      created.launches++;
      if (t.created_by) active.add(t.created_by);
      if (t.kind === "entrada") incoming++;
      else outgoing++;
    }
    const settled = t.status === "pago" && t.paid_date ? map.get(t.paid_date) : undefined;
    if (settled) settled.settled++;
  }
  return {
    days,
    registrations: days.reduce((n, d) => n + d.registrations, 0),
    launches: incoming + outgoing,
    incoming,
    outgoing,
    settled: days.reduce((n, d) => n + d.settled, 0),
    activeCreators: active.size,
    daysWithActivity: days.filter((d) => d.registrations || d.launches || d.settled).length,
    missingPaidDates: transactions.filter((t) => t.status === "pago" && !t.paid_date).length,
  };
}
