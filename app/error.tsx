"use client";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="shell stack" style={{ paddingTop: 60 }}>
      <p className="eyebrow">Algo salió mal</p>
      <h1 className="title">
        No pudimos cargar la <em>página</em>
      </h1>
      <p className="subtitle">Revisa tu conexión e inténtalo de nuevo.{error.digest ? ` (ref. ${error.digest})` : ""}</p>
      <button className="btn btn-navy" onClick={reset}>
        Reintentar
      </button>
    </main>
  );
}
