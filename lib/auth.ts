import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "./supabase/server";
import type { Profile } from "./types";

/** Usuario y perfil de la sesión actual (memorizado por petición). */
export const getSession = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, profile: null };
  const { data: profile } = await supabase
    .from("fv_profiles")
    .select("id, email, full_name, role, active, created_at")
    .eq("id", user.id)
    .single<Profile>();
  return { supabase, user, profile: profile ?? null };
});

export async function requireUser() {
  const s = await getSession();
  if (!s.user) redirect("/login");
  return s as typeof s & { user: NonNullable<typeof s.user> };
}

export async function requireActive() {
  const s = await requireUser();
  if (!s.profile?.active || !s.user.email_confirmed_at) redirect("/pendiente");
  return s as typeof s & { profile: Profile };
}

export async function requireAdmin() {
  const s = await requireActive();
  if (s.profile.role !== "admin") redirect("/pendiente");
  return s;
}
