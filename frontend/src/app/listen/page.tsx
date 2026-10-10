import { redirect } from "next/navigation";

// Listening now lives on the landing page, right under the intro.
export default function ListenPage() {
  redirect("/?side=you#start");
}
