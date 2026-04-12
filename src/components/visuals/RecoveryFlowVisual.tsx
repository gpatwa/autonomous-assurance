"use client";

import { motion } from "framer-motion";

const steps = [
  {
    title: "Agent Action",
    subtitle: "Workflow session",
    x: 40,
    y: 56,
    accent: "bg-cyan-400/10 text-cyan-300",
  },
  {
    title: "Entra Change",
    subtitle: "Users, groups, access",
    x: 268,
    y: 56,
    accent: "bg-sky-400/10 text-sky-300",
  },
  {
    title: "M365 Impact",
    subtitle: "Files, mail, permissions",
    x: 496,
    y: 56,
    accent: "bg-blue-400/10 text-blue-300",
  },
  {
    title: "Blast Radius",
    subtitle: "Apps and downstream risk",
    x: 268,
    y: 244,
    accent: "bg-amber-400/10 text-amber-300",
  },
  {
    title: "Guided Recovery",
    subtitle: "Rollback and compensation",
    x: 496,
    y: 244,
    accent: "bg-emerald-400/10 text-emerald-300",
  },
];

const connections = [
  { x1: 198, y1: 110, x2: 268, y2: 110 },
  { x1: 426, y1: 110, x2: 496, y2: 110 },
  { x1: 382, y1: 168, x2: 382, y2: 244 },
  { x1: 426, y1: 298, x2: 496, y2: 298 },
];

export default function RecoveryFlowVisual() {
  return (
    <div className="relative overflow-hidden rounded-[28px] border border-border-primary bg-[linear-gradient(180deg,rgba(17,24,39,0.94),rgba(10,14,26,0.96))] p-6 shadow-[0_0_40px_rgba(8,15,35,0.4)]">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(56,189,248,0.08),transparent_45%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,rgba(16,185,129,0.06),transparent_40%)]" />

      <div className="relative mb-5 flex items-center justify-between gap-4 border-b border-white/5 pb-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-accent/90">
            Incident to recovery flow
          </p>
          <h3 className="mt-2 text-xl font-semibold text-text-primary">
            See agent-driven change move through identity, data, and recovery.
          </h3>
        </div>
        <div className="hidden rounded-full border border-accent/15 bg-accent/10 px-3 py-1 text-xs text-text-secondary sm:block">
          Entra → Microsoft 365 → downstream systems
        </div>
      </div>

      <svg viewBox="0 0 700 380" className="relative w-full h-auto" aria-hidden="true">
        <defs>
          <linearGradient id="flowLine" x1="0%" x2="100%" y1="0%" y2="0%">
            <stop offset="0%" stopColor="rgba(56,189,248,0.14)" />
            <stop offset="100%" stopColor="rgba(16,185,129,0.22)" />
          </linearGradient>
        </defs>

        {connections.map((line, index) => (
          <motion.line
            key={index}
            x1={line.x1}
            y1={line.y1}
            x2={line.x2}
            y2={line.y2}
            stroke="url(#flowLine)"
            strokeWidth="2"
            strokeLinecap="round"
            initial={{ pathLength: 0, opacity: 0.25 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ duration: 0.9, delay: 0.25 + index * 0.12, ease: "easeOut" }}
          />
        ))}

        <motion.path
          d="M158 130 C 205 170, 245 190, 300 224"
          fill="none"
          stroke="rgba(245,158,11,0.15)"
          strokeWidth="1.5"
          strokeDasharray="5 7"
          initial={{ pathLength: 0, opacity: 0.2 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 1.1, delay: 0.9 }}
        />

        {steps.map((step, index) => {
          const boxWidth = index === 3 ? 180 : 158;
          const boxHeight = 108;
          return (
            <motion.g
              key={step.title}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.15 + index * 0.12 }}
            >
              <rect
                x={step.x}
                y={step.y}
                width={boxWidth}
                height={boxHeight}
                rx="20"
                fill="rgba(15,23,42,0.88)"
                stroke="rgba(148,163,184,0.12)"
              />
              <rect
                x={step.x + 16}
                y={step.y + 16}
                width="52"
                height="26"
                rx="13"
                fill="rgba(56,189,248,0.10)"
                stroke="rgba(56,189,248,0.18)"
              />
              <text
                x={step.x + 42}
                y={step.y + 33}
                textAnchor="middle"
                fill="rgba(186,230,253,0.96)"
                fontSize="10"
                fontFamily="var(--font-geist-sans), system-ui, sans-serif"
                letterSpacing="1.2"
              >
                {`STEP 0${index + 1}`}
              </text>
              <text
                x={step.x + 16}
                y={step.y + 64}
                fill="rgba(241,245,249,0.98)"
                fontSize="18"
                fontWeight="600"
                fontFamily="var(--font-geist-sans), system-ui, sans-serif"
              >
                {step.title}
              </text>
              <text
                x={step.x + 16}
                y={step.y + 88}
                fill="rgba(148,163,184,0.95)"
                fontSize="12"
                fontFamily="var(--font-geist-sans), system-ui, sans-serif"
              >
                {step.subtitle}
              </text>
            </motion.g>
          );
        })}

        <motion.circle
          cx="382"
          cy="244"
          r="8"
          fill="rgba(245,158,11,0.85)"
          initial={{ scale: 0 }}
          animate={{ scale: [1, 1.2, 1] }}
          transition={{ duration: 2.8, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.circle
          cx="610"
          cy="298"
          r="8"
          fill="rgba(16,185,129,0.9)"
          initial={{ scale: 0 }}
          animate={{ scale: [1, 1.2, 1] }}
          transition={{ duration: 2.8, repeat: Infinity, delay: 0.6, ease: "easeInOut" }}
        />
      </svg>
    </div>
  );
}
