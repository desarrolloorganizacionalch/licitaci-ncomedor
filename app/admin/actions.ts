"use server";

import { revalidatePath } from "next/cache";
import { getAdminKey, isValidAdminKey } from "@/lib/admin";
import { createClient } from "@/lib/supabase/server";

type Result = { ok: true; message?: string } | { ok: false; error: string };

/** Comprobación previa; la validación definitiva de la clave está en cada función SQL. */
async function adminKey() {
  const key = await getAdminKey();
  if (!(await isValidAdminKey(key))) throw new Error("Acceso no autorizado. Abre de nuevo el enlace del panel.");
  return key!;
}

function message(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}

export async function addSupplier(_: Result | null, form: FormData): Promise<Result> {
  try {
    const key = await adminKey();
    const name = String(form.get("name") ?? "").trim();
    if (name.length < 2 || name.length > 120) return { ok: false, error: "Escribe un nombre válido." };
    const { error } = await createClient().rpc("fv_admin_save_supplier", {
      p_key: key,
      p_id: null,
      p_name: name,
      p_active: true,
    });
    if (error) throw error;
    revalidatePath("/", "layout");
    return { ok: true, message: `${name} agregado.` };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}

export async function updateSupplier(form: FormData) {
  const key = await adminKey();
  const active = form.get("active");
  const name = form.get("name");
  await createClient().rpc("fv_admin_save_supplier", {
    p_key: key,
    p_id: String(form.get("id") ?? ""),
    p_name: name === null ? null : String(name),
    p_active: active === null ? null : active === "true",
  });
  revalidatePath("/", "layout");
}

export async function deleteEvaluation(form: FormData) {
  const key = await adminKey();
  const { error } = await createClient().rpc("fv_admin_delete_evaluation", {
    p_key: key,
    p_id: String(form.get("id") ?? ""),
  });
  if (error) throw new Error(error.message);
  revalidatePath("/", "layout");
}
