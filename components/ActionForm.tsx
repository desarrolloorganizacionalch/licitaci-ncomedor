"use client";

import { useActionState, useEffect, useRef } from "react";

type Result = { ok: true; message?: string } | { ok: false; error: string };

/** Formulario con estado de envío y mensajes, conectado a una Server Action. */
export function ActionForm({
  action,
  className,
  submitLabel,
  submitClass = "btn btn-navy",
  resetOnSuccess = true,
  confirmMessage,
  children,
}: {
  action: (prev: Result | null, form: FormData) => Promise<Result>;
  className?: string;
  submitLabel: string;
  submitClass?: string;
  resetOnSuccess?: boolean;
  confirmMessage?: string;
  children: React.ReactNode;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok && resetOnSuccess) ref.current?.reset();
  }, [state, resetOnSuccess]);
  return (
    <div className="stack" style={{ gap: 10 }}>
      <form
        ref={ref}
        action={formAction}
        className={className}
        onSubmit={(e) => {
          if (confirmMessage && !window.confirm(confirmMessage)) e.preventDefault();
        }}
      >
        {children}
        <button className={submitClass} type="submit" disabled={pending}>
          {pending ? "Guardando…" : submitLabel}
        </button>
      </form>
      {state && !state.ok && (
        <div className="alert alert-error" role="alert">
          {state.error}
        </div>
      )}
      {state?.ok && state.message && (
        <div className="alert alert-ok" role="status">
          {state.message}
        </div>
      )}
    </div>
  );
}
