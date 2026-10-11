import type { Metadata } from "next";
import { SponsorTracks } from "@/components/SponsorTracks";

export const metadata: Metadata = {
  title: "Mozzy · Sponsor tracks",
  description: "How Mozzy uses Tiger Data, Snowflake, Gemini and ElevenLabs.",
};

export default function SponsorsPage() {
  return <SponsorTracks />;
}
