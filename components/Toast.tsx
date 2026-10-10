"use client";

import { useEffect, useState } from "react";

export function Toast({ children, ms = 4500 }: { children: React.ReactNode; ms?: number }) {
  const [open, setOpen] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setOpen(false), ms);
    // Limpia el parámetro ?ok= para que el aviso no reaparezca al recargar.
    window.history.replaceState(null, "", window.location.pathname);
    return () => clearTimeout(t);
  }, [ms]);
  if (!open) return null;
  return (
    <div className="toast" role="status" aria-live="polite">
      {children}
    </div>
  );
}
