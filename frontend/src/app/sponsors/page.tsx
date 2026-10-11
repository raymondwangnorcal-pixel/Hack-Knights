import { redirect } from "next/navigation";

// Sponsors now live on the landing page, under "For prevention".
export default function SponsorsPage() {
  redirect("/?side=prevention#sponsors");
}
