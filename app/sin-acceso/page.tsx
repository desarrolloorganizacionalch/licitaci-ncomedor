import Link from "next/link";
import { PublicHeader } from "@/components/PublicHeader";

export const metadata = { title: "Acceso al panel" };

export default function NoAccess() {
  return (
    <>
      <PublicHeader />
      <main className="shell stack">
        <p className="eyebrow">Panel del comité</p>
        <h1 className="title">
          Acceso <em>restringido</em>
        </h1>
        <div className="card stack">
          <p>El panel de resultados solo se abre con el enlace de administración del comité.</p>
          <p className="subtitle">
            Si tienes ese enlace, ábrelo de nuevo desde el mismo dispositivo. Si eres evaluador, no lo necesitas: llena
            tu ficha en la página principal.
          </p>
          <Link className="btn btn-navy" href="/">
            Ir a la ficha de visita
          </Link>
        </div>
      </main>
    </>
  );
}
