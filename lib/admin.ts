import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "./supabase/server";
import type { Criterion, Evaluation, Supplier } from "./types";

export const ADMIN_COOKIE = "fv_admin";

/** Clave del panel guardada en cookie al abrir el enlace secreto. */
export async function getAdminKey(): Promise<string | null> {
  const store = await cookies();
  return store.get(ADMIN_COOKIE)?.value ?? null;
}

export async function isValidAdminKey(key: string | null | undefined): Promise<boolean> {
  if (!key || key.length < 24 || key.length > 200) return false;
  const { data, error } = await createClient().rpc("fv_admin_ok", { p_key: key });
  return !error && data === true;
}

/** Para páginas del panel: devuelve la clave válida o envía a la pantalla de acceso. */
export async function requireAdminKey(): Promise<string> {
  const key = await getAdminKey();
  if (!(await isValidAdminKey(key))) redirect("/sin-acceso");
  return key!;
}

export async function loadPanelData(key: string) {
  const { data, error } = await createClient().rpc("fv_admin_panel", { p_key: key });
  const d = (data ?? {}) as { suppliers?: Supplier[]; criteria?: Criterion[]; evaluations?: Evaluation[] };
  return {
    error,
    suppliers: d.suppliers ?? [],
    criteria: d.criteria ?? [],
    evaluations: d.evaluations ?? [],
  };
}
