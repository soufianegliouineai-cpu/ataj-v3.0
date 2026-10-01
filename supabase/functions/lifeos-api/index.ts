const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Cache-Control": "no-store"
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, "Content-Type": "application/json; charset=utf-8" }
  });
}

function subtractDays(iso: string, days: number) {
  const d = new Date(iso + "T00:00:00Z");
  if (Number.isNaN(d.getTime())) throw new Error("invalid ISO date");
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

Deno.serve((req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "GET") return json({ error: { code: "METHOD_NOT_ALLOWED", message: "GET only" } }, 405);

  const url = new URL(req.url);
  const path = url.pathname;

  if (path.endsWith("/health") || path.endsWith("/lifeos-api") || path === "/") {
    return json({
      ok: true,
      service: "lifeos-api",
      version: "0.1.1",
      environment: "production",
      architecture: "evidence-first"
    });
  }

  if (path.endsWith("/v1/home")) {
    return json({
      data: {
        status: { state: "calm", message: "Everything looks calm" },
        nextAction: null,
        upcoming: [],
        coverage: { identity: "not_added", deadlineSafety: "ready", emergencyKit: "needs_setup" }
      },
      meta: { version: "0.1.1" }
    });
  }

  if (path.endsWith("/v1/demo/passport")) {
    const expiry = url.searchParams.get("expiry") ?? "2027-06-12";
    try {
      const recommendedActionAt = subtractDays(expiry, 90);
      return json({
        data: {
          document: {
            type: "passport",
            facts: [{
              key: "expiry_date",
              value: expiry,
              confidence: 0.998,
              origin: "ai_extracted",
              provenance: { page: 1, label: "Date of expiry" }
            }]
          },
          obligation: {
            type: "DOCUMENT_RENEWAL",
            status: "protected",
            rule: { code: "passport_renewal_v1", deterministic: true }
          },
          deadline: {
            dueAt: expiry,
            recommendedActionAt,
            severity: "important",
            status: "protected"
          },
          task: {
            title: "Prepare passport renewal",
            status: "ready",
            dueAt: recommendedActionAt
          }
        },
        meta: { sourceTraceability: true, modelMayNotSetLegalDeadline: true, version: "0.1.1" }
      });
    } catch {
      return json({ error: { code: "INVALID_EXPIRY_DATE", message: "Use YYYY-MM-DD." } }, 400);
    }
  }

  return json({ error: { code: "NOT_FOUND", message: "Route not found", path } }, 404);
});