import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "@fontsource/bebas-neue";
import "@fontsource/ibm-plex-mono/500.css";
import "@fontsource/roboto-condensed/300.css";
import "@fontsource/roboto-condensed/400.css";
import "@fontsource/roboto-condensed/700.css";
import "@fontsource/roboto-condensed/700-italic.css";
import "./globals.css";

// Self-hosted Geist (no Google Fonts fetch at build time).
const geistSans = GeistSans;
const geistMono = GeistMono;

export const metadata: Metadata = {
  title: "Mozzy",
  description: "Mozzy: Shazam for mosquitoes. Identify disease-carrying species by their buzz.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
