import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";

// ─── Types ───────────────────────────────────────────────────────────────────

interface DemoRequest {
  name: string;
  email: string;
  company: string;
  useCase: string;
}

// ─── Rate limiting (in-memory, per-IP) ───────────────────────────────────────

const rateMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 5; // max requests per window
const RATE_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateMap.get(ip);

  if (!entry || now > entry.resetAt) {
    rateMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return false;
  }

  entry.count++;
  return entry.count > RATE_LIMIT;
}

// ─── Validation ──────────────────────────────────────────────────────────────

function validate(body: unknown): { data?: DemoRequest; errors?: Record<string, string> } {
  if (!body || typeof body !== "object") {
    return { errors: { form: "Invalid request body" } };
  }

  const { name, email, company, useCase } = body as Record<string, unknown>;
  const errors: Record<string, string> = {};

  if (!name || typeof name !== "string" || name.trim().length < 2) {
    errors.name = "Name is required (at least 2 characters)";
  }

  if (!email || typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.email = "A valid work email is required";
  }

  if (typeof company !== "string") {
    errors.company = "Company must be a string";
  }

  if (typeof useCase !== "string") {
    errors.useCase = "Use case must be a string";
  }

  // Honeypot check — if a hidden field is filled, it's a bot
  if ((body as Record<string, unknown>).website) {
    errors.form = "Something went wrong. Please try again.";
  }

  if (Object.keys(errors).length > 0) {
    return { errors };
  }

  return {
    data: {
      name: (name as string).trim(),
      email: (email as string).trim().toLowerCase(),
      company: ((company as string) || "").trim(),
      useCase: ((useCase as string) || "").trim(),
    },
  };
}

// ─── Email via Resend ────────────────────────────────────────────────────────

async function sendEmail(request: DemoRequest, id: string): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const toEmail = process.env.DEMO_REQUEST_TO_EMAIL;

  if (!apiKey || !toEmail) {
    console.warn("[demo-request] RESEND_API_KEY or DEMO_REQUEST_TO_EMAIL not set, skipping email");
    return false;
  }

  const resend = new Resend(apiKey);

  const { error } = await resend.emails.send({
    from: "KavachIQ Demo Requests <demo@kavachiq.com>",
    to: [toEmail],
    replyTo: request.email,
    subject: `Demo request from ${request.name}${request.company ? ` at ${request.company}` : ""}`,
    html: `
      <div style="font-family: system-ui, sans-serif; max-width: 560px;">
        <h2 style="color: #1e293b; margin-bottom: 24px;">New demo request</h2>
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 10px 0; color: #64748b; font-size: 14px; width: 120px; vertical-align: top;">Name</td>
            <td style="padding: 10px 0; color: #0f172a; font-size: 14px;">${escapeHtml(request.name)}</td>
          </tr>
          <tr>
            <td style="padding: 10px 0; color: #64748b; font-size: 14px; vertical-align: top;">Email</td>
            <td style="padding: 10px 0; color: #0f172a; font-size: 14px;">
              <a href="mailto:${escapeHtml(request.email)}" style="color: #0284c7;">${escapeHtml(request.email)}</a>
            </td>
          </tr>
          <tr>
            <td style="padding: 10px 0; color: #64748b; font-size: 14px; vertical-align: top;">Company</td>
            <td style="padding: 10px 0; color: #0f172a; font-size: 14px;">${escapeHtml(request.company) || "—"}</td>
          </tr>
          <tr>
            <td style="padding: 10px 0; color: #64748b; font-size: 14px; vertical-align: top;">Use case</td>
            <td style="padding: 10px 0; color: #0f172a; font-size: 14px;">${escapeHtml(request.useCase) || "—"}</td>
          </tr>
        </table>
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
        <p style="font-size: 12px; color: #94a3b8;">
          Request ID: ${id}<br/>
          Submitted: ${new Date().toISOString()}<br/>
          Reply directly to this email to respond to the requester.
        </p>
      </div>
    `,
  });

  if (error) {
    console.error("[demo-request] Resend error:", error);
    return false;
  }

  return true;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ─── Route handler ───────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    // Rate limiting
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    if (isRateLimited(ip)) {
      return NextResponse.json(
        { success: false, errors: { form: "Too many requests. Please try again in a few minutes." } },
        { status: 429 },
      );
    }

    const body = await req.json();
    const { data, errors } = validate(body);

    if (errors) {
      return NextResponse.json(
        { success: false, errors },
        { status: 422 },
      );
    }

    const id = crypto.randomUUID();
    const emailSent = await sendEmail(data!, id);

    if (!emailSent) {
      console.warn(`[demo-request] Email not sent for ${id}, check RESEND_API_KEY and DEMO_REQUEST_TO_EMAIL`);
    }

    return NextResponse.json(
      {
        success: true,
        message: "Thank you. We will follow up within one business day with a recovery scenario tailored to your environment.",
        id,
      },
      { status: 200 },
    );
  } catch (err) {
    console.error("[demo-request] Unexpected error:", err);
    return NextResponse.json(
      { success: false, errors: { form: "Something went wrong. Please try again." } },
      { status: 500 },
    );
  }
}
