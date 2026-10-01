const VERSION = "0.3.0";
const SERVICE = "lifeos-api";
const DEFAULT_LEAD_DAYS = 90;
const DOCUMENT_TYPES = new Set([
  "passport",
  "driving_license",
  "insurance",
  "visa",
  "residence_permit",
  "vehicle_registration",
  "contract",
  "certificate",
  "other",
]);

const baseHeaders = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, idempotency-key, x-request-id",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Max-Age": "600",
  "X-LifeOS-Version": VERSION,
};

function responseHeaders(requestId: string, extra: Record<string,string> = {}) {
  return { ...baseHeaders, "X-Request-Id": requestId, ...extra };
}
function json(requestId: string, data: unknown, status = 200, extra: Record<string,string> = {}) {
  return new Response(JSON.stringify(data), { status, headers: responseHeaders(requestId, extra) });
}
function errorResponse(requestId: string, code: string, message: string, status: number, details?: unknown) {
  return json(requestId, {
    error: { code, message, ...(details === undefined ? {} : { details }) },
    meta: { requestId, version: VERSION },
  }, status);
}
function normalizePath(pathname: string) {
  const marker = "/lifeos-api";
  const i = pathname.indexOf(marker);
  if (i < 0) return pathname || "/";
  return pathname.slice(i + marker.length) || "/";
}
function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y,m,d] = value.split("-").map(Number);
  const dt = new Date(Date.UTC(y,m-1,d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m-1 && dt.getUTCDate() === d;
}
function isLeadDays(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 1 && Number(value) <= 365;
}
function shiftDays(iso: string, days: number) {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0,10);
}
function daysFromToday(iso: string) {
  const target = new Date(iso + "T00:00:00Z").getTime();
  const now = new Date();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.floor((target - today) / 86400000);
}
function severityFor(days: number) {
  if (days < 0) return "overdue";
  if (days <= 7) return "critical";
  if (days <= 30) return "urgent";
  if (days <= 90) return "important";
  return "normal";
}
function titleFor(documentType: string) {
  return documentType.split("_").map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(" ");
}
function hex(bytes: ArrayBuffer) {
  return Array.from(new Uint8Array(bytes)).map(b => b.toString(16).padStart(2,"0")).join("");
}
async function stableProtectionId(documentType: string, expiryDate: string, leadDays: number, idempotencyKey: string | null) {
  if (!idempotencyKey) return "prot_" + crypto.randomUUID().replaceAll("-","");
  const input = new TextEncoder().encode(
    ["lifeos","expiry",documentType,expiryDate,String(leadDays),idempotencyKey].join(":")
  );
  const digest = await crypto.subtle.digest("SHA-256", input);
  return "prot_" + hex(digest).slice(0,24);
}
async function protectionPayload(
  documentType: string,
  expiryDate: string,
  leadDays: number,
  idempotencyKey: string | null,
  origin: "user_confirmed" | "simulated_example",
) {
  const recommendedActionAt = shiftDays(expiryDate, -leadDays);
  const remainingDays = daysFromToday(expiryDate);
  const protectionId = await stableProtectionId(documentType, expiryDate, leadDays, idempotencyKey);
  const expired = remainingDays < 0;
  const label = titleFor(documentType);

  return {
    protectionId,
    document: {
      type: documentType,
      label,
      facts: [{
        key: "expiry_date",
        originalValue: expiryDate,
        value: expiryDate,
        confidence: 1,
        origin,
        trustClass: origin === "user_confirmed" ? "USER_CONFIRMED" : "SIMULATED_EXAMPLE",
        reviewRequired: false,
        provenance: origin === "user_confirmed"
          ? { source: "request_body", field: "expiryDate" }
          : { source: "demo_fixture", field: "expiryDate" },
      }],
    },
    obligation: {
      type: "EXPIRY_PROTECTION",
      status: expired ? "action_due" : "protected",
      confidence: 1,
      rule: {
        code: "generic_expiry_protection_v1",
        deterministic: true,
        jurisdictional: false,
        legalRuleApplied: false,
        preparationLeadDays: leadDays,
      },
    },
    deadline: {
      dueAt: expiryDate,
      recommendedActionAt,
      daysRemaining: remainingDays,
      severity: severityFor(remainingDays),
      status: expired ? "overdue" : "protected",
      source: "document.expiry_date",
    },
    task: {
      title: expired ? "Review expired " + label.toLowerCase() : "Prepare " + label.toLowerCase(),
      status: expired ? "action_due" : "ready",
      dueAt: recommendedActionAt,
      approvalRequired: false,
    },
    evidence: {
      sourceTraceability: true,
      deadlineBasis: origin === "user_confirmed" ? "user_confirmed_expiry_date" : "demo_fixture",
      authoritativeDeadlineComputedByRule: true,
      legalRuleApplied: false,
      aiExtractionPerformed: false,
    },
  };
}
async function readJson(req: Request) {
  const len = Number(req.headers.get("content-length") || "0");
  if (len > 4096) throw { code:"PAYLOAD_TOO_LARGE", message:"Request body exceeds 4 KB.", status:413 };
  const type = req.headers.get("content-type") || "";
  if (!type.toLowerCase().includes("application/json")) {
    throw { code:"UNSUPPORTED_MEDIA_TYPE", message:"Content-Type must be application/json.", status:415 };
  }
  try { return await req.json(); }
  catch { throw { code:"INVALID_JSON", message:"Request body must be valid JSON.", status:400 }; }
}
function validateIdempotencyKey(value: string | null) {
  if (value && value.length > 200) {
    return { code:"INVALID_IDEMPOTENCY_KEY", message:"Idempotency-Key must be 200 characters or fewer.", status:400 };
  }
  return null;
}

