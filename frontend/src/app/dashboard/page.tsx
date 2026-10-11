import { redirect } from "next/navigation";

// The dashboard now lives on the home page's "For prevention" side (PreventionScreen):
// live risk map, health-team actions and the forecast. Old links land there.
export default function DashboardPage() {
  redirect("/?side=prevention#start");
}
