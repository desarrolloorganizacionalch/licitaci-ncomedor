import { AdminFrame } from "@/components/AdminFrame";
import { ActionForm } from "@/components/ActionForm";
import { requireAdmin } from "@/lib/auth";
import type { Supplier } from "@/lib/types";
import { addSupplier, deleteSupplier, updateSupplier } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Postores" };

export default async function SuppliersPage() {
  const { supabase, profile } = await requireAdmin();
  const [{ data: suppliers }, { data: evals }] = await Promise.all([
    supabase.from("suppliers").select("id, name, active, sort_order").order("sort_order"),
    supabase.from("evaluations").select("supplier_id"),
  ]);
  const list = (suppliers ?? []) as Supplier[];
  const counts = new Map<string, number>();
  for (const e of evals ?? []) counts.set(e.supplier_id, (counts.get(e.supplier_id) ?? 0) + 1);

  return (
    <AdminFrame
      profile={profile}
      eyebrow="Administración"
      title="Empresas"
      accent="postoras"
      intro="Los postores inhabilitados no aparecen para los evaluadores, pero sus fichas se conservan en el comparativo."
    >
      <section className="card stack" aria-labelledby="nuevo">
        <h2 id="nuevo" style={{ fontSize: 18, color: "var(--navy)" }}>
          Agregar postor
        </h2>
        <ActionForm action={addSupplier} className="inline-form cols-2" submitLabel="Agregar">
          <label className="field">
            <span>Nombre de la empresa</span>
            <input className="input" name="name" required minLength={2} maxLength={120} />
          </label>
        </ActionForm>
      </section>

      <section className="stack" aria-label="Lista de postores" style={{ gap: 10 }}>
        {list.length === 0 && (
          <div className="empty">
            <strong>Sin postores</strong>Agrega la primera empresa postora.
          </div>
        )}
        {list.map((s) => {
          const n = counts.get(s.id) ?? 0;
          return (
            <div key={s.id} className="card card--flat row wrap" style={{ padding: 14 }}>
              <form action={updateSupplier} className="row grow" style={{ minWidth: 240 }}>
                <input type="hidden" name="id" value={s.id} />
                <input className="input grow" name="name" defaultValue={s.name} aria-label="Nombre" minLength={2} maxLength={120} />
                <button className="btn btn-outline btn-sm" type="submit">
                  Renombrar
                </button>
              </form>
              <span className="hint">{n} ficha(s)</span>
              <form action={updateSupplier}>
                <input type="hidden" name="id" value={s.id} />
                <input type="hidden" name="active" value={s.active ? "false" : "true"} />
                <button className={`chip ${s.active ? "chip-bueno" : "chip-pend"}`} style={{ border: 0, cursor: "pointer", minHeight: 32 }} type="submit" title={s.active ? "Inhabilitar" : "Habilitar"}>
                  {s.active ? "Habilitado · inhabilitar" : "Inhabilitado · habilitar"}
                </button>
              </form>
              {n === 0 && (
                <ActionForm action={deleteSupplier} submitLabel="Eliminar" submitClass="btn-danger-text" resetOnSuccess={false} confirmMessage={`¿Eliminar ${s.name}?`}>
                  <input type="hidden" name="id" value={s.id} />
                </ActionForm>
              )}
            </div>
          );
        })}
      </section>
      <p className="hint">Solo se pueden eliminar postores sin fichas. Para cerrar la evaluación de un postor, inhabilítalo.</p>
    </AdminFrame>
  );
}
