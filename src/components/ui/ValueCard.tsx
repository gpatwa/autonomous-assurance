"use client";

import { type ReactNode } from "react";
import { motion } from "framer-motion";
import { fadeUp } from "@/lib/animations";

interface ValueCardProps {
  icon: ReactNode;
  title: string;
  description: string;
}

export default function ValueCard({ icon, title, description }: ValueCardProps) {
  return (
    <motion.div
      variants={fadeUp}
      className="group relative rounded-xl border border-border-primary bg-bg-surface p-8 transition-all duration-300 hover:border-accent/30 hover:shadow-[0_0_30px_rgba(56,189,248,0.08)]"
    >
      <div className="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-lg bg-accent/10 text-accent">
        {icon}
      </div>
      <h3 className="text-xl font-semibold text-text-primary mb-3">{title}</h3>
      <p className="text-text-secondary leading-relaxed">{description}</p>
    </motion.div>
  );
}
