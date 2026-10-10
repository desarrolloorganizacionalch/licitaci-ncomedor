import type { Metadata } from "next";
import { BrandLockup } from "@/components/BrandLockup";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Acceso administrador" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; msg?: string }>;
}) {
  const { error, msg } = await searchParams;
  return (
    <main className="auth">
      <section className="auth__hero">
        <BrandLockup size="lg" />
        <h1>Panel del comité</h1>
        <p>Acceso solo para administradores</p>
      </section>
      <div className="auth__panel">
        <LoginForm initialError={error} initialMessage={msg} />
        <p className="hint" style={{ textAlign: "center", marginTop: 16 }}>
          ¿Eres evaluador? <a href="/">Llena la ficha de visita aquí</a>, no necesitas cuenta.
        </p>
      </div>
    </main>
  );
}
