"use client";

import { FormEvent, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { fadeUp } from "@/lib/animations";
import Button from "./Button";

interface CTABlockProps {
  headline: string;
  body: string;
  ctaText: string;
  ctaHref?: string;
}

type DemoFormState = {
  name: string;
  email: string;
  company: string;
  useCase: string;
};

const initialState: DemoFormState = {
  name: "",
  email: "",
  company: "",
  useCase: "",
};

export default function CTABlock({ headline, body, ctaText }: CTABlockProps) {
  const [form, setForm] = useState<DemoFormState>(initialState);
  const [copied, setCopied] = useState(false);

  const requestSummary = useMemo(
    () =>
      [
        "Demo request — KavachIQ Autonomous Assurance",
        `Name: ${form.name || ""}`,
        `Email: ${form.email || ""}`,
        `Company: ${form.company || ""}`,
        `Use case: ${form.useCase || ""}`,
      ].join("\n"),
    [form],
  );

  const mailtoHref = useMemo(() => {
    const subject = encodeURIComponent("Demo request — KavachIQ Autonomous Assurance");
    const bodyText = encodeURIComponent(`${requestSummary}\n\nPlease contact me about a demo.`);
    return `mailto:?subject=${subject}&body=${bodyText}`;
  }, [requestSummary]);

  async function handleCopy() {
    await navigator.clipboard.writeText(requestSummary);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    window.location.href = mailtoHref;
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
              "Entra and M365 recovery context",
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

          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Name"
                value={form.name}
                onChange={(value) => setForm((current) => ({ ...current, name: value }))}
                placeholder="Jane Smith"
                required
              />
              <Field
                label="Work email"
                type="email"
                value={form.email}
                onChange={(value) => setForm((current) => ({ ...current, email: value }))}
                placeholder="jane@company.com"
                required
              />
            </div>
            <Field
              label="Company"
              value={form.company}
              onChange={(value) => setForm((current) => ({ ...current, company: value }))}
              placeholder="Acme Corp"
            />
            <div>
              <label className="mb-2 block text-sm font-medium text-text-primary">
                Current AI agent use case
              </label>
              <textarea
                value={form.useCase}
                onChange={(event) =>
                  setForm((current) => ({ ...current, useCase: event.target.value }))
                }
                placeholder="We want assurance for agent-driven identity changes and Microsoft 365 recovery."
                className="min-h-32 w-full rounded-2xl border border-border-primary bg-bg-surface/80 px-4 py-3 text-sm text-text-primary placeholder:text-text-muted outline-none transition focus:border-accent"
              />
            </div>

            <div className="flex flex-col gap-3 pt-2 sm:flex-row">
              <Button type="submit" variant="primary" size="lg" className="sm:min-w-48">
                {ctaText}
              </Button>
              <button
                type="button"
                onClick={handleCopy}
                className="inline-flex items-center justify-center rounded-lg border border-border-primary px-6 py-4 text-sm font-medium text-text-primary transition hover:border-accent hover:text-accent cursor-pointer"
              >
                {copied ? "Copied request" : "Copy request details"}
              </button>
            </div>

            <p className="text-sm leading-relaxed text-text-muted">
              Your request opens a prefilled email so you can send it directly to our team. We typically respond within one business day.
            </p>
          </form>
        </div>
      </motion.div>
    </section>
  );
}

type FieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  required?: boolean;
};

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  required = false,
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
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full rounded-2xl border border-border-primary bg-bg-surface/80 px-4 py-3 text-sm text-text-primary placeholder:text-text-muted outline-none transition focus:border-accent"
      />
    </div>
  );
}
