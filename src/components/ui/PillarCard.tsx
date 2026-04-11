"use client";

import { type ReactNode } from "react";
import { motion } from "framer-motion";
import { fadeUp } from "@/lib/animations";

interface PillarCardProps {
  icon: ReactNode;
  title: string;
  description: string;
  bullets?: string[];
}

export default function PillarCard({
  icon,
  title,
  description,
  bullets,
}: PillarCardProps) {
  return (
    <motion.div
      variants={fadeUp}
      className="group relative rounded-xl border border-border-primary bg-bg-surface p-8 transition-all duration-300 hover:border-accent/30 hover:shadow-[0_0_30px_rgba(56,189,248,0.08)]"
    >
      {/* Accent top border */}
      <div className="absolute top-0 left-8 right-8 h-px bg-gradient-to-r from-transparent via-accent/40 to-transparent" />

      <div className="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-lg bg-accent/10 text-accent">
        {icon}
      </div>
      <h3 className="text-xl font-semibold text-text-primary mb-3">{title}</h3>
      <p className="text-text-secondary leading-relaxed mb-5">{description}</p>
      {bullets && bullets.length > 0 && (
        <ul className="space-y-2.5">
          {bullets.map((bullet, i) => (
            <li
              key={i}
              className="flex items-start gap-3 text-sm text-text-secondary"
            >
              <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-accent flex-shrink-0" />
              {bullet}
            </li>
          ))}
        </ul>
      )}
    </motion.div>
  );
}
