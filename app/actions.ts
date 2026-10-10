"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { CRITERIA_COUNT, isScore } from "@/lib/scoring";

export interface VoteInput {
  evaluatorName: string;
  supplierId: string;
  visitDate: string;
  answers: { criterion_id: number; score: number; observation: string }[];
  /** Campo trampa: las personas lo dejan vacío. */
  website?: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const cleanName = (s: string) => s.trim().replace(/\s+/g, " ");

export async function checkVote(evaluatorName: string, supplierId: string): Promise<boolean> {
  if (!UUID.test(supplierId) || cleanName(evaluatorName).length < 3) return false;
  const supabase = await createClient();
  const { data } = await supabase.rpc("fv_vote_exists", {
    p_evaluator_name: cleanName(evaluatorName),
    p_supplier_id: supplierId,
  });
  return data === true;
}

export async function submitVote(input: VoteInput): Promise<{ ok: true; total: number } | { ok: false; error: string }> {
  if (input.website) return { ok: false, error: "No se pudo registrar la ficha." };

  // Validación previa; la definitiva y el cálculo del total están en la función SQL.
  const name = cleanName(input.evaluatorName ?? "");
  if (name.length < 3 || name.length > 120) return { ok: false, error: "Escribe tu nombre y apellido." };
  if (!UUID.test(input.supplierId)) return { ok: false, error: "Elige la empresa postora." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.visitDate)) return { ok: false, error: "Indica la fecha de la visita." };
  if (
    input.answers.length !== CRITERIA_COUNT ||
    new Set(input.answers.map((a) => a.criterion_id)).size !== CRITERIA_COUNT ||
    !input.answers.every((a) => isScore(a.score))
  ) {
    return { ok: false, error: "Califica los 6 criterios antes de enviar." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fv_submit_public_evaluation", {
    p_evaluator_name: name,
    p_supplier_id: input.supplierId,
    p_visit_date: input.visitDate,
    p_answers: input.answers.map((a) => ({
      criterion_id: a.criterion_id,
      score: a.score,
      observation: (a.observation ?? "").trim().slice(0, 1000),
    })),
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin", "layout");
  return { ok: true, total: Number(data) };
}
