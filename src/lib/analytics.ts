/**
 * Minimal analytics abstraction.
 *
 * Tracks events to console in development. In production, swap the
 * `send` implementation to route events to your provider:
 *   - Azure Application Insights
 *   - PostHog
 *   - Plausible
 *   - Google Analytics
 *
 * Usage:
 *   import { track } from "@/lib/analytics";
 *   track("cta_click", { page: "homepage", label: "Request a Demo" });
 */

export type AnalyticsEvent =
  | "cta_click"
  | "form_start"
  | "form_submit"
  | "form_success"
  | "form_error"
  | "page_view";

type EventProperties = Record<string, string | number | boolean>;

function send(event: AnalyticsEvent, properties?: EventProperties): void {
  // ── Development: log to console ─────────────────────────────────────────
  if (process.env.NODE_ENV === "development") {
    console.log(`[analytics] ${event}`, properties ?? "");
    return;
  }

  // ── Production: replace with your provider ──────────────────────────────
  // Example for Azure Application Insights:
  //   if (typeof window !== "undefined" && window.appInsights) {
  //     window.appInsights.trackEvent({ name: event, properties });
  //   }
  //
  // Example for PostHog:
  //   if (typeof window !== "undefined" && window.posthog) {
  //     window.posthog.capture(event, properties);
  //   }
  //
  // Example for Plausible:
  //   if (typeof window !== "undefined" && window.plausible) {
  //     window.plausible(event, { props: properties });
  //   }

  // Fallback: no-op in production until a provider is configured
}

export function track(event: AnalyticsEvent, properties?: EventProperties): void {
  try {
    send(event, properties);
  } catch {
    // Analytics should never break the UI
  }
}
