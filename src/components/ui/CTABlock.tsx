"use client";

import { FormEvent, useState } from "react";
import { motion } from "framer-motion";
import { fadeUp } from "@/lib/animations";
import Button from "./Button";
import { track } from "@/lib/analytics";

interface CTABlockProps {
  headline: string;
  body: string;
  ctaText: string;
}

type DemoFormState = {
  name: string;
  email: string;
  company: string;
  useCase: string;
};

type FormStatus = "idle" | "submitting" | "success" | "error";

const initialState: DemoFormState = {
  name: "",
  email: "",
  company: "",
  useCase: "",
};

export default function CTABlock({ headline, body, ctaText }: CTABlockProps) {
  const [form, setForm] = useState<DemoFormState>(initialState);
  const [status, setStatus] = useState<FormStatus>("idle");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [serverMessage, setServerMessage] = useState("");
  const [formStarted, setFormStarted] = useState(false);

  function handleFormStart() {
    if (!formStarted) {
      setFormStarted(true);
      track("form_start");
    }
  }

  // Client-side validation
  function validateClient(): boolean {
    const errors: Record<string, string> = {};

    if (!form.name.trim() || form.name.trim().length < 2) {
      errors.name = "Name is required";
    }

    if (!form.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      errors.email = "A valid work email is required";
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!validateClient()) return;

    setStatus("submitting");
    setFieldErrors({});
    track("form_submit");

    try {
      const res = await fetch("/api/demo-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setStatus("success");
        setServerMessage(data.message || "Thank you. We will be in touch.");
        setForm(initialState);
        track("form_success");
      } else {
        setStatus("error");
        if (data.errors) {
          setFieldErrors(data.errors);
        }
        setServerMessage(data.errors?.form || "Something went wrong. Please try again.");
        track("form_error", { reason: "server" });
      }
    } catch {
      setStatus("error");
      setServerMessage("Unable to submit. Please check your connection and try again.");
      track("form_error", { reason: "network" });
    }
  }

  return (
    <section className="relative py-24 sm:py-32 overflow-hidden" id="request-demo">
      <div className="absolute inset-0 bg-gradient-to-b from-bg-primary via-bg-surface to-bg-primary" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(56,189,248,0.08),transparent_70%)]" />

      <motion.div
        variants={fadeUp}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-80px" }}
        className="relative mx-auto grid max-w-6xl gap-10 px-4 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:px-8"
      >
        <div className="max-w-2xl">
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-text-primary">
            {headline}
          </h2>
          <p className="mt-6 text-lg text-text-secondary leading-relaxed">
            {body}
          </p>
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {[
              "Structured incident timeline",
              "Entra and Microsoft 365 recovery context",
              "Blast-radius analysis",
              "Rollback and compensating actions",
            ].map((item) => (
              <div
                key={item}
                className="rounded-2xl border border-border-primary bg-bg-primary/60 px-4 py-4 text-sm text-text-secondary"
              >
                <span className="mr-2 text-accent">&#x2022;</span>
                {item}
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-[28px] border border-border-primary bg-bg-primary/80 p-6 shadow-[0_0_30px_rgba(7,14,30,0.55)] backdrop-blur">
          {status === "success" ? (
            <SuccessState message={serverMessage} onReset={() => setStatus("idle")} />
          ) : (
            <>
              <div className="mb-6 flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-accent/90">
                    Request a demo
                  </p>
                  <h3 className="mt-2 text-2xl font-semibold text-text-primary">
                    Tell us about your environment.
                  </h3>
                </div>
                <div className="hidden rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-text-secondary sm:block">
                  We respond within one business day
                </div>
              </div>

              <form className="space-y-4" onSubmit={handleSubmit} onFocus={handleFormStart} noValidate>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field
                    label="Name"
                    value={form.name}
                    onChange={(value) => setForm((c) => ({ ...c, name: value }))}
                    placeholder="Jane Smith"
                    error={fieldErrors.name}
                    required
                  />
                  <Field
                    label="Work email"
                    type="email"
                    value={form.email}
                    onChange={(value) => setForm((c) => ({ ...c, email: value }))}
                    placeholder="jane@company.com"
                    error={fieldErrors.email}
                    required
                  />
                </div>
                <Field
                  label="Company"
                  value={form.company}
                  onChange={(value) => setForm((c) => ({ ...c, company: value }))}
                  placeholder="Acme Corp"
                  error={fieldErrors.company}
                />
                <div>
                  <label className="mb-2 block text-sm font-medium text-text-primary">
                    Current AI agent use case
                  </label>
                  <textarea
                    value={form.useCase}
                    onChange={(e) => setForm((c) => ({ ...c, useCase: e.target.value }))}
                    placeholder="We want assurance for agent-driven identity changes and Microsoft 365 recovery."
                    className="min-h-32 w-full rounded-2xl border border-border-primary bg-bg-surface/80 px-4 py-3 text-sm text-text-primary placeholder:text-text-muted outline-none transition focus:border-accent"
                  />
                </div>

                {status === "error" && serverMessage && (
                  <p className="rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
                    {serverMessage}
                  </p>
                )}

                <div className="flex flex-col gap-3 pt-2 sm:flex-row">
                  <Button
                    type="submit"
                    variant="primary"
                    size="lg"
                    className="sm:min-w-48"
                    disabled={status === "submitting"}
                  >
                    {status === "submitting" ? (
                      <span className="flex items-center gap-2">
                        <LoadingSpinner />
                        Submitting...
                      </span>
                    ) : (
                      ctaText
                    )}
                  </Button>
                </div>

                <p className="text-sm leading-relaxed text-text-muted">
                  Share your use case and we will follow up with the right conversation.
                </p>
              </form>
            </>
          )}
        </div>
      </motion.div>
    </section>
  );
}

// ─── Success state ───────────────────────────────────────────────────────────

function SuccessState({ message, onReset }: { message: string; onReset: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-accent/10">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-accent">
          <circle cx="12" cy="12" r="10" />
          <path d="m9 12 2 2 4-4" />
        </svg>
      </div>
      <h3 className="text-2xl font-semibold text-text-primary">Request received</h3>
      <p className="mt-3 max-w-sm text-text-secondary leading-relaxed">{message}</p>
      <button
        onClick={onReset}
        className="mt-8 text-sm font-medium text-accent hover:text-accent-hover transition-colors cursor-pointer"
      >
        Submit another request
      </button>
    </div>
  );
}

// ─── Loading spinner ─────────────────────────────────────────────────────────

function LoadingSpinner() {
  return (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

// ─── Field component ─────────────────────────────────────────────────────────

type FieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  required?: boolean;
  error?: string;
};

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  required = false,
  error,
}: FieldProps) {
  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-text-primary">
        {label}
      </label>
      <input
        type={type}
        value={value}
        required={required}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full rounded-2xl border bg-bg-surface/80 px-4 py-3 text-sm text-text-primary placeholder:text-text-muted outline-none transition focus:border-accent ${
          error ? "border-red-500/50" : "border-border-primary"
        }`}
      />
      {error && <p className="mt-1.5 text-xs text-red-400">{error}</p>}
    </div>
  );
}
