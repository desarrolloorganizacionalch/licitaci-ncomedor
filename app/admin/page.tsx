import Link from "next/link";
import { AdminFrame } from "@/components/AdminFrame";
import { requireAdmin } from "@/lib/auth";
import { loadPanelData } from "@/lib/admin";
import { aggregate, formatDate, formatScore, MAX_SCORE, round1, tone } from "@/lib/scoring";

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

export default async function AdminPage() {
  const { supabase, profile } = await requireAdmin();
  const { error, suppliers, criteria, evaluations, profiles } = await loadPanelData(supabase);

  const stats = aggregate(suppliers, criteria, evaluations);
  const evaluated = stats.filter((s) => s.count > 0);
  const evaluatorIds = new Set(evaluations.map((e) => e.evaluator_id));
  const overall = evaluations.length
    ? evaluations.reduce((a, e) => a + e.total_score, 0) / evaluations.length
    : null;
  const leader = evaluated[0];
  const activeEvaluators = profiles.filter((p) => p.active);
  const activeSuppliers = suppliers.filter((s) => s.active);
  const done = new Set(evaluations.map((e) => `${e.evaluator_id}:${e.supplier_id}`));
  const expected = activeEvaluators.length * activeSuppliers.length;

  return (
    <AdminFrame
      profile={profile}
      eyebrow="Licitación · Servicio de alimentación"
      title="Comparativo de"
      accent="Postores"
      intro={`Promedio de las fichas de visita del comité, sobre ${MAX_SCORE} puntos.`}
      actions={
        <a className="btn btn-outline btn-sm" href="/admin/exportar">
          Descargar CSV
        </a>
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
          <p className="kpi__hint">
            {expected ? `${Math.round((done.size / expected) * 100)}% de ${expected} esperadas` : "Sin evaluadores activos"}
          </p>
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
          <p className="kpi__value">
            {evaluatorIds.size}
            <small>/ {activeEvaluators.length}</small>
          </p>
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
            <p>Puntaje de cada ficha enviada por evaluador · “—” = pendiente</p>
          </div>
        </div>
        {activeEvaluators.length === 0 ? (
          <div className="empty">
            <strong>No hay evaluadores activos</strong>
            Autoriza correos en <Link href="/admin/usuarios">Usuarios</Link>.
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
                {activeEvaluators.map((p) => {
                  const mine = evaluations.filter((e) => e.evaluator_id === p.id);
                  const n = activeSuppliers.filter((s) => done.has(`${p.id}:${s.id}`)).length;
                  return (
                    <tr key={p.id}>
                      <td className="sticky-col">{p.full_name || p.email}</td>
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

      {evaluations.length > 0 && (
        <section aria-labelledby="recientes">
          <div className="section-head">
            <div>
              <h2 id="recientes">Últimas fichas</h2>
              <p>Ordenadas por fecha de envío</p>
            </div>
          </div>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Postor</th>
                  <th>Evaluador</th>
                  <th>Visita</th>
                  <th className="num">Total</th>
                </tr>
              </thead>
              <tbody>
                {evaluations.slice(0, 12).map((e) => {
                  const s = suppliers.find((x) => x.id === e.supplier_id);
                  return (
                    <tr key={e.id}>
                      <td>
                        <Link href={`/admin/postor/${e.supplier_id}`}>{s?.name ?? "—"}</Link>
                      </td>
                      <td>{e.evaluator_name}</td>
                      <td>{formatDate(e.visit_date)}</td>
                      <td className="num">
                        <span className={`score-pill tone-${tone(e.total_score, MAX_SCORE)}`}>
                          {e.total_score}
                          <small>/{MAX_SCORE}</small>
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
      <p className="hint">
        Promedios redondeados a un decimal. Empates (misma cifra con un decimal) comparten puesto. Valor de referencia
        de colores: ≥ {round1(MAX_SCORE * 0.8)} alto, ≥ {round1(MAX_SCORE * 0.5)} medio.
      </p>
    </AdminFrame>
  );
}
