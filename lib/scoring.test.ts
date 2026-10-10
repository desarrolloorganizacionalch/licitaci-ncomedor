import { test } from "node:test";
import assert from "node:assert/strict";
import { aggregate, csvCell, isComplete, todayInLima, tone, totalScore } from "./scoring.ts";

test("totalScore suma solo puntajes válidos", () => {
  assert.equal(totalScore([10, 10, 10, 10, 10, 10]), 60);
  assert.equal(totalScore([10, 5, 0, undefined, null, 5]), 20);
  assert.equal(totalScore([]), 0);
});

test("isComplete exige los 6 criterios", () => {
  const ids = [1, 2, 3, 4, 5, 6];
  assert.equal(isComplete({ 1: 10, 2: 5, 3: 0, 4: 10, 5: 5 }, ids), false);
  assert.equal(isComplete({ 1: 10, 2: 5, 3: 0, 4: 10, 5: 5, 6: 0 }, ids), true);
});

test("tone clasifica por proporción", () => {
  assert.equal(tone(48, 60), "alto");
  assert.equal(tone(30, 60), "medio");
  assert.equal(tone(25, 60), "bajo");
});

test("aggregate promedia, ordena y rankea con empates", () => {
  const sup = (id: string, sort_order: number) => ({ id, name: id, active: true, sort_order });
  const suppliers = [sup("A", 1), sup("B", 2), sup("C", 3), sup("D", 4)];
  const criteria = [1, 2, 3, 4, 5, 6].map((id) => ({ id }));
  const ev = (supplier_id: string, scores: (0 | 5 | 10)[]) => ({
    supplier_id,
    total_score: scores.reduce<number>((a, b) => a + b, 0),
    evaluation_answers: scores.map((score, i) => ({ criterion_id: i + 1, score, observation: null })),
  });
  const stats = aggregate(suppliers, criteria, [
    ev("A", [10, 10, 5, 5, 0, 0]), // 30
    ev("A", [10, 10, 10, 10, 10, 0]), // 50
    ev("B", [10, 10, 10, 10, 0, 0]), // 40
    ev("C", [10, 10, 10, 10, 10, 10]), // 60
  ]);
  assert.deepEqual(stats.map((s) => s.supplier.id), ["C", "A", "B", "D"]);
  assert.deepEqual(stats.map((s) => s.rank), [1, 2, 2, null]);
  const a = stats[1];
  assert.equal(a.avg, 40);
  assert.equal(a.min, 30);
  assert.equal(a.max, 50);
  assert.equal(a.criteria[2].avg, 7.5);
  assert.deepEqual(a.criteria[5].counts, { bueno: 0, regular: 0, malo: 2 });
  assert.deepEqual(a.counts, { bueno: 7, regular: 2, malo: 3 });
  assert.equal(stats[3].count, 0);
  assert.equal(stats[3].avg, null);
});

test("todayInLima usa la zona horaria de Lima", () => {
  // 03:00 UTC del 11-oct es todavía 10-oct en Lima (UTC-5).
  assert.equal(todayInLima(new Date("2026-10-11T03:00:00Z")), "2026-10-10");
});

test("csvCell escapa separadores y fórmulas", () => {
  assert.equal(csvCell("hola"), "hola");
  assert.equal(csvCell('a;b"c'), '"a;b""c"');
  assert.equal(csvCell("=HYPERLINK(1)"), "'=HYPERLINK(1)");
  assert.equal(csvCell(null), "");
});
