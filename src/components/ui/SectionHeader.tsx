"use client";

import { motion } from "framer-motion";
import { fadeUp } from "@/lib/animations";

interface SectionHeaderProps {
  label?: string;
  title: string;
  subtitle?: string;
  align?: "left" | "center";
}

export default function SectionHeader({
  label,
  title,
  subtitle,
  align = "center",
}: SectionHeaderProps) {
  const alignment = align === "center" ? "text-center mx-auto" : "text-left";

  return (
    <motion.div
      variants={fadeUp}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-80px" }}
      className={`max-w-3xl mb-16 ${alignment}`}
    >
      {label && (
        <span className="inline-block text-xs font-semibold uppercase tracking-[0.2em] text-accent mb-4">
          {label}
        </span>
      )}
      <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-text-primary">
        {title}
      </h2>
      {subtitle && (
        <p className="mt-6 text-lg text-text-secondary leading-relaxed">
          {subtitle}
        </p>
      )}
    </motion.div>
  );
}
