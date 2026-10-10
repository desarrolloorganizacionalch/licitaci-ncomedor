import { NextResponse } from "next/server";
import { getAdminKey, isValidAdminKey, loadPanelData } from "@/lib/admin";
import { csvCell, todayInLima } from "@/lib/scoring";

export const dynamic = "force-dynamic";

/** Exporta todas las fichas (una fila por ficha) en CSV compatible con Excel. */
export async function GET() {
  const key = await getAdminKey();
  if (!(await isValidAdminKey(key))) {
    return new NextResponse("No autorizado", { status: 403 });
  }
  const { suppliers, criteria, evaluations, error } = await loadPanelData(key!);
  if (error) return new NextResponse(error.message, { status: 500 });

  const header = [
    "Postor",
    "Evaluador",
    "Fecha de visita",
    ...criteria.flatMap((c) => [`${c.id}. ${c.title} (pts)`, `${c.id}. Observación`]),
    "Total (/60)",
    "Enviado",
  ];
  const rows = evaluations.map((e) => {
    const s = suppliers.find((x) => x.id === e.supplier_id);
    return [
      s?.name ?? "",
      e.evaluator_name,
      e.visit_date,
      ...criteria.flatMap((c) => {
        const a = e.evaluation_answers?.find((x) => x.criterion_id === c.id);
        return [a?.score ?? "", a?.observation ?? ""];
      }),
      e.total_score,
      e.updated_at.slice(0, 16).replace("T", " "),
    ];
  });
  const csv = "﻿" + [header, ...rows].map((r) => r.map(csvCell).join(";")).join("\r\n");
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="fichas-visita-${todayInLima()}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
