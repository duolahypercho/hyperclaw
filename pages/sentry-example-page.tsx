import * as Sentry from "@sentry/nextjs";

export default function SentryExamplePage() {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", fontFamily: "system-ui, sans-serif", gap: "1rem" }}>
      <h1>Sentry Example Page</h1>
      <p>Click the button below to throw a test error and verify Sentry is working.</p>
      <button
        onClick={() => {
          throw new Error("Sentry Frontend Test Error");
        }}
        style={{ padding: "0.75rem 1.5rem", fontSize: "1rem", cursor: "pointer", borderRadius: "8px", border: "1px solid #ccc", background: "#e74c3c", color: "#fff" }}
      >
        Throw Client Error
      </button>
      <button
        onClick={async () => {
          const res = await fetch("/api/sentry-example-api");
          const data = await res.json();
          alert(data.error || "Server error triggered — check Sentry dashboard");
        }}
        style={{ padding: "0.75rem 1.5rem", fontSize: "1rem", cursor: "pointer", borderRadius: "8px", border: "1px solid #ccc", background: "#3498db", color: "#fff" }}
      >
        Throw Server Error
      </button>
    </div>
  );
}
