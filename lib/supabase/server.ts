import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { supabaseEnv } from "./env";

/**
 * Cliente sin sesión (rol anónimo). La app no usa cuentas: la ficha es pública
 * y el panel se valida con la clave del enlace secreto dentro de funciones SQL.
 */
export function createClient() {
  const { url, key } = supabaseEnv();
  return createSupabaseClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
