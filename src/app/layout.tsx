import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import { PostHogProvider } from "@/lib/posthog";
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
  metadataBase: new URL("https://kavachiq.com"),
  title: {
    default: "KavachIQ Autonomous Assurance",
    template: "%s | KavachIQ",
  },
  description:
    "KavachIQ gives enterprises the confidence to deploy AI agents in production by making autonomous changes observable, recoverable, and governable.",
  openGraph: {
    title: "KavachIQ Autonomous Assurance",
    description:
      "Assurance for AI-driven enterprise operations across Microsoft Entra, Microsoft 365, and connected enterprise systems.",
    siteName: "KavachIQ",
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "KavachIQ Autonomous Assurance",
    description:
      "Assurance for AI-driven enterprise operations across Microsoft Entra, Microsoft 365, and connected enterprise systems.",
  },
  robots: {
    index: true,
    follow: true,
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
        <PostHogProvider>
          <Navbar />
          <main className="flex-1 pt-16">{children}</main>
          <Footer />
        </PostHogProvider>
      </body>
    </html>
  );
}
