import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "KavachIQ Autonomous Assurance";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OGImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "flex-start",
          padding: "80px",
          backgroundColor: "#0A0E1A",
          backgroundImage:
            "radial-gradient(ellipse at top right, rgba(56,189,248,0.1), transparent 60%)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            marginBottom: "40px",
          }}
        >
          <span
            style={{
              fontSize: "36px",
              fontWeight: 700,
              color: "#F1F5F9",
              letterSpacing: "-0.02em",
            }}
          >
            Kavach
          </span>
          <span
            style={{
              fontSize: "36px",
              fontWeight: 700,
              color: "#38BDF8",
              letterSpacing: "-0.02em",
            }}
          >
            IQ
          </span>
        </div>

        <div
          style={{
            fontSize: "64px",
            fontWeight: 700,
            color: "#F1F5F9",
            lineHeight: 1.1,
            letterSpacing: "-0.03em",
            maxWidth: "900px",
          }}
        >
          Deploy AI agents with{" "}
          <span style={{ color: "#38BDF8" }}>confidence</span>
        </div>

        <div
          style={{
            fontSize: "24px",
            color: "#94A3B8",
            marginTop: "24px",
            maxWidth: "700px",
            lineHeight: 1.5,
          }}
        >
          Autonomous Assurance for identity, Microsoft 365, and connected
          enterprise systems
        </div>

        <div
          style={{
            position: "absolute",
            bottom: "60px",
            left: "80px",
            display: "flex",
            alignItems: "center",
            gap: "12px",
          }}
        >
          <div
            style={{
              width: "8px",
              height: "8px",
              borderRadius: "50%",
              backgroundColor: "#38BDF8",
            }}
          />
          <span style={{ fontSize: "16px", color: "#64748B" }}>
            kavachiq.com
          </span>
        </div>
      </div>
    ),
    { ...size },
  );
}
