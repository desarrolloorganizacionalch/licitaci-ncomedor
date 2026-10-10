import { redirect } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { requireUser } from "@/lib/auth";

export const metadata = { title: "Cuenta pendiente" };

export default async function PendingPage() {
  const { user, profile } = await requireUser();
  if (profile?.active && user.email_confirmed_at) redirect("/");
  return (
    <>
      <AppHeader profile={profile} />
      <main className="shell stack">
        <p className="eyebrow">Acceso</p>
        <h1 className="title">
          Cuenta <em>pendiente</em>
        </h1>
        <div className="card stack">
          <p>
            Tu cuenta <strong>{user.email}</strong> se creó correctamente, pero aún no está habilitada para evaluar.
          </p>
          <p className="subtitle">
            Pide al administrador del Comité Evaluador (Bienestar) que autorice tu correo. Cuando lo haga, vuelve a
            ingresar o actualiza esta página.
          </p>
          <a className="btn btn-outline" href="/pendiente">
            Actualizar
          </a>
        </div>
      </main>
    </>
  );
}
