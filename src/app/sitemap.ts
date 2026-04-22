import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";

/**
 * sitemap.xml generation.
 *
 * Narrow by design: only the two indexable product surfaces on this
 * site — home and platform. `/demo` is intentionally omitted (it's a
 * noindex interactive walkthrough, not an evergreen landing page).
 *
 * URLs are emitted against the resolved site origin (see `src/lib/site.ts`),
 * so a staging deploy would emit staging URLs — but `robots.ts` already
 * disallows crawling on non-public origins, so the sitemap there is
 * effectively unreachable.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    {
      url: siteUrl("/"),
      lastModified: now,
      changeFrequency: "monthly",
      priority: 1,
    },
    {
      url: siteUrl("/platform"),
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.8,
    },
  ];
}
