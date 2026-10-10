import Link from "next/link";
import { AdminFrame } from "@/components/AdminFrame";
import { loadPanelData, requireAdminKey } from "@/lib/admin";
import { ActionForm } from "@/components/ActionForm";
import { aggregate, formatDate, formatScore, MAX_SCORE, round1, scaleOf, tone } from "@/lib/scoring";
import { deleteAllEvaluations, deleteEvaluation } from "./actions";

export const metadata = { title: "Panel comparativo" };
export const dynamic = "force-dynamic";

function heatLevel(avg: number | null) {
  if (avg === null) return 0;
  if (avg >= 9) return 5;
  if (avg >= 7.5) return 4;
  if (avg >= 6) return 3;
  if (avg >= 4) return 2;
  return 1;
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("es-PE", {
    timeZone: "America/Lima",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ postor?: string; criterio?: string }>;
}) {
  const { postor: fSupplier = "", criterio: fCriterion = "" } = await searchParams;
  const key = await requireAdminKey();
  const { error, suppliers, criteria, evaluations } = await loadPanelData(key);

  const stats = aggregate(suppliers, criteria, evaluations);
  const observations = evaluations
    .filter((e) => !fSupplier || e.supplier_id === fSupplier)
    .flatMap((e) =>
      (e.evaluation_answers ?? [])
        .filter((a) => a.observation?.trim() && (!fCriterion || String(a.criterion_id) === fCriterion))
        .map((a) => ({
          evaluationId: e.id,
          criterionId: a.criterion_id,
          score: a.score,
          text: a.observation!.trim(),
          evaluator: e.evaluator_name,
          visitDate: e.visit_date,
          supplier: suppliers.find((s) => s.id === e.supplier_id)?.name ?? "—",
          criterion: criteria.find((c) => c.id === a.criterion_id)?.title ?? `Criterio ${a.criterion_id}`,
        })),
    );
  const evaluated = stats.filter((s) => s.count > 0);

  const overall = evaluations.length
    ? evaluations.reduce((a, e) => a + e.total_score, 0) / evaluations.length
    : null;
  const leader = evaluated[0];
  const activeSuppliers = suppliers.filter((s) => s.active);
  // Los evaluadores se identifican por su nombre (sin cuenta).
  const evaluators = [...new Map(evaluations.map((e) => [e.evaluator_key ?? e.evaluator_name.toLowerCase(), e.evaluator_name])).entries()]
    .map(([key, name]) => ({ key, name }))
    .sort((a, b) => a.name.localeCompare(b.name, "es"));
  const keyOf = (e: (typeof evaluations)[number]) => e.evaluator_key ?? e.evaluator_name.toLowerCase();

  return (
    <AdminFrame
      eyebrow="Licitación · Servicio de alimentación"
      title="Comparativo de"
      accent="Postores"
      intro={`Promedio de las fichas de visita del comité, sobre ${MAX_SCORE} puntos.`}
      actions={
        <>
          <a className="btn btn-outline btn-sm" href="#observaciones">
            Observaciones
          </a>
          <a className="btn btn-outline btn-sm" href="#fichas">
            Fichas y eliminar
          </a>
          <a className="btn btn-outline btn-sm" href="/admin/exportar">
            Descargar CSV
          </a>
        </>
      }
    >
      {error && (
        <div className="alert alert-error" role="alert">
          No se pudieron cargar todos los datos: {error.message}
        </div>
      )}

      <section className="kpis" aria-label="Indicadores generales">
        <div className="card card--navy kpi">
          <p className="label-caps">Fichas recibidas</p>
          <p className="kpi__value">{evaluations.length}</p>
          <p className="kpi__hint">{activeSuppliers.length} postores habilitados</p>
        </div>
        <div className="card card--blue kpi">
          <p className="label-caps">Promedio general</p>
          <p className="kpi__value">
            {formatScore(overall)}
            <small>/ {MAX_SCORE}</small>
          </p>
          <p className="kpi__hint">Todas las fichas</p>
        </div>
        <div className="card kpi">
          <p className="label-caps">Evaluadores</p>
          <p className="kpi__value">{evaluators.length}</p>
          <p className="kpi__hint">Con al menos una ficha</p>
        </div>
        <div className="card kpi">
          <p className="label-caps">Mejor puntaje</p>
          <p className="kpi__value is-red" style={{ fontSize: leader ? 24 : 34, marginTop: leader ? 12 : 6 }}>
            {leader ? leader.supplier.name : "—"}
          </p>
          <p className="kpi__hint">{leader ? `${formatScore(leader.avg)} / ${MAX_SCORE} en promedio` : "Aún sin fichas"}</p>
        </div>
      </section>

      {evaluations.length === 0 ? (
        <div className="empty">
          <strong>Aún no hay fichas registradas</strong>
          Cuando los evaluadores envíen sus fichas, aquí verás el ranking y la comparación por criterio.
        </div>
      ) : (
        <>
          <div className="panel-grid">
            <section className="card" aria-labelledby="ranking">
              <div className="section-head">
                <div>
                  <h2 id="ranking">Ranking de postores</h2>
                  <p>Puntaje promedio sobre {MAX_SCORE} · más arriba = mejor</p>
                </div>
              </div>
              <ol className="rank">
                {stats.map((s) => (
                  <li key={s.supplier.id} className={`rank__item${s.rank === 1 ? " is-first" : ""}`}>
                    <span className="rank__pos">{s.rank ?? "–"}</span>
                    <div>
                      <div className="rank__top">
                        <span className="rank__name">
                          <Link href={`/admin/postor/${s.supplier.id}`}>{s.supplier.name}</Link>
                          {!s.supplier.active && <span className="chip chip-pend" style={{ marginLeft: 6 }}>Inhabilitado</span>}
                        </span>
                        <span className="rank__val">
                          {formatScore(s.avg)} <small>/ {MAX_SCORE}</small>
                        </span>
                      </div>
                      <div
                        className="bar"
                        title={`${s.supplier.name}: ${formatScore(s.avg)} de ${MAX_SCORE}`}
                        role="img"
                        aria-label={`${s.supplier.name}: ${formatScore(s.avg)} de ${MAX_SCORE}`}
                      >
                        <span style={{ width: `${((s.avg ?? 0) / MAX_SCORE) * 100}%` }} />
                      </div>
                      <p className="rank__meta">
                        {s.count === 0
                          ? "Sin fichas"
                          : `${s.count} ficha${s.count === 1 ? "" : "s"} · rango ${s.min}–${s.max}`}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </section>

            <section className="card" aria-labelledby="distribucion">
              <div className="section-head">
                <div>
                  <h2 id="distribucion">Distribución de calificaciones</h2>
                  <p>Respuestas por postor (6 criterios × fichas)</p>
                </div>
                <div className="legend">
                  <span><i style={{ background: "var(--good-fill)" }} />Bueno</span>
                  <span><i style={{ background: "var(--reg-fill)" }} />Regular</span>
                  <span><i style={{ background: "var(--bad-fill)" }} />Malo</span>
                </div>
              </div>
              <div className="stack">
                {stats.map((s) => {
                  const n = s.counts.bueno + s.counts.regular + s.counts.malo;
                  return (
                    <div key={s.supplier.id}>
                      <div className="row between" style={{ fontSize: 14, marginBottom: 6 }}>
                        <strong style={{ color: "var(--navy)" }}>{s.supplier.name}</strong>
                        <span className="hint">
                          {n ? `${s.counts.bueno} B · ${s.counts.regular} R · ${s.counts.malo} M` : "Sin respuestas"}
                        </span>
                      </div>
                      <div className="stacked" role="img" aria-label={`${s.supplier.name}: ${s.counts.bueno} bueno, ${s.counts.regular} regular, ${s.counts.malo} malo`}>
                        {(["bueno", "regular", "malo"] as const).map((k) =>
                          s.counts[k] ? (
                            <span
                              key={k}
                              className={`s-${k}`}
                              style={{ width: `${(s.counts[k] / n) * 100}%` }}
                              title={`${k[0].toUpperCase()}${k.slice(1)}: ${s.counts[k]} (${Math.round((s.counts[k] / n) * 100)}%)`}
                            />
                          ) : null,
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          </div>

          <section aria-labelledby="matriz">
            <div className="section-head">
              <div>
                <h2 id="matriz">Comparación por criterio</h2>
                <p>Promedio sobre 10 por criterio · color más intenso = mejor</p>
              </div>
            </div>
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th className="sticky-col">Criterio</th>
                    {stats.map((s) => (
                      <th key={s.supplier.id} className="num">
                        {s.supplier.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {criteria.map((c, ci) => (
                    <tr key={c.id}>
                      <td className="sticky-col">
                        <strong>{c.id}.</strong> {c.title}
                      </td>
                      {stats.map((s) => {
                        const avg = s.criteria[ci]?.avg ?? null;
                        return (
                          <td key={s.supplier.id} className="num">
                            <span
                              className={`heat heat-${heatLevel(avg)}`}
                              title={`${s.supplier.name} · ${c.title}: ${formatScore(avg)} / 10`}
                            >
                              {formatScore(avg)}
                            </span>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td className="sticky-col">Total promedio / {MAX_SCORE}</td>
                    {stats.map((s) => (
                      <td key={s.supplier.id} className={`num tone-${s.avg === null ? "bajo" : tone(s.avg, MAX_SCORE)}`}>
                        {formatScore(s.avg)}
                      </td>
                    ))}
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>
        </>
      )}

      <section aria-labelledby="cobertura">
        <div className="section-head">
          <div>
            <h2 id="cobertura">Avance del comité</h2>
            <p>Puntaje de cada ficha por evaluador (según el nombre registrado) · “—” = sin ficha</p>
          </div>
        </div>
        {evaluators.length === 0 ? (
          <div className="empty">
            <strong>Aún no hay evaluadores</strong>
            Comparte el enlace de la ficha con el comité para empezar a recibir evaluaciones.
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th className="sticky-col">Evaluador</th>
                  {activeSuppliers.map((s) => (
                    <th key={s.id} className="num">
                      {s.name}
                    </th>
                  ))}
                  <th className="num">Avance</th>
                </tr>
              </thead>
              <tbody>
                {evaluators.map((p) => {
                  const mine = evaluations.filter((e) => keyOf(e) === p.key);
                  const n = activeSuppliers.filter((s) => mine.some((e) => e.supplier_id === s.id)).length;
                  return (
                    <tr key={p.key}>
                      <td className="sticky-col">{p.name}</td>
                      {activeSuppliers.map((s) => {
                        const ev = mine.find((e) => e.supplier_id === s.id);
                        return (
                          <td key={s.id} className="num">
                            {ev ? (
                              <span className={`score-pill tone-${tone(ev.total_score, MAX_SCORE)}`} title={`Visita del ${formatDate(ev.visit_date)}`}>
                                {ev.total_score}
                              </span>
                            ) : (
                              <span className="cover-no">—</span>
                            )}
                          </td>
                        );
                      })}
                      <td className="num">
                        {n}/{activeSuppliers.length}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section id="observaciones" aria-labelledby="obs-title">
        <div className="section-head">
          <div>
            <h2 id="obs-title">Observaciones del comité</h2>
            <p>
              {observations.length} observación(es)
              {fSupplier || fCriterion ? " con los filtros aplicados" : " en total"}
            </p>
          </div>
          <form method="get" action="/admin#observaciones" className="row wrap no-print" style={{ gap: 8 }}>
            <select className="select" name="postor" defaultValue={fSupplier} aria-label="Filtrar por postor" style={{ width: "auto", minHeight: 40 }}>
              <option value="">Todos los postores</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <select className="select" name="criterio" defaultValue={fCriterion} aria-label="Filtrar por criterio" style={{ width: "auto", minHeight: 40 }}>
              <option value="">Todos los criterios</option>
              {criteria.map((c) => (
                <option key={c.id} value={String(c.id)}>
                  {c.id}. {c.title}
                </option>
              ))}
            </select>
            <button className="btn btn-outline btn-sm" type="submit">
              Filtrar
            </button>
            {(fSupplier || fCriterion) && (
              <Link className="btn-text" href="/admin#observaciones">
                Quitar filtros
              </Link>
            )}
          </form>
        </div>
        {observations.length === 0 ? (
          <div className="empty">
            <strong>Sin observaciones</strong>
            {evaluations.length === 0
              ? "Las respuestas abiertas del comité aparecerán aquí."
              : "Ninguna ficha tiene observaciones con estos filtros."}
          </div>
        ) : (
          <div className="card">
            <ul className="obs-list">
              {observations.map((o) => {
                const sc = scaleOf(o.score);
                return (
                  <li key={`${o.evaluationId}-${o.criterionId}`} className="obs">
                    <div className="obs__meta">
                      <span className={`chip chip-${sc.key}`}>
                        {sc.label} · {sc.value}
                      </span>
                      <strong style={{ color: "var(--navy)" }}>{o.supplier}</strong>
                      <span>· {o.criterion}</span>
                    </div>
                    <p className="obs__text">“{o.text}”</p>
                    <p className="hint">
                      {o.evaluator} · visita del {formatDate(o.visitDate)}
                    </p>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </section>

      <section id="fichas" aria-labelledby="fichas-title">
        <div className="section-head">
          <div>
            <h2 id="fichas-title">Fichas registradas</h2>
            <p>{evaluations.length} ficha(s) · de la más reciente a la más antigua</p>
          </div>
          {evaluations.length > 0 && (
            <div className="no-print">
              <ActionForm
                action={deleteAllEvaluations}
                submitLabel={`Eliminar todas las fichas (${evaluations.length})`}
                submitClass="btn btn-sm btn-danger"
                resetOnSuccess={false}
                confirmMessage={`¿Eliminar las ${evaluations.length} fichas registradas y todas sus respuestas? Úsalo solo para limpiar pruebas: no se puede deshacer.`}
              >
                <input type="hidden" name="supplier_id" value="" />
              </ActionForm>
            </div>
          )}
        </div>
        {evaluations.length === 0 ? (
          <div className="empty">
            <strong>No hay fichas registradas</strong>
            Comparte el enlace de la ficha con el comité para empezar.
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th className="sticky-col">Evaluador</th>
                  <th>Postor</th>
                  <th>Visita</th>
                  <th className="num">Total</th>
                  <th>Registrada</th>
                </tr>
              </thead>
              <tbody>
                {evaluations.map((e) => {
                  const s = suppliers.find((x) => x.id === e.supplier_id);
                  return (
                    <tr key={e.id}>
                      <td className="sticky-col">
                        <strong>{e.evaluator_name}</strong>
                        <div className="no-print">
                          <ActionForm
                            action={deleteEvaluation}
                            submitLabel="Eliminar ficha"
                            submitClass="btn-danger-text"
                            resetOnSuccess={false}
                            confirmMessage={`¿Eliminar la ficha de ${e.evaluator_name} para ${s?.name ?? "este postor"}? No se puede deshacer.`}
                          >
                            <input type="hidden" name="id" value={e.id} />
                          </ActionForm>
                        </div>
                      </td>
                      <td>
                        <Link href={`/admin/postor/${e.supplier_id}`}>{s?.name ?? "—"}</Link>
                      </td>
                      <td>{formatDate(e.visit_date)}</td>
                      <td className="num">
                        <span className={`score-pill tone-${tone(e.total_score, MAX_SCORE)}`}>
                          {e.total_score}
                          <small>/{MAX_SCORE}</small>
                        </span>
                      </td>
                      <td>{formatDateTime(e.created_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="hint">
        Promedios redondeados a un decimal. Empates (misma cifra con un decimal) comparten puesto. Valor de referencia
        de colores: ≥ {round1(MAX_SCORE * 0.8)} alto, ≥ {round1(MAX_SCORE * 0.5)} medio.
      </p>
    </AdminFrame>
  );
}
