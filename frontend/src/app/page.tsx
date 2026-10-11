import { IntroVideo } from "@/components/IntroVideo";
import { Landing } from "@/components/Landing";

export default function Home() {
  return (
    <>
      {/* First-visit film over the page; fades away to reveal it */}
      <IntroVideo />
      <Landing />
    </>
  );
}
