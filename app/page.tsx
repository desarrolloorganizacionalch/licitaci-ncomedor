import { PublicHeader } from "@/components/PublicHeader";
import { createClient } from "@/lib/supabase/server";
import type { Criterion, Supplier } from "@/lib/types";
import { VoteForm } from "./VoteForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Ficha de visita" };

export default async function HomePage() {
  const supabase = await createClient();
  const [{ data: suppliers, error: e1 }, { data: criteria, error: e2 }] = await Promise.all([
    supabase.from("fv_suppliers").select("id, name, active, sort_order").eq("active", true).order("sort_order"),
    supabase.from("fv_criteria").select("*").order("id"),
  ]);

  return (
    <>
      <PublicHeader />
      {e1 || e2 || !criteria?.length ? (
        <main className="shell stack">
          <div className="alert alert-error" role="alert">
            No se pudo cargar la ficha. Revisa tu conexión y actualiza la página.
          </div>
        </main>
      ) : (
        <VoteForm suppliers={(suppliers ?? []) as Supplier[]} criteria={criteria as Criterion[]} />
      )}
    </>
  );
}
