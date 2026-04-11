"use client";

import { type ReactNode } from "react";
import { motion } from "framer-motion";
import { fadeUp } from "@/lib/animations";

interface CapabilityCardProps {
  icon: ReactNode;
  title: string;
  description: string;
}

export default function CapabilityCard({
  icon,
  title,
  description,
}: CapabilityCardProps) {
  return (
    <motion.div
      variants={fadeUp}
      className="group relative flex gap-5 rounded-xl border border-border-primary bg-bg-surface p-6 transition-all duration-300 hover:border-accent/30 hover:shadow-[0_0_24px_rgba(56,189,248,0.06)]"
    >
      <div className="flex-shrink-0 h-10 w-10 rounded-lg bg-accent/10 flex items-center justify-center text-accent">
        {icon}
      </div>
      <div>
        <h3 className="text-lg font-semibold text-text-primary mb-2">
          {title}
        </h3>
        <p className="text-sm text-text-secondary leading-relaxed">
          {description}
        </p>
      </div>
    </motion.div>
  );
}
