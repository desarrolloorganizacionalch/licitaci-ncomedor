import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminFrame } from "@/components/AdminFrame";
import { ConfirmButton } from "@/components/ConfirmButton";
import { loadPanelData, requireAdminKey } from "@/lib/admin";
import { aggregate, formatDate, formatScore, MAX_SCORE, scaleOf, tone } from "@/lib/scoring";
import { deleteEvaluation } from "../../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Detalle de postor" };

export default async function SupplierDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const key = await requireAdminKey();
  const { suppliers, criteria, evaluations } = await loadPanelData(key);
  const supplier = suppliers.find((s) => s.id === id);
  if (!supplier) notFound();

  const all = aggregate(suppliers, criteria, evaluations);
  const st = all.find((s) => s.supplier.id === id)!;
  const evs = evaluations.filter((e) => e.supplier_id === id);

  return (
    <AdminFrame
      eyebrow="Detalle de postor"
      title="Postor"
      accent={supplier.name}
      intro={<Link href="/admin">← Volver al comparativo</Link>}
    >
      <section className="kpis">
        <div className="card card--navy kpi">
          <p className="label-caps">Promedio</p>
          <p className="kpi__value">
            {formatScore(st.avg)}
            <small>/ {MAX_SCORE}</small>
          </p>
          <p className="kpi__hint">{st.rank ? `Puesto ${st.rank} de ${all.filter((s) => s.rank).length}` : "Sin ranking"}</p>
        </div>
        <div className="card kpi">
          <p className="label-caps">Fichas</p>
          <p className="kpi__value">{st.count}</p>
          <p className="kpi__hint">Evaluadores distintos</p>
        </div>
        <div className="card kpi">
          <p className="label-caps">Mínimo</p>
          <p className="kpi__value">{st.min ?? "—"}</p>
        </div>
        <div className="card kpi">
          <p className="label-caps">Máximo</p>
          <p className="kpi__value">{st.max ?? "—"}</p>
        </div>
      </section>

      {evs.length === 0 ? (
        <div className="empty">
          <strong>Sin fichas para este postor</strong>
          Aún ningún evaluador ha registrado su visita.
        </div>
      ) : (
        <>
          <section className="card" aria-labelledby="por-criterio">
            <div className="section-head">
              <div>
                <h2 id="por-criterio">Resultado por criterio</h2>
                <p>Promedio sobre 10 y observaciones del comité</p>
              </div>
              <div className="legend">
                <span><i style={{ background: "var(--good-fill)" }} />Bueno</span>
                <span><i style={{ background: "var(--reg-fill)" }} />Regular</span>
                <span><i style={{ background: "var(--bad-fill)" }} />Malo</span>
              </div>
            </div>
            <div className="stack-lg">
              {criteria.map((c, i) => {
                const cs = st.criteria[i];
                const n = cs.counts.bueno + cs.counts.regular + cs.counts.malo;
                const notes = evs
                  .map((e) => ({ e, a: e.evaluation_answers?.find((a) => a.criterion_id === c.id) }))
                  .filter((x) => x.a?.observation);
                return (
                  <div key={c.id} className="stack" style={{ gap: 8 }}>
                    <div className="row between" style={{ alignItems: "baseline" }}>
                      <strong style={{ color: "var(--navy)" }}>
                        {c.id}. {c.title}
                      </strong>
                      <span className="rank__val">
                        {formatScore(cs.avg)} <small>/ 10</small>
                      </span>
                    </div>
                    <div className="stacked" role="img" aria-label={`${cs.counts.bueno} bueno, ${cs.counts.regular} regular, ${cs.counts.malo} malo`}>
                      {(["bueno", "regular", "malo"] as const).map((k) =>
                        cs.counts[k] ? <span key={k} className={`s-${k}`} style={{ width: `${(cs.counts[k] / n) * 100}%` }} title={`${k}: ${cs.counts[k]}`} /> : null,
                      )}
                    </div>
                    <p className="hint">
                      {cs.counts.bueno} bueno · {cs.counts.regular} regular · {cs.counts.malo} malo
                    </p>
                    {notes.length > 0 && (
                      <ul className="obs-list">
                        {notes.map(({ e, a }) => {
                          const sc = scaleOf(a!.score);
                          return (
                            <li key={e.id} className="obs">
                              <div className="obs__meta">
                                <span className={`chip chip-${sc.key}`}>{sc.label}</span>
                                <span>{e.evaluator_name}</span>
                              </div>
                              <p className="obs__text">{a!.observation}</p>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          <section aria-labelledby="fichas">
            <div className="section-head">
              <div>
                <h2 id="fichas">Fichas individuales</h2>
                <p>Toca una ficha para ver el detalle</p>
              </div>
            </div>
            <div className="stack" style={{ gap: 8 }}>
              {evs.map((e) => (
                <details key={e.id} className="ficha">
                  <summary>
                    <span>
                      <strong style={{ color: "var(--navy)" }}>{e.evaluator_name}</strong>
                      <span className="hint" style={{ display: "block" }}>
                        Visita del {formatDate(e.visit_date)}
                      </span>
                    </span>
                    <span className={`score-pill tone-${tone(e.total_score, MAX_SCORE)}`}>
                      {e.total_score}
                      <small>/{MAX_SCORE}</small>
                    </span>
                  </summary>
                  <div className="ficha__body">
                    <ul className="summary-list">
                      {criteria.map((c) => {
                        const a = e.evaluation_answers?.find((x) => x.criterion_id === c.id);
                        const sc = a ? scaleOf(a.score) : null;
                        return (
                          <li key={c.id} className="summary-item">
                            <span className="summary-item__n">{c.id}</span>
                            <span>
                              <span className="summary-item__t">{c.title}</span>
                              {a?.observation && <span className="summary-item__obs" style={{ display: "block" }}>“{a.observation}”</span>}
                            </span>
                            {sc ? <span className={`chip chip-${sc.key}`}>{sc.label} · {sc.value}</span> : <span className="chip chip-pend">—</span>}
                          </li>
                        );
                      })}
                    </ul>
                    <form action={deleteEvaluation} className="no-print" style={{ marginTop: 8 }}>
                      <input type="hidden" name="id" value={e.id} />
                      <ConfirmButton message={`¿Eliminar la ficha de ${e.evaluator_name}? Esta acción no se puede deshacer.`}>
                        Eliminar ficha
                      </ConfirmButton>
                    </form>
                  </div>
                </details>
              ))}
            </div>
          </section>
        </>
      )}
    </AdminFrame>
  );
}
