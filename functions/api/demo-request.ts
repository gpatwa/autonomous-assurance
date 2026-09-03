interface DemoRequest {
  name: string;
  email: string;
  company: string;
  useCase: string;
}

interface DemoRequestEnv {
  RESEND_API_KEY?: string;
  DEMO_REQUEST_TO_EMAIL?: string;
}

type PagesContext = {
  request: Request;
  env: DemoRequestEnv;
};

type RateEntry = { count: number; resetAt: number };

const rateMap = new Map<string, RateEntry>();
const RATE_LIMIT = 5;
const RATE_WINDOW_MS = 15 * 60 * 1000;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateMap.get(ip);

  if (!entry || now > entry.resetAt) {
    rateMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return false;
  }

  entry.count += 1;
  return entry.count > RATE_LIMIT;
}

function validate(value: unknown): { data?: DemoRequest; errors?: Record<string, string> } {
  if (!value || typeof value !== "object") {
    return { errors: { form: "Invalid request body" } };
  }

  const body = value as Record<string, unknown>;
  const errors: Record<string, string> = {};
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const company = typeof body.company === "string" ? body.company.trim() : "";
  const useCase = typeof body.useCase === "string" ? body.useCase.trim() : "";

  if (name.length < 2 || name.length > 160) errors.name = "Name is required";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 320) {
    errors.email = "A valid work email is required";
  }
  if (company.length > 160) errors.company = "Company is too long";
  if (useCase.length > 4000) errors.useCase = "Use case is too long";
  if (body.website) errors.form = "Something went wrong. Please try again.";

  if (Object.keys(errors).length > 0) return { errors };
  return { data: { name, email, company, useCase } };
}

async function sendEmail(env: DemoRequestEnv, request: DemoRequest, id: string): Promise<boolean> {
  if (!env.RESEND_API_KEY) return false;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "KavachIQ Demo Requests <demo@kavachiq.com>",
      to: [env.DEMO_REQUEST_TO_EMAIL ?? "team@kavachiq.com"],
      reply_to: request.email,
      subject: `Demo request from ${request.name}${request.company ? ` at ${request.company}` : ""}`,
      html: `<div style="font-family:system-ui,sans-serif;max-width:560px"><h2>New demo request</h2><p><strong>Name:</strong> ${escapeHtml(request.name)}</p><p><strong>Email:</strong> ${escapeHtml(request.email)}</p><p><strong>Company:</strong> ${escapeHtml(request.company) || "—"}</p><p><strong>Use case:</strong> ${escapeHtml(request.useCase) || "—"}</p><hr><p style="color:#64748b;font-size:12px">Request ID: ${id}</p></div>`,
    }),
  });

  return response.ok;
}

export async function onRequestPost({ request, env }: PagesContext): Promise<Response> {
  const ip = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (isRateLimited(ip)) {
    return json({ success: false, errors: { form: "Too many requests. Please try again in a few minutes." } }, 429);
  }

  try {
    const { data, errors } = validate(await request.json());
    if (errors) return json({ success: false, errors }, 422);

    const id = crypto.randomUUID();
    const emailSent = await sendEmail(env, data!, id);
    if (!emailSent) {
      console.error(`[demo-request] Resend delivery failed for ${id}`);
      return json({ success: false, errors: { form: "Something went wrong. Please try again." } }, 502);
    }

    return json({
      success: true,
      message: "Thank you. We will follow up within one business day with a recovery scenario tailored to your environment.",
      id,
    });
  } catch (error) {
    console.error("[demo-request] Unexpected error", error);
    return json({ success: false, errors: { form: "Something went wrong. Please try again." } }, 500);
  }
}
