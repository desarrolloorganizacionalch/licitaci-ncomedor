"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { CRITERIA_COUNT, isScore } from "@/lib/scoring";

export interface SubmitInput {
  supplierId: string;
  visitDate: string;
  answers: { criterion_id: number; score: number; observation: string }[];
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function submitEvaluation(input: SubmitInput): Promise<{ ok: true } | { ok: false; error: string }> {
  // Validación previa (la definitiva y autoritativa está en la función SQL).
  if (!UUID.test(input.supplierId)) return { ok: false, error: "Postor inválido." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.visitDate)) return { ok: false, error: "Indica la fecha de la visita." };
  if (
    input.answers.length !== CRITERIA_COUNT ||
    new Set(input.answers.map((a) => a.criterion_id)).size !== CRITERIA_COUNT ||
    !input.answers.every((a) => isScore(a.score))
  ) {
    return { ok: false, error: "Califica los 6 criterios antes de enviar." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("fv_submit_evaluation", {
    p_supplier_id: input.supplierId,
    p_visit_date: input.visitDate,
    p_answers: input.answers.map((a) => ({
      criterion_id: a.criterion_id,
      score: a.score,
      observation: a.observation.trim().slice(0, 1000),
    })),
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/");
  revalidatePath("/admin", "layout");
  return { ok: true };
}
