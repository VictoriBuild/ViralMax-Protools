Deno.serve(async (req) => {
  return new Response(JSON.stringify({ ok: true, service: "uploads" }), {
    headers: { "content-type": "application/json" }
  })
})
