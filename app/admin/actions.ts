"use server";

import { revalidatePath } from "next/cache";
import { getAdminKey, isValidAdminKey, loadPanelData } from "@/lib/admin";
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

function deleteError(msg: string) {
  if (/fv_admin_delete_evaluation|could not find the function|schema cache/i.test(msg)) {
    return "Falta activar la función de borrado en Supabase (ver instrucciones del administrador).";
  }
  return msg;
}

export async function deleteEvaluation(_: Result | null, form: FormData): Promise<Result> {
  try {
    const key = await adminKey();
    const { error } = await createClient().rpc("fv_admin_delete_evaluation", {
      p_key: key,
      p_id: String(form.get("id") ?? ""),
    });
    if (error) return { ok: false, error: deleteError(error.message) };
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}

/** Borra todas las fichas (o las de un postor), útil para limpiar pruebas. */
export async function deleteAllEvaluations(_: Result | null, form: FormData): Promise<Result> {
  try {
    const key = await adminKey();
    const supplierId = String(form.get("supplier_id") ?? "");
    const { evaluations, error } = await loadPanelData(key);
    if (error) return { ok: false, error: error.message };
    const ids = evaluations.filter((e) => !supplierId || e.supplier_id === supplierId).map((e) => e.id);
    const client = createClient();
    let removed = 0;
    for (const id of ids) {
      const { error: err } = await client.rpc("fv_admin_delete_evaluation", { p_key: key, p_id: id });
      if (err) return { ok: false, error: deleteError(err.message) };
      removed++;
    }
    revalidatePath("/", "layout");
    return { ok: true, message: `${removed} ficha(s) eliminada(s).` };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}
