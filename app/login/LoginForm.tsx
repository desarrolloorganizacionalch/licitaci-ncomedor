"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Mode = "login" | "signup" | "reset";

const ERRORS: Record<string, string> = {
  "Invalid login credentials": "Correo o contraseña incorrectos.",
  "Email not confirmed": "Confirma tu correo desde el enlace que te enviamos antes de ingresar.",
  "User already registered": "Ese correo ya tiene una cuenta. Ingresa o recupera tu contraseña.",
  callback: "El enlace no es válido o ya expiró. Solicita uno nuevo.",
};

function translate(message: string) {
  if (ERRORS[message]) return ERRORS[message];
  if (/password/i.test(message) && /least|characters|weak/i.test(message))
    return "La contraseña debe tener al menos 8 caracteres e incluir letras y números.";
  if (/failed to fetch|network|load failed/i.test(message))
    return "No se pudo conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.";
  if (/rate limit|too many/i.test(message)) return "Demasiados intentos. Espera unos minutos e inténtalo de nuevo.";
  return message;
}

function siteUrl() {
  return process.env.NEXT_PUBLIC_SITE_URL || window.location.origin;
}

export function LoginForm({ initialError, initialMessage }: { initialError?: string; initialMessage?: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("login");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(initialError ? translate(initialError) : null);
  const [message, setMessage] = useState<string | null>(initialMessage ?? null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const email = String(form.get("email") ?? "").trim().toLowerCase();
    const password = String(form.get("password") ?? "");
    const fullName = String(form.get("full_name") ?? "").trim();
    setBusy(true);
    setError(null);
    setMessage(null);
    const supabase = createClient();
    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.replace("/");
        router.refresh();
        return;
      }
      if (mode === "signup") {
        if (password.length < 8) throw new Error("La contraseña debe tener al menos 8 caracteres.");
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: fullName, app: "ficha_visita" },
            emailRedirectTo: `${siteUrl()}/auth/callback`,
          },
        });
        if (error) throw error;
        if (data.session) {
          router.replace("/");
          router.refresh();
          return;
        }
        setMessage(
          "Te enviamos un correo para confirmar tu cuenta. Si tu correo fue autorizado por el comité, podrás evaluar al ingresar.",
        );
        setMode("login");
        return;
      }
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${siteUrl()}/auth/callback?next=/restablecer`,
      });
      if (error) throw error;
      setMessage("Si el correo está registrado, recibirás un enlace para crear una nueva contraseña.");
      setMode("login");
    } catch (err) {
      setError(translate(err instanceof Error ? err.message : "No se pudo completar la operación."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card stack">
      {mode !== "reset" && (
        <div className="tabs" role="tablist" aria-label="Acceso">
          <button type="button" role="tab" aria-selected={mode === "login"} onClick={() => setMode("login")}>
            Ingresar
          </button>
          <button type="button" role="tab" aria-selected={mode === "signup"} onClick={() => setMode("signup")}>
            Crear cuenta
          </button>
        </div>
      )}
      {mode === "reset" && (
        <div>
          <p className="eyebrow">Recuperar acceso</p>
          <h2 className="title" style={{ fontSize: 22, marginTop: 4 }}>
            Nueva <em>contraseña</em>
          </h2>
        </div>
      )}

      {error && (
        <div className="alert alert-error" role="alert">
          {error}
        </div>
      )}
      {message && (
        <div className="alert alert-ok" role="status">
          {message}
        </div>
      )}

      <form className="stack" onSubmit={onSubmit} noValidate={false}>
        {mode === "signup" && (
          <label className="field">
            <span>Nombre y apellido</span>
            <input className="input" name="full_name" required maxLength={120} autoComplete="name" />
          </label>
        )}
        <label className="field">
          <span>Correo corporativo</span>
          <input
            className="input"
            type="email"
            name="email"
            required
            autoComplete="email"
            inputMode="email"
            placeholder="nombre@empresa.com"
          />
        </label>
        {mode !== "reset" && (
          <label className="field">
            <span>Contraseña</span>
            <input
              className="input"
              type="password"
              name="password"
              required
              minLength={mode === "signup" ? 8 : undefined}
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
            />
            {mode === "signup" && <span className="hint">Mínimo 8 caracteres.</span>}
          </label>
        )}
        <button className="btn btn-primary btn-block" type="submit" disabled={busy}>
          {busy
            ? "Procesando…"
            : mode === "login"
              ? "Ingresar"
              : mode === "signup"
                ? "Crear cuenta"
                : "Enviar enlace"}
        </button>
      </form>

      {mode === "login" && (
        <button className="btn-text" type="button" onClick={() => setMode("reset")}>
          ¿Olvidaste tu contraseña?
        </button>
      )}
      {mode === "reset" && (
        <button className="btn-text" type="button" onClick={() => setMode("login")}>
          Volver a ingresar
        </button>
      )}
      {mode === "signup" && (
        <p className="hint">
          Solo los correos autorizados por el comité pueden registrar evaluaciones. Si aún no lo estás, tu cuenta
          quedará pendiente hasta que un administrador la habilite.
        </p>
      )}
    </div>
  );
}
