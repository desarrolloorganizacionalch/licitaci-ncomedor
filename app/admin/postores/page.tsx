import { AdminFrame } from "@/components/AdminFrame";
import { ActionForm } from "@/components/ActionForm";
import { loadPanelData, requireAdminKey } from "@/lib/admin";
import { addSupplier, updateSupplier } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Postores" };

export default async function SuppliersPage() {
  const key = await requireAdminKey();
  const { suppliers: list, evaluations } = await loadPanelData(key);
  const counts = new Map<string, number>();
  for (const e of evaluations) counts.set(e.supplier_id, (counts.get(e.supplier_id) ?? 0) + 1);

  return (
    <AdminFrame
      eyebrow="Administración"
      title="Empresas"
      accent="postoras"
      intro="Los postores inhabilitados no aparecen en la ficha pública, pero sus fichas se conservan en el comparativo."
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
        {list.map((s) => (
          <div key={s.id} className="card card--flat row wrap" style={{ padding: 14 }}>
            <form action={updateSupplier} className="row grow" style={{ minWidth: 240 }}>
              <input type="hidden" name="id" value={s.id} />
              <input className="input grow" name="name" defaultValue={s.name} aria-label="Nombre" minLength={2} maxLength={120} />
              <button className="btn btn-outline btn-sm" type="submit">
                Renombrar
              </button>
            </form>
            <span className="hint">{counts.get(s.id) ?? 0} ficha(s)</span>
            <form action={updateSupplier}>
              <input type="hidden" name="id" value={s.id} />
              <input type="hidden" name="active" value={s.active ? "false" : "true"} />
              <button
                className={`chip ${s.active ? "chip-bueno" : "chip-pend"}`}
                style={{ border: 0, cursor: "pointer", minHeight: 32 }}
                type="submit"
              >
                {s.active ? "Habilitado · inhabilitar" : "Inhabilitado · habilitar"}
              </button>
            </form>
          </div>
        ))}
      </section>
      <p className="hint">Para cerrar la evaluación de un postor, inhabilítalo: deja de aparecer en la ficha pública.</p>
    </AdminFrame>
  );
}
