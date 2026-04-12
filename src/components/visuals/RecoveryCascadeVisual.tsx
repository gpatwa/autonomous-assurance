"use client";

import { motion } from "framer-motion";

/**
 * Lightweight cascade visual showing identity-first recovery order:
 * Entra (control plane) → Microsoft 365 (data) → Downstream systems
 *
 * Used in the homepage identity-first recovery section.
 */
export default function RecoveryCascadeVisual() {
  const steps = [
    { label: "Microsoft Entra", sub: "Control plane", y: 30, color: "rgba(56,189,248,0.9)" },
    { label: "Microsoft 365", sub: "Data and collaboration", y: 130, color: "rgba(56,189,248,0.6)" },
    { label: "Downstream systems", sub: "Connected apps and workflows", y: 230, color: "rgba(56,189,248,0.35)" },
  ];

  return (
    <div className="mx-auto w-full max-w-sm">
      <svg viewBox="0 0 320 310" className="w-full h-auto" aria-hidden="true">
        {/* Connecting arrows */}
        {[0, 1].map((i) => (
          <motion.g key={`arrow-${i}`}>
            <motion.line
              x1="160"
              y1={steps[i].y + 55}
              x2="160"
              y2={steps[i + 1].y + 5}
              stroke="rgba(56,189,248,0.2)"
              strokeWidth="2"
              strokeDasharray="4 4"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.6, delay: 0.4 + i * 0.3 }}
            />
            {/* Arrow head */}
            <motion.polygon
              points={`155,${steps[i + 1].y + 2} 160,${steps[i + 1].y + 10} 165,${steps[i + 1].y + 2}`}
              fill="rgba(56,189,248,0.25)"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3, delay: 0.7 + i * 0.3 }}
            />
          </motion.g>
        ))}

        {/* Recovery order label */}
        <motion.text
          x="290"
          y="150"
          textAnchor="middle"
          fill="rgba(148,163,184,0.5)"
          fontSize="10"
          fontFamily="var(--font-geist-sans), system-ui, sans-serif"
          letterSpacing="2"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 1 }}
        >
          RECOVERY
        </motion.text>
        <motion.text
          x="290"
          y="164"
          textAnchor="middle"
          fill="rgba(148,163,184,0.5)"
          fontSize="10"
          fontFamily="var(--font-geist-sans), system-ui, sans-serif"
          letterSpacing="2"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 1 }}
        >
          ORDER
        </motion.text>
        <motion.line
          x1="275" y1="80" x2="275" y2="140"
          stroke="rgba(56,189,248,0.15)" strokeWidth="1"
          initial={{ pathLength: 0 }} animate={{ pathLength: 1 }}
          transition={{ duration: 0.5, delay: 1 }}
        />
        <motion.line
          x1="275" y1="175" x2="275" y2="235"
          stroke="rgba(56,189,248,0.15)" strokeWidth="1"
          initial={{ pathLength: 0 }} animate={{ pathLength: 1 }}
          transition={{ duration: 0.5, delay: 1 }}
        />

        {/* Step boxes */}
        {steps.map((step, i) => (
          <motion.g
            key={step.label}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.15 + i * 0.2 }}
          >
            <rect
              x="30"
              y={step.y}
              width="230"
              height="55"
              rx="14"
              fill="rgba(15,23,42,0.85)"
              stroke={step.color}
              strokeWidth="1"
            />
            {/* Step number pill */}
            <rect
              x="42"
              y={step.y + 10}
              width="20"
              height="20"
              rx="10"
              fill={step.color}
              fillOpacity="0.15"
            />
            <text
              x="52"
              y={step.y + 24}
              textAnchor="middle"
              fill={step.color}
              fontSize="11"
              fontWeight="600"
              fontFamily="var(--font-geist-sans), system-ui, sans-serif"
            >
              {i + 1}
            </text>
            {/* Label */}
            <text
              x="74"
              y={step.y + 25}
              fill="rgba(241,245,249,0.95)"
              fontSize="14"
              fontWeight="600"
              fontFamily="var(--font-geist-sans), system-ui, sans-serif"
            >
              {step.label}
            </text>
            {/* Subtitle */}
            <text
              x="74"
              y={step.y + 43}
              fill="rgba(148,163,184,0.8)"
              fontSize="11"
              fontFamily="var(--font-geist-sans), system-ui, sans-serif"
            >
              {step.sub}
            </text>
          </motion.g>
        ))}
      </svg>
    </div>
  );
}
