import { notFound } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { requireActive } from "@/lib/auth";
import type { Criterion, Evaluation, Supplier } from "@/lib/types";
import { EvaluationForm } from "./EvaluationForm";

export const metadata = { title: "Ficha de visita" };

export default async function EvaluatePage({ params }: { params: Promise<{ supplierId: string }> }) {
  const { supplierId } = await params;
  const { supabase, profile } = await requireActive();
  if (!/^[0-9a-f-]{36}$/i.test(supplierId)) notFound();

  const [{ data: supplier }, { data: criteria }, { data: existing }] = await Promise.all([
    supabase.from("fv_suppliers").select("id, name, active, sort_order").eq("id", supplierId).eq("active", true).maybeSingle<Supplier>(),
    supabase.from("fv_criteria").select("*").order("id"),
    supabase
      .from("fv_evaluations")
      .select("id, supplier_id, visit_date, total_score, evaluation_answers:fv_evaluation_answers(criterion_id, score, observation)")
      .eq("evaluator_id", profile.id)
      .eq("supplier_id", supplierId)
      .maybeSingle<Evaluation>(),
  ]);

  if (!supplier) notFound();

  return (
    <>
      <AppHeader profile={profile} />
      <EvaluationForm
        userId={profile.id}
        evaluatorName={profile.full_name || profile.email}
        supplier={supplier}
        criteria={(criteria ?? []) as Criterion[]}
        existing={existing ?? null}
      />
    </>
  );
}
