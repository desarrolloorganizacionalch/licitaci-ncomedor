import type { Answer, Criterion, Evaluation, Score, Supplier } from "./types.ts";

export const MAX_SCORE = 60;
export const CRITERIA_COUNT = 6;

export const SCALE = [
  { value: 10, key: "bueno", label: "Bueno" },
  { value: 5, key: "regular", label: "Regular" },
  { value: 0, key: "malo", label: "Malo" },
] as const satisfies ReadonlyArray<{ value: Score; key: string; label: string }>;

export type ScaleKey = (typeof SCALE)[number]["key"];

export function isScore(v: unknown): v is Score {
  return v === 0 || v === 5 || v === 10;
}

export function scaleOf(score: Score) {
  return SCALE.find((s) => s.value === score)!;
}

/** Suma de los puntajes ya respondidos (los criterios vacíos no suman). */
export function totalScore(scores: ReadonlyArray<Score | null | undefined>): number {
  return scores.reduce<number>((acc, s) => acc + (isScore(s) ? s : 0), 0);
}

export function isComplete(scores: Record<number, Score | undefined>, criteriaIds: number[]): boolean {
  return criteriaIds.length === CRITERIA_COUNT && criteriaIds.every((id) => isScore(scores[id]));
}

/** Tono de referencia para colorear un puntaje (proporción sobre el máximo). */
export function tone(value: number, max: number): "alto" | "medio" | "bajo" {
  const r = max === 0 ? 0 : value / max;
  if (r >= 0.8) return "alto";
  if (r >= 0.5) return "medio";
  return "bajo";
}

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function formatScore(n: number | null): string {
  if (n === null || Number.isNaN(n)) return "—";
  return round1(n).toLocaleString("es-PE", { maximumFractionDigits: 1 });
}

export interface CriterionStats {
  criterionId: number;
  avg: number | null;
  counts: Record<ScaleKey, number>;
}

export interface SupplierStats {
  supplier: Supplier;
  count: number;
  avg: number | null;
  min: number | null;
  max: number | null;
  criteria: CriterionStats[];
  counts: Record<ScaleKey, number>;
  rank: number | null;
}

const emptyCounts = (): Record<ScaleKey, number> => ({ bueno: 0, regular: 0, malo: 0 });

/**
 * Consolida las fichas por postor: promedio sobre 60, rango, promedio por
 * criterio sobre 10 y distribución Bueno/Regular/Malo. Ordena por promedio.
 */
export function aggregate(
  suppliers: Supplier[],
  criteria: Pick<Criterion, "id">[],
  evaluations: Pick<Evaluation, "supplier_id" | "total_score" | "evaluation_answers">[],
): SupplierStats[] {
  const stats = suppliers.map<SupplierStats>((supplier) => {
    const evs = evaluations.filter((e) => e.supplier_id === supplier.id);
    const totals = evs.map((e) => e.total_score);
    const counts = emptyCounts();
    const perCriterion = criteria.map<CriterionStats>((c) => {
      const answers = evs
        .flatMap((e) => e.evaluation_answers ?? [])
        .filter((a: Answer) => a.criterion_id === c.id && isScore(a.score));
      const cc = emptyCounts();
      for (const a of answers) {
        cc[scaleOf(a.score).key]++;
        counts[scaleOf(a.score).key]++;
      }
      return {
        criterionId: c.id,
        avg: answers.length ? answers.reduce((s, a) => s + a.score, 0) / answers.length : null,
        counts: cc,
      };
    });
    return {
      supplier,
      count: evs.length,
      avg: totals.length ? totals.reduce((a, b) => a + b, 0) / totals.length : null,
      min: totals.length ? Math.min(...totals) : null,
      max: totals.length ? Math.max(...totals) : null,
      criteria: perCriterion,
      counts,
      rank: null,
    };
  });

  stats.sort((a, b) => {
    if (a.avg === null && b.avg === null) return a.supplier.sort_order - b.supplier.sort_order;
    if (a.avg === null) return 1;
    if (b.avg === null) return -1;
    return b.avg - a.avg || b.count - a.count || a.supplier.sort_order - b.supplier.sort_order;
  });

  // Ranking de competición: empates comparten puesto (1, 1, 3).
  let prev: number | null = null;
  let prevRank = 0;
  stats.forEach((s, i) => {
    if (s.avg === null) return;
    const r = prev !== null && round1(s.avg) === round1(prev) ? prevRank : i + 1;
    s.rank = r;
    prev = s.avg;
    prevRank = r;
  });

  return stats;
}

/** Fecha actual en Lima (YYYY-MM-DD), coherente con la validación del servidor. */
export function todayInLima(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function formatDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("es-PE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** Escapa un valor para CSV (separador ;, compatible con Excel en español). */
export function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s; // evita inyección de fórmulas
  return /[";\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}
