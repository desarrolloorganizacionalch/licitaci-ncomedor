import { redirect } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { requireUser } from "@/lib/auth";

export const metadata = { title: "Cuenta pendiente" };

export default async function PendingPage() {
  const { user, profile } = await requireUser();
  if (profile?.active && profile.role === "admin" && user.email_confirmed_at) redirect("/admin");
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
            La cuenta <strong>{user.email}</strong> no tiene acceso al panel administrativo.
          </p>
          <p className="subtitle">
            Pide a un administrador del Comité Evaluador (Bienestar) que autorice tu correo. Para registrar una ficha
            de visita no necesitas cuenta: usa la página principal.
          </p>
          <a className="btn btn-outline" href="/pendiente">
            Actualizar
          </a>
          <a className="btn btn-navy" href="/">
            Ir a la ficha de visita
          </a>
        </div>
      </main>
    </>
  );
}
