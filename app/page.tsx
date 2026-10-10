import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import { Toast } from "@/components/Toast";
import { requireActive } from "@/lib/auth";
import { formatDate, MAX_SCORE, tone } from "@/lib/scoring";
import type { Evaluation, Supplier } from "@/lib/types";

export const metadata = { title: "Mis evaluaciones" };

export default async function HomePage({ searchParams }: { searchParams: Promise<{ ok?: string }> }) {
  const { supabase, profile } = await requireActive();
  const { ok } = await searchParams;

  const [{ data: suppliers, error: e1 }, { data: evaluations, error: e2 }] = await Promise.all([
    supabase.from("fv_suppliers").select("id, name, active, sort_order").eq("active", true).order("sort_order"),
    supabase
      .from("fv_evaluations")
      .select("id, supplier_id, visit_date, total_score, updated_at")
      .eq("evaluator_id", profile.id),
  ]);

  const list = (suppliers ?? []) as Supplier[];
  const mine = new Map(((evaluations ?? []) as Evaluation[]).map((e) => [e.supplier_id, e]));
  const done = list.filter((s) => mine.has(s.id)).length;
  const firstName = (profile.full_name || profile.email).split(/\s+/)[0];
  const okSupplier = ok ? list.find((s) => s.id === ok) : undefined;
  const okEval = ok ? mine.get(ok) : undefined;

  return (
    <>
      <AppHeader profile={profile} />
      <main className="shell stack-lg">
        <section className="hello">
          <p className="eyebrow">Visitas a postores</p>
          <h1 className="title">
            Hola, <em>{firstName}</em>
          </h1>
          <p className="subtitle">
            Llena una ficha por cada postor visitado. Elige una sola opción por criterio: Bueno = 10 · Regular = 5 ·
            Malo = 0 (máximo {MAX_SCORE} puntos).
          </p>
        </section>

        {(e1 || e2) && (
          <div className="alert alert-error" role="alert">
            No se pudieron cargar los datos. Actualiza la página o inténtalo más tarde.
          </div>
        )}

        <section className="card stack" aria-labelledby="progreso">
          <div className="row between">
            <h2 id="progreso" className="label-caps">
              Tu avance
            </h2>
            <span className="score-pill">
              {done} <small>de {list.length} postores</small>
            </span>
          </div>
          <div
            className="progress-line"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={list.length}
            aria-valuenow={done}
            aria-label="Postores evaluados"
          >
            <span style={{ width: `${list.length ? (done / list.length) * 100 : 0}%` }} />
          </div>
        </section>

        <section className="stack" aria-labelledby="postores">
          <h2 id="postores" className="label-caps">
            Empresas postoras
          </h2>
          {list.length === 0 ? (
            <div className="empty">
              <strong>No hay postores habilitados</strong>
              El administrador aún no ha registrado empresas para evaluar.
            </div>
          ) : (
            <ul className="supplier-list">
              {list.map((s, i) => {
                const ev = mine.get(s.id);
                return (
                  <li key={s.id}>
                    <Link href={`/evaluar/${s.id}`} className={`supplier-row${ev ? " is-done" : ""}`}>
                      <span className="supplier-row__letter" aria-hidden="true">
                        {String.fromCharCode(65 + i)}
                      </span>
                      <span className="grow">
                        <span className="supplier-row__name">{s.name}</span>
                        <span className="supplier-row__meta" style={{ display: "block" }}>
                          {ev ? `Visitado el ${formatDate(ev.visit_date)}` : "Sin ficha registrada"}
                        </span>
                      </span>
                      <span className="supplier-row__end">
                        {ev ? (
                          <>
                            <span className={`score-pill tone-${tone(ev.total_score, MAX_SCORE)}`}>
                              {ev.total_score}
                              <small>/{MAX_SCORE}</small>
                            </span>
                            <span className="arrow">Editar</span>
                          </>
                        ) : (
                          <>
                            <span className="chip chip-pend">Pendiente</span>
                            <span className="arrow">Evaluar →</span>
                          </>
                        )}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </main>
      {okSupplier && okEval && (
        <Toast>
          Ficha de {okSupplier.name} guardada: {okEval.total_score}/{MAX_SCORE} puntos
        </Toast>
      )}
    </>
  );
}
