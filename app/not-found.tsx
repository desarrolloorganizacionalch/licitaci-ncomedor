import Link from "next/link";

export default function NotFound() {
  return (
    <main className="shell stack" style={{ paddingTop: 60 }}>
      <p className="eyebrow">Error 404</p>
      <h1 className="title">
        Página no <em>encontrada</em>
      </h1>
      <p className="subtitle">El postor o la página que buscas no existe o fue inhabilitado.</p>
      <Link className="btn btn-navy" href="/">
        Volver al inicio
      </Link>
    </main>
  );
}
