"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";

type Result = { ok: true; message?: string } | { ok: false; error: string };

/** Comprobación de servidor; la protección definitiva es RLS en la base de datos. */
async function adminClient() {
  const { supabase, profile } = await getSession();
  if (!profile?.active || profile.role !== "admin") throw new Error("No autorizado");
  return { supabase, profile };
}

function fail(e: unknown): Result {
  const msg = e instanceof Error ? e.message : String(e);
  if (/duplicate key/i.test(msg)) return { ok: false, error: "Ese registro ya existe." };
  if (/foreign key|violates/i.test(msg)) return { ok: false, error: "No se puede eliminar: tiene fichas asociadas. Inhabilítalo en su lugar." };
  return { ok: false, error: msg };
}

const ROLES = new Set(["evaluador", "admin"]);

export async function authorizeEmail(_: Result | null, form: FormData): Promise<Result> {
  try {
    const { supabase } = await adminClient();
    const email = String(form.get("email") ?? "").trim().toLowerCase();
    const full_name = String(form.get("full_name") ?? "").trim().slice(0, 120);
    const role = String(form.get("role") ?? "evaluador");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: "Correo inválido." };
    if (!ROLES.has(role)) return { ok: false, error: "Rol inválido." };
    const { error } = await supabase.from("fv_allowed_users").upsert({ email, full_name, role }, { onConflict: "email" });
    if (error) throw error;
    revalidatePath("/admin", "layout");
    return { ok: true, message: `${email} autorizado como ${role}.` };
  } catch (e) {
    return fail(e);
  }
}

export async function revokeEmail(form: FormData) {
  const { supabase } = await adminClient();
  const email = String(form.get("email") ?? "");
  await supabase.from("fv_allowed_users").delete().eq("email", email);
  revalidatePath("/admin", "layout");
}

export async function updateProfile(form: FormData) {
  const { supabase, profile } = await adminClient();
  const id = String(form.get("id") ?? "");
  if (id === profile.id) return;
  const patch: Record<string, unknown> = {};
  const role = form.get("role");
  const active = form.get("active");
  if (role !== null && ROLES.has(String(role))) patch.role = String(role);
  if (active !== null) patch.active = active === "true";
  if (Object.keys(patch).length) await supabase.from("fv_profiles").update(patch).eq("id", id);
  revalidatePath("/admin", "layout");
}

export async function addSupplier(_: Result | null, form: FormData): Promise<Result> {
  try {
    const { supabase } = await adminClient();
    const name = String(form.get("name") ?? "").trim();
    if (name.length < 2 || name.length > 120) return { ok: false, error: "Escribe un nombre válido." };
    const { data: last } = await supabase
      .from("fv_suppliers")
      .select("sort_order")
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    const { error } = await supabase.from("fv_suppliers").insert({ name, sort_order: (last?.sort_order ?? 0) + 1 });
    if (error) throw error;
    revalidatePath("/", "layout");
    return { ok: true, message: `${name} agregado.` };
  } catch (e) {
    return fail(e);
  }
}

export async function updateSupplier(form: FormData) {
  const { supabase } = await adminClient();
  const id = String(form.get("id") ?? "");
  const patch: Record<string, unknown> = {};
  const name = form.get("name");
  const active = form.get("active");
  if (name !== null && String(name).trim().length >= 2) patch.name = String(name).trim().slice(0, 120);
  if (active !== null) patch.active = active === "true";
  if (Object.keys(patch).length) await supabase.from("fv_suppliers").update(patch).eq("id", id);
  revalidatePath("/", "layout");
}

export async function deleteSupplier(_: Result | null, form: FormData): Promise<Result> {
  try {
    const { supabase } = await adminClient();
    const { error } = await supabase.from("fv_suppliers").delete().eq("id", String(form.get("id") ?? ""));
    if (error) throw error;
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteEvaluation(form: FormData) {
  const { supabase } = await adminClient();
  await supabase.from("fv_evaluations").delete().eq("id", String(form.get("id") ?? ""));
  revalidatePath("/", "layout");
}
