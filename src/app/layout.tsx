import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import { PostHogProvider } from "@/lib/posthog";
import {
  IS_PUBLIC_PRODUCTION,
  PARENT_BRAND,
  PARENT_BRAND_URL,
  SITE_NAME,
  SITE_ORIGIN,
} from "@/lib/site";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_ORIGIN),
  title: {
    default: SITE_NAME,
    // Distinct from the parent brand at kavachiq.com so search results
    // disambiguate the agents / autonomous-assurance product from the
    // backup/recovery product that shares the KavachIQ brand.
    template: `%s | ${SITE_NAME}`,
  },
  description:
    "KavachIQ Autonomous Assurance helps enterprises understand, contain, and recover from high-impact agent-driven changes, starting with Microsoft Entra and Microsoft 365.",
  applicationName: SITE_NAME,
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: SITE_NAME,
    description:
      "Identity-first recovery for high-impact agent-driven changes across Microsoft Entra, Microsoft 365, and connected enterprise systems.",
    siteName: SITE_NAME,
    url: SITE_ORIGIN,
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_NAME,
    description:
      "Identity-first recovery for high-impact agent-driven changes across Microsoft Entra, Microsoft 365, and connected enterprise systems.",
  },
  // Per-environment: only the public production origin is indexable.
  // Staging / preview / dev origins are noindex regardless of any
  // inherited page-level metadata.
  robots: IS_PUBLIC_PRODUCTION
    ? { index: true, follow: true }
    : { index: false, follow: false },
};

// JSON-LD: parent brand (KavachIQ) publishes this product site
// (KavachIQ Autonomous Assurance at agents.kavachiq.com). Kept narrow —
// WebSite + Organization publisher — to support search disambiguation
// between the two KavachIQ products without over-schematizing.
const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: SITE_NAME,
  url: SITE_ORIGIN,
  publisher: {
    "@type": "Organization",
    name: PARENT_BRAND,
    url: PARENT_BRAND_URL,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} antialiased`}
    >
      <body className="min-h-screen flex flex-col bg-bg-primary text-text-primary">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        <PostHogProvider>
          <Navbar />
          <main className="flex-1 pt-16">{children}</main>
          <Footer />
        </PostHogProvider>
      </body>
    </html>
  );
}
