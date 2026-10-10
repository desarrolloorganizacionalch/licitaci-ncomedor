export default function Loading() {
  return (
    <div className="loading" role="status">
      <div style={{ textAlign: "center" }}>
        <div className="spinner" style={{ margin: "0 auto 10px" }} />
        Cargando…
      </div>
    </div>
  );
}
