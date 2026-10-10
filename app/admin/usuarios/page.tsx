import { AdminFrame } from "@/components/AdminFrame";
import { ActionForm } from "@/components/ActionForm";
import { ConfirmButton } from "@/components/ConfirmButton";
import { requireAdmin } from "@/lib/auth";
import { formatDate } from "@/lib/scoring";
import type { AllowedUser, Profile } from "@/lib/types";
import { authorizeEmail, revokeEmail, updateProfile } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Administradores" };

export default async function UsersPage() {
  const { supabase, profile } = await requireAdmin();
  const [{ data: allowed }, { data: profiles }] = await Promise.all([
    supabase.from("fv_allowed_users").select("email, full_name, role, created_at").order("created_at", { ascending: false }),
    supabase.from("fv_profiles").select("id, email, full_name, role, active, created_at").order("created_at", { ascending: false }),
  ]);
  const allowList = (allowed ?? []) as AllowedUser[];
  const people = (profiles ?? []) as Profile[];
  const registered = new Set(people.map((p) => p.email));
  const allowedSet = new Set(allowList.map((a) => a.email));

  return (
    <AdminFrame
      profile={profile}
      eyebrow="Administración"
      title="Accesos al"
      accent="panel"
      intro="Los evaluadores no necesitan cuenta: registran su ficha en la página principal con su nombre. Aquí solo se gestionan las personas que pueden ver los resultados."
    >
      <section className="card stack" aria-labelledby="autorizar">
        <div>
          <h2 id="autorizar" style={{ fontSize: 18, color: "var(--navy)" }}>
            Autorizar administrador
          </h2>
          <p className="subtitle">
            La persona crea su cuenta con este correo en “Administración → Crear cuenta”. Si ya tiene cuenta, se
            habilita al instante.
          </p>
        </div>
        <ActionForm action={authorizeEmail} className="inline-form cols-3" submitLabel="Autorizar">
          <label className="field">
            <span>Nombre y apellido</span>
            <input className="input" name="full_name" maxLength={120} placeholder="Nombre del evaluador(a)" />
          </label>
          <label className="field">
            <span>Correo</span>
            <input className="input" name="email" type="email" required placeholder="nombre@empresa.com" />
          </label>
          <input type="hidden" name="role" value="admin" />
        </ActionForm>
      </section>

      <section aria-labelledby="cuentas">
        <div className="section-head">
          <div>
            <h2 id="cuentas">Cuentas con acceso</h2>
            <p>{people.length} cuenta(s)</p>
          </div>
        </div>
        {people.length === 0 ? (
          <div className="empty">
            <strong>Sin cuentas</strong>Aún nadie se ha registrado.
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th className="sticky-col">Persona</th>
                  <th>Rol</th>
                  <th>Estado</th>
                  <th>Alta</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {people.map((p) => {
                  const self = p.id === profile.id;
                  return (
                    <tr key={p.id}>
                      <td className="sticky-col">
                        <strong>{p.full_name || "Sin nombre"}</strong>
                        <span className="hint" style={{ display: "block" }}>
                          {p.email}
                        </span>
                      </td>
                      <td>
                        {self ? (
                          <span className="chip chip-navy">Administrador (tú)</span>
                        ) : p.role === "admin" ? (
                          <span className="chip chip-blue">Administrador</span>
                        ) : (
                          <form action={updateProfile} className="row" style={{ gap: 6 }}>
                            <input type="hidden" name="id" value={p.id} />
                            <input type="hidden" name="role" value="admin" />
                            <button className="btn btn-outline btn-sm" type="submit">
                              Hacer administrador
                            </button>
                          </form>
                        )}
                      </td>
                      <td>
                        {p.active ? (
                          <span className="chip chip-bueno">Activo</span>
                        ) : (
                          <span className="chip chip-pend">{allowedSet.has(p.email) ? "Inactivo" : "Sin autorizar"}</span>
                        )}
                      </td>
                      <td>{formatDate(p.created_at)}</td>
                      <td>
                        {!self && (
                          <form action={updateProfile}>
                            <input type="hidden" name="id" value={p.id} />
                            <input type="hidden" name="active" value={p.active ? "false" : "true"} />
                            {p.active ? (
                              <ConfirmButton message={`¿Desactivar a ${p.email}? No podrá registrar ni ver fichas.`}>Desactivar</ConfirmButton>
                            ) : (
                              <button className="btn-text" type="submit">
                                Activar
                              </button>
                            )}
                          </form>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section aria-labelledby="lista">
        <div className="section-head">
          <div>
            <h2 id="lista">Correos autorizados</h2>
            <p>Quitar una autorización desactiva la cuenta asociada</p>
          </div>
        </div>
        {allowList.length === 0 ? (
          <div className="empty">
            <strong>Sin correos autorizados</strong>Agrega el primero con el formulario superior.
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th className="sticky-col">Correo</th>
                  <th>Rol</th>
                  <th>Registro</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {allowList.map((a) => (
                  <tr key={a.email}>
                    <td className="sticky-col">
                      <strong>{a.full_name || "—"}</strong>
                      <span className="hint" style={{ display: "block" }}>
                        {a.email}
                      </span>
                    </td>
                    <td>{a.role === "admin" ? "Administrador" : "Sin acceso al panel"}</td>
                    <td>{registered.has(a.email) ? <span className="chip chip-blue">Cuenta creada</span> : <span className="chip chip-pend">Pendiente</span>}</td>
                    <td>
                      {a.email !== profile.email && (
                        <form action={revokeEmail}>
                          <input type="hidden" name="email" value={a.email} />
                          <ConfirmButton message={`¿Quitar la autorización de ${a.email}?`}>Quitar</ConfirmButton>
                        </form>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </AdminFrame>
  );
}
