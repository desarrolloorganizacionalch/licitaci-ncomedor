import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Criterion, Evaluation, Profile, Supplier } from "./types";

export async function loadPanelData(supabase: SupabaseClient) {
  const [s, c, e, p] = await Promise.all([
    supabase.from("suppliers").select("id, name, active, sort_order").order("sort_order"),
    supabase.from("criteria").select("*").order("id"),
    supabase
      .from("evaluations")
      .select(
        "id, evaluator_id, evaluator_name, supplier_id, visit_date, total_score, created_at, updated_at, evaluation_answers(criterion_id, score, observation)",
      )
      .order("updated_at", { ascending: false }),
    supabase.from("profiles").select("id, email, full_name, role, active, created_at").order("full_name"),
  ]);
  const error = s.error || c.error || e.error || p.error;
  return {
    error,
    suppliers: (s.data ?? []) as Supplier[],
    criteria: (c.data ?? []) as Criterion[],
    evaluations: (e.data ?? []) as Evaluation[],
    profiles: (p.data ?? []) as Profile[],
  };
}
