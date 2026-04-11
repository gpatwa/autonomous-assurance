"use client";

import { motion } from "framer-motion";
import { fadeUp } from "@/lib/animations";
import Button from "./Button";

interface CTABlockProps {
  headline: string;
  body: string;
  ctaText: string;
  ctaHref?: string;
}

export default function CTABlock({
  headline,
  body,
  ctaText,
  ctaHref = "#request-demo",
}: CTABlockProps) {
  return (
    <section className="relative py-24 sm:py-32 overflow-hidden" id="request-demo">
      {/* Subtle gradient background */}
      <div className="absolute inset-0 bg-gradient-to-b from-bg-primary via-bg-surface to-bg-primary" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(56,189,248,0.08),transparent_70%)]" />

      <motion.div
        variants={fadeUp}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-80px" }}
        className="relative mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 text-center"
      >
        <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-text-primary">
          {headline}
        </h2>
        <p className="mt-6 text-lg text-text-secondary leading-relaxed">
          {body}
        </p>
        <div className="mt-10">
          <Button variant="primary" size="lg" href={ctaHref}>
            {ctaText}
          </Button>
        </div>
      </motion.div>
    </section>
  );
}
