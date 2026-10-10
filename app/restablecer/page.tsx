import { AppHeader } from "@/components/AppHeader";
import { requireUser } from "@/lib/auth";
import { ResetForm } from "./ResetForm";

export const metadata = { title: "Nueva contraseña" };

export default async function ResetPage() {
  const { profile } = await requireUser();
  return (
    <>
      <AppHeader profile={profile} />
      <main className="shell stack">
        <p className="eyebrow">Recuperar acceso</p>
        <h1 className="title">
          Nueva <em>contraseña</em>
        </h1>
        <ResetForm />
      </main>
    </>
  );
}
