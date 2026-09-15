Deno.serve(async (req) => {
  return new Response(JSON.stringify({ ok: true, service: "transcribe" }), {
    headers: { "content-type": "application/json" }
  })
})
