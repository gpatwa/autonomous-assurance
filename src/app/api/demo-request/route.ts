import { NextRequest, NextResponse } from "next/server";
import { writeFile, readFile, mkdir } from "fs/promises";
import { join } from "path";

// ─── Types ───────────────────────────────────────────────────────────────────

interface DemoRequest {
  name: string;
  email: string;
  company: string;
  useCase: string;
}

interface StoredRequest extends DemoRequest {
  id: string;
  submittedAt: string;
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

// ─── Webhook delivery (optional) ─────────────────────────────────────────────

async function deliverWebhook(request: StoredRequest): Promise<boolean> {
  const webhookUrl = process.env.DEMO_REQUEST_WEBHOOK_URL;
  if (!webhookUrl) return false;

  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
    return res.ok;
  } catch {
    console.error("[demo-request] Webhook delivery failed");
    return false;
  }
}

// ─── Local file storage (fallback) ───────────────────────────────────────────

async function storeLocally(request: StoredRequest): Promise<void> {
  const dir = join(process.cwd(), ".data");
  const file = join(dir, "demo-requests.json");

  try {
    await mkdir(dir, { recursive: true });
  } catch {
    // directory already exists
  }

  let existing: StoredRequest[] = [];
  try {
    const raw = await readFile(file, "utf-8");
    existing = JSON.parse(raw);
  } catch {
    // file doesn't exist yet
  }

  existing.push(request);
  await writeFile(file, JSON.stringify(existing, null, 2));
}

// ─── Route handler ───────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { data, errors } = validate(body);

    if (errors) {
      return NextResponse.json(
        { success: false, errors },
        { status: 422 },
      );
    }

    const stored: StoredRequest = {
      ...data!,
      id: crypto.randomUUID(),
      submittedAt: new Date().toISOString(),
    };

    // Try webhook first, fall back to local storage
    const webhookDelivered = await deliverWebhook(stored);
    if (!webhookDelivered) {
      await storeLocally(stored);
    }

    return NextResponse.json(
      {
        success: true,
        message: "Thank you. We will be in touch within one business day.",
        id: stored.id,
      },
      { status: 200 },
    );
  } catch {
    return NextResponse.json(
      { success: false, errors: { form: "Something went wrong. Please try again." } },
      { status: 500 },
    );
  }
}
