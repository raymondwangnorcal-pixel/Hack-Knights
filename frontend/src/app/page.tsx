import { IntroGate } from "@/components/IntroGate";
import { Landing } from "@/components/Landing";

export default function Home() {
  return (
    <>
      {/* First-visit Enter screen; the page ripples in behind it when pressed */}
      <IntroGate />
      <Landing />
    </>
  );
}
