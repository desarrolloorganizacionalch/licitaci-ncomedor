import type { Metadata } from "next";
import { BrandLockup } from "@/components/BrandLockup";
import { BRAND } from "@/lib/brand";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Ingresar" };

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
        <h1>{BRAND.appName}</h1>
        <p>{BRAND.appSubtitle}</p>
      </section>
      <div className="auth__panel">
        <LoginForm initialError={error} initialMessage={msg} />
        <p className="hint" style={{ textAlign: "center", marginTop: 16 }}>
          {BRAND.committee}
        </p>
      </div>
    </main>
  );
}
