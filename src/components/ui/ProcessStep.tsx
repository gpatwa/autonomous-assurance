"use client";

import { motion } from "framer-motion";
import { fadeUp } from "@/lib/animations";

interface ProcessStepProps {
  step: number;
  title: string;
  description: string;
  isLast?: boolean;
}

export default function ProcessStep({
  step,
  title,
  description,
  isLast = false,
}: ProcessStepProps) {
  return (
    <motion.div variants={fadeUp} className="relative flex gap-6">
      {/* Step indicator + connector */}
      <div className="flex flex-col items-center">
        <div className="flex h-10 w-10 items-center justify-center rounded-full border border-accent/40 bg-accent/10 text-accent text-sm font-bold flex-shrink-0">
          {step}
        </div>
        {!isLast && (
          <div className="w-px flex-1 bg-gradient-to-b from-accent/30 to-transparent mt-3" />
        )}
      </div>

      {/* Content */}
      <div className={isLast ? "pb-0" : "pb-12"}>
        <h3 className="text-xl font-semibold text-text-primary mb-2">
          {title}
        </h3>
        <p className="text-text-secondary leading-relaxed">{description}</p>
      </div>
    </motion.div>
  );
}
