export default function Loading() {
  return (
    <div className="admin-main" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60vh" }}>
      <span className="busy-label" style={{ color: "#8d837b" }}>
        <span className="spinner" aria-hidden="true" />
        Loading
      </span>
    </div>
  );
}
