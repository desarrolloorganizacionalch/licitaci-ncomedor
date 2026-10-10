"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function ResetForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const password = String(form.get("password") ?? "");
    const confirm = String(form.get("confirm") ?? "");
    if (password.length < 8) return setError("La contraseña debe tener al menos 8 caracteres.");
    if (password !== confirm) return setError("Las contraseñas no coinciden.");
    setBusy(true);
    setError(null);
    const { error } = await createClient().auth.updateUser({ password });
    setBusy(false);
    if (error) return setError(error.message);
    router.replace("/");
    router.refresh();
  }

  return (
    <form className="card stack" onSubmit={onSubmit}>
      {error && (
        <div className="alert alert-error" role="alert">
          {error}
        </div>
      )}
      <label className="field">
        <span>Nueva contraseña</span>
        <input className="input" type="password" name="password" minLength={8} required autoComplete="new-password" />
      </label>
      <label className="field">
        <span>Repite la contraseña</span>
        <input className="input" type="password" name="confirm" minLength={8} required autoComplete="new-password" />
      </label>
      <button className="btn btn-primary btn-block" disabled={busy}>
        {busy ? "Guardando…" : "Guardar contraseña"}
      </button>
    </form>
  );
}
