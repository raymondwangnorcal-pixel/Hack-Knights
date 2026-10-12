import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "@fontsource/bebas-neue";
import "@fontsource/ibm-plex-mono/500.css";
import "@fontsource/roboto-condensed/300.css";
import "@fontsource/roboto-condensed/400.css";
import "@fontsource/roboto-condensed/700.css";
import "@fontsource/roboto-condensed/700-italic.css";
import "./globals.css";
import { SmoothScroll } from "@/components/SmoothScroll";

// Self-hosted Geist (no Google Fonts fetch at build time).
const geistSans = GeistSans;
const geistMono = GeistMono;

const SITE_DESCRIPTION =
  "Culicid: Shazam for mosquitoes. Identify disease-carrying species by their buzz.";

// Link previews (Discord, iMessage, Slack, X) need absolute image URLs. Vercel sets
// VERCEL_PROJECT_PRODUCTION_URL to the production domain; locally we fall back to localhost.
// The preview image itself is app/opengraph-image.jpg + app/twitter-image.jpg (file convention).
const SITE_URL = process.env.VERCEL_PROJECT_PRODUCTION_URL
  ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  : `http://localhost:${process.env.PORT ?? 3000}`;

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Culicid",
  description: SITE_DESCRIPTION,
  openGraph: {
    type: "website",
    siteName: "Culicid",
    title: "Culicid · Detect locally. Prevent globally.",
    description: SITE_DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: "Culicid · Detect locally. Prevent globally.",
    description: SITE_DESCRIPTION,
  },
};

// Colors the side strip of Discord embeds to match the site's orange.
export const viewport: Viewport = {
  themeColor: "#f07636",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <SmoothScroll />
        {children}
      </body>
    </html>
  );
}
