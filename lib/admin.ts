import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Criterion, Evaluation, Profile, Supplier } from "./types";

export async function loadPanelData(supabase: SupabaseClient) {
  const [s, c, e, p] = await Promise.all([
    supabase.from("fv_suppliers").select("id, name, active, sort_order").order("sort_order"),
    supabase.from("fv_criteria").select("*").order("id"),
    supabase
      .from("fv_evaluations")
      .select(
        "id, evaluator_id, evaluator_name, evaluator_key, supplier_id, visit_date, total_score, created_at, updated_at, evaluation_answers:fv_evaluation_answers(criterion_id, score, observation)",
      )
      .order("updated_at", { ascending: false }),
    supabase.from("fv_profiles").select("id, email, full_name, role, active, created_at").order("full_name"),
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