Deno.serve(async (req) => {
  const requestId = req.headers.get("x-request-id")?.slice(0,128) || crypto.randomUUID();
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: responseHeaders(requestId) });

  const url = new URL(req.url);
  const path = normalizePath(url.pathname);

  if (req.method === "GET" && (path === "/" || path === "/health")) {
    return json(requestId, {
      ok: true, service: SERVICE, version: VERSION, environment: "production",
      architecture: "evidence-first", timestamp: new Date().toISOString(),
    });
  }
  if (req.method === "GET" && path === "/readiness") {
    return json(requestId, {
      ready: true,
      service: SERVICE,
      version: VERSION,
      capabilities: {
        api: "ready",
        deterministicRules: "ready",
        provenance: "ready",
        idempotency: "ready",
        genericExpiryProtection: "ready",
        persistence: "not_enabled",
        authentication: "not_enabled",
        ocrExtraction: "not_enabled",
        jurisdictionRules: "not_enabled",
        documentUpload: "not_enabled",
        productionFrontend: "host_pending",
      },
      limitations: [
        "Expiry dates are user-confirmed in this version; OCR extraction is not active.",
        "No user document bytes are accepted by this API version.",
        "No personal data is persisted by this API version.",
        "No jurisdiction-specific legal renewal rule is applied by this API version.",
        "Authentication is intentionally not enabled until LifeOS has an isolated auth project.",
      ],
    });
  }
  if (req.method === "GET" && path === "/version") return json(requestId, { service: SERVICE, version: VERSION });
  if (req.method === "GET" && path === "/v1/document-types") {
    return json(requestId, { data: Array.from(DOCUMENT_TYPES), meta: { requestId, version: VERSION } });
  }
  if (req.method === "GET" && path === "/v1/home") {
    return json(requestId, {
      data: {
        status: { state: "calm", message: "Everything looks calm" },
        nextAction: null,
        upcoming: [],
        coverage: { identity: "not_added", deadlineSafety: "ready", emergencyKit: "needs_setup" },
      },
      meta: { requestId, version: VERSION },
    });
  }
  if (req.method === "GET" && path === "/v1/demo/passport") {
    const expiryDate = url.searchParams.get("expiry") || "2027-06-12";
    if (!isIsoDate(expiryDate)) {
      return errorResponse(requestId, "INVALID_EXPIRY_DATE", "expiry must be a real calendar date in YYYY-MM-DD format.", 400);
    }
    const data = await protectionPayload("passport", expiryDate, 90, req.headers.get("idempotency-key"), "simulated_example");
    return json(requestId, { data, meta: { requestId, version: VERSION, demo: true } });
  }
  if (path === "/v1/protection/passport") {
    if (req.method !== "POST") return errorResponse(requestId, "METHOD_NOT_ALLOWED", "Use POST for this endpoint.", 405);
    let body: any;
    try { body = await readJson(req); }
    catch (e) {
      const err = e as {code:string;message:string;status:number};
      return errorResponse(requestId, err.code, err.message, err.status);
    }
    if (!isIsoDate(body?.expiryDate)) {
      return errorResponse(requestId, "INVALID_EXPIRY_DATE", "expiryDate must be a real calendar date in YYYY-MM-DD format.", 400);
    }
    const idempotencyKey = req.headers.get("idempotency-key")?.trim() || null;
    const idemError = validateIdempotencyKey(idempotencyKey);
    if (idemError) return errorResponse(requestId, idemError.code, idemError.message, idemError.status);
    const leadDays = body?.leadDays === undefined ? DEFAULT_LEAD_DAYS : body.leadDays;
    if (!isLeadDays(leadDays)) {
      return errorResponse(requestId, "INVALID_LEAD_DAYS", "leadDays must be an integer from 1 to 365.", 400);
    }
    const data = await protectionPayload("passport", body.expiryDate, leadDays, idempotencyKey, "user_confirmed");
    return json(requestId, { data, meta: { requestId, version: VERSION, idempotent: Boolean(idempotencyKey) } });
  }
  if (path === "/v1/protection/expiry") {
    if (req.method !== "POST") return errorResponse(requestId, "METHOD_NOT_ALLOWED", "Use POST for this endpoint.", 405);
    let body: any;
    try { body = await readJson(req); }
    catch (e) {
      const err = e as {code:string;message:string;status:number};
      return errorResponse(requestId, err.code, err.message, err.status);
    }
    const documentType = typeof body?.documentType === "string" ? body.documentType.trim() : "";
    if (!DOCUMENT_TYPES.has(documentType)) {
      return errorResponse(requestId, "INVALID_DOCUMENT_TYPE", "documentType is not supported.", 400, { supported: Array.from(DOCUMENT_TYPES) });
    }
    if (!isIsoDate(body?.expiryDate)) {
      return errorResponse(requestId, "INVALID_EXPIRY_DATE", "expiryDate must be a real calendar date in YYYY-MM-DD format.", 400);
    }
    const leadDays = body?.leadDays === undefined ? DEFAULT_LEAD_DAYS : body.leadDays;
    if (!isLeadDays(leadDays)) {
      return errorResponse(requestId, "INVALID_LEAD_DAYS", "leadDays must be an integer from 1 to 365.", 400);
    }
    const idempotencyKey = req.headers.get("idempotency-key")?.trim() || null;
    const idemError = validateIdempotencyKey(idempotencyKey);
    if (idemError) return errorResponse(requestId, idemError.code, idemError.message, idemError.status);
    const data = await protectionPayload(documentType, body.expiryDate, leadDays, idempotencyKey, "user_confirmed");
    return json(requestId, { data, meta: { requestId, version: VERSION, idempotent: Boolean(idempotencyKey) } });
  }
  return errorResponse(requestId, "NOT_FOUND", "Route not found.", 404, { path });
});