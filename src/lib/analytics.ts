/**
 * Minimal analytics abstraction backed by PostHog.
 *
 * Usage:
 *   import { track } from "@/lib/analytics";
 *   track("cta_click", { page: "homepage", label: "Request a Demo" });
 */

import posthog from "posthog-js";

export type AnalyticsEvent =
  | "cta_click"
  | "form_start"
  | "form_submit"
  | "form_success"
  | "form_error"
  | "page_view";

type EventProperties = Record<string, string | number | boolean>;

export function track(event: AnalyticsEvent, properties?: EventProperties): void {
  try {
    // Development: log to console
    if (process.env.NODE_ENV === "development") {
      console.log(`[analytics] ${event}`, properties ?? "");
    }

    // PostHog: capture if initialized
    if (typeof window !== "undefined" && posthog.__loaded) {
      posthog.capture(event, properties);
    }
  } catch {
    // Analytics should never break the UI
  }
}
