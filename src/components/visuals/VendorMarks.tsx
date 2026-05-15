"use client";

/**
 * VendorMarks — monochrome wordmark/glyph treatments for vendor attribution
 * on the consensus wall (Section 3).
 *
 * Design intent: legally-safe brand attribution for direct quotes. Each mark
 * combines a simple geometric glyph (evocative, not trademarked) with the
 * vendor's name in clean typography. Monochrome — adapts to surrounding text.
 *
 * No vendor logo SVG paths are copied from official press kits. The glyphs
 * are generic geometric shapes that contextually pair with each quote.
 */

type Wordmark = "microsoft" | "salesforce" | "servicenow" | "anthropic" | "gartner";

const LABEL: Record<Wordmark, string> = {
  microsoft: "Microsoft",
  salesforce: "Salesforce",
  servicenow: "ServiceNow",
  anthropic: "Anthropic",
  gartner: "Gartner",
};

export default function VendorMark({ name }: { name: Wordmark }) {
  return (
    <span className="inline-flex w-fit items-center gap-2 rounded-md border border-border-primary bg-bg-primary/40 px-2.5 py-1 text-[11px] font-semibold tracking-tight text-text-secondary">
      <Glyph name={name} />
      {LABEL[name]}
    </span>
  );
}

/**
 * Glyph — small monochrome geometric mark per vendor.
 * Drawn at 12x12 to sit cleanly next to the wordmark text.
 */
function Glyph({ name }: { name: Wordmark }) {
  const common = {
    width: 12,
    height: 12,
    viewBox: "0 0 12 12",
    fill: "currentColor",
    "aria-hidden": true,
  } as const;

  switch (name) {
    // 2×2 grid — generic enterprise/cloud signal
    case "microsoft":
      return (
        <svg {...common}>
          <rect x="0" y="0" width="5" height="5" rx="0.5" opacity="0.85" />
          <rect x="7" y="0" width="5" height="5" rx="0.5" opacity="0.55" />
          <rect x="0" y="7" width="5" height="5" rx="0.5" opacity="0.55" />
          <rect x="7" y="7" width="5" height="5" rx="0.5" opacity="0.85" />
        </svg>
      );

    // Cloud shape (rounded multi-bump silhouette)
    case "salesforce":
      return (
        <svg {...common}>
          <path d="M3 7a2 2 0 0 1 .4-3.96 3 3 0 0 1 5.6.46A2.5 2.5 0 1 1 9 9H3a1 1 0 0 1 0-2z" />
        </svg>
      );

    // Forward-leaning chevron (workflow signal)
    case "servicenow":
      return (
        <svg {...common}>
          <path d="M2 2l4 4-4 4 1.4 1.4L9 6 3.4 0.6z" />
        </svg>
      );

    // Concentric ring (alignment / safety signal)
    case "anthropic":
      return (
        <svg {...common} fill="none" stroke="currentColor" strokeWidth="1.4">
          <circle cx="6" cy="6" r="4.5" />
          <circle cx="6" cy="6" r="1.5" fill="currentColor" stroke="none" />
        </svg>
      );

    // Diamond / quadrant (analyst signal)
    case "gartner":
      return (
        <svg {...common} fill="none" stroke="currentColor" strokeWidth="1.2">
          <path d="M6 1L11 6 6 11 1 6Z" />
        </svg>
      );
  }
}
