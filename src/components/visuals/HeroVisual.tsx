"use client";

import { motion } from "framer-motion";

export default function HeroVisual() {
  const centerX = 300;
  const centerY = 200;

  // Orbiting nodes representing enterprise systems
  const orbitNodes = [
    { angle: 0, radius: 120, label: "Identity", size: 8 },
    { angle: 60, radius: 140, label: "Access", size: 7 },
    { angle: 120, radius: 120, label: "Data", size: 8 },
    { angle: 180, radius: 130, label: "Workflows", size: 7 },
    { angle: 240, radius: 120, label: "Records", size: 7 },
    { angle: 300, radius: 140, label: "Systems", size: 8 },
  ];

  const getPos = (angle: number, radius: number) => ({
    x: centerX + radius * Math.cos((angle * Math.PI) / 180),
    y: centerY + radius * Math.sin((angle * Math.PI) / 180),
  });

  return (
    <div className="relative w-full max-w-lg mx-auto">
      <svg
        viewBox="0 0 600 400"
        className="w-full h-auto"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Orbit rings */}
        {[120, 140].map((r, i) => (
          <motion.circle
            key={`orbit-${i}`}
            cx={centerX}
            cy={centerY}
            r={r}
            fill="none"
            stroke="rgba(56,189,248,0.08)"
            strokeWidth="1"
            strokeDasharray="4 8"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1, delay: 0.2 * i }}
          />
        ))}

        {/* Connection lines from center to nodes */}
        {orbitNodes.map((node, i) => {
          const pos = getPos(node.angle, node.radius);
          return (
            <motion.line
              key={`line-${i}`}
              x1={centerX}
              y1={centerY}
              x2={pos.x}
              y2={pos.y}
              stroke="rgba(56,189,248,0.12)"
              strokeWidth="1"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.8, delay: 0.4 + i * 0.1 }}
            />
          );
        })}

        {/* Cross-connections between adjacent nodes */}
        {orbitNodes.map((node, i) => {
          const nextNode = orbitNodes[(i + 1) % orbitNodes.length];
          const pos1 = getPos(node.angle, node.radius);
          const pos2 = getPos(nextNode.angle, nextNode.radius);
          return (
            <motion.line
              key={`cross-${i}`}
              x1={pos1.x}
              y1={pos1.y}
              x2={pos2.x}
              y2={pos2.y}
              stroke="rgba(56,189,248,0.06)"
              strokeWidth="0.5"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.6, delay: 1 + i * 0.08 }}
            />
          );
        })}

        {/* Center node — the assurance layer */}
        <motion.circle
          cx={centerX}
          cy={centerY}
          r={28}
          fill="rgba(56,189,248,0.08)"
          stroke="rgba(56,189,248,0.3)"
          strokeWidth="1.5"
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        />
        <motion.circle
          cx={centerX}
          cy={centerY}
          r={40}
          fill="none"
          stroke="rgba(56,189,248,0.06)"
          strokeWidth="1"
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: [1, 1.15, 1], opacity: [0.6, 0.2, 0.6] }}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.circle
          cx={centerX}
          cy={centerY}
          r={10}
          fill="#38BDF8"
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ duration: 0.4, delay: 0.3 }}
        />

        {/* Orbit nodes */}
        {orbitNodes.map((node, i) => {
          const pos = getPos(node.angle, node.radius);
          return (
            <motion.g key={`node-${i}`}>
              {/* Glow */}
              <motion.circle
                cx={pos.x}
                cy={pos.y}
                r={node.size * 2.5}
                fill="rgba(56,189,248,0.06)"
                animate={{ scale: [1, 1.2, 1] }}
                transition={{
                  duration: 3,
                  delay: i * 0.4,
                  repeat: Infinity,
                  repeatType: "reverse",
                }}
              />
              {/* Node */}
              <motion.circle
                cx={pos.x}
                cy={pos.y}
                r={node.size}
                fill="rgba(56,189,248,0.2)"
                stroke="rgba(56,189,248,0.5)"
                strokeWidth="1"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ duration: 0.4, delay: 0.5 + i * 0.1 }}
              />
              {/* Label */}
              <motion.text
                x={pos.x}
                y={pos.y + node.size + 14}
                textAnchor="middle"
                fill="rgba(148,163,184,0.6)"
                fontSize="9"
                fontFamily="var(--font-geist-sans), system-ui, sans-serif"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.4, delay: 0.8 + i * 0.1 }}
              >
                {node.label}
              </motion.text>
            </motion.g>
          );
        })}
      </svg>
    </div>
  );
}
