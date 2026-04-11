"use client";

import { motion } from "framer-motion";

interface NodeGraphProps {
  className?: string;
}

const nodes = [
  { x: 80, y: 60, r: 4, delay: 0 },
  { x: 200, y: 40, r: 5, delay: 0.2 },
  { x: 320, y: 80, r: 4, delay: 0.4 },
  { x: 160, y: 140, r: 6, delay: 0.1 },
  { x: 280, y: 160, r: 4, delay: 0.3 },
  { x: 400, y: 100, r: 5, delay: 0.5 },
  { x: 120, y: 200, r: 4, delay: 0.6 },
  { x: 360, y: 220, r: 5, delay: 0.2 },
  { x: 240, y: 240, r: 4, delay: 0.4 },
];

const edges = [
  [0, 1], [1, 2], [0, 3], [3, 4], [2, 5],
  [3, 6], [4, 7], [6, 8], [8, 7], [1, 3], [4, 5],
];

export default function NodeGraph({ className = "" }: NodeGraphProps) {
  return (
    <svg
      viewBox="0 0 480 280"
      className={`w-full h-auto ${className}`}
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Edges */}
      {edges.map(([from, to], i) => (
        <motion.line
          key={`edge-${i}`}
          x1={nodes[from].x}
          y1={nodes[from].y}
          x2={nodes[to].x}
          y2={nodes[to].y}
          stroke="rgba(56,189,248,0.15)"
          strokeWidth="1"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 1.2, delay: 0.3 + i * 0.08, ease: "easeOut" }}
        />
      ))}

      {/* Nodes */}
      {nodes.map((node, i) => (
        <motion.g key={`node-${i}`}>
          {/* Glow */}
          <motion.circle
            cx={node.x}
            cy={node.y}
            r={node.r * 3}
            fill="rgba(56,189,248,0.06)"
            initial={{ scale: 0 }}
            animate={{ scale: [1, 1.3, 1] }}
            transition={{
              duration: 3,
              delay: node.delay,
              repeat: Infinity,
              repeatType: "reverse",
            }}
          />
          {/* Core */}
          <motion.circle
            cx={node.x}
            cy={node.y}
            r={node.r}
            fill="#38BDF8"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.5, delay: node.delay }}
          />
        </motion.g>
      ))}
    </svg>
  );
}
