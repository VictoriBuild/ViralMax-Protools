"use client"

export default function GlobalError({
  error,
  reset
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "sans-serif", margin: 0, background: "#09090b", color: "#e4e4e7" }}>
        <main style={{ maxWidth: 640, margin: "0 auto", padding: 48 }}>
          <h1 style={{ fontSize: 28, marginBottom: 12 }}>MediaSuite is unavailable</h1>
          <p style={{ opacity: 0.8, marginBottom: 24 }}>
            {error.message || "The production web portal crashed while starting."}
          </p>
          <button
            type="button"
            onClick={() => reset()}
            style={{
              height: 40,
              padding: "0 16px",
              border: 0,
              borderRadius: 6,
              background: "#fafafa",
              color: "#111",
              fontWeight: 600
            }}
          >
            Reload
          </button>
        </main>
      </body>
    </html>
  )
}
