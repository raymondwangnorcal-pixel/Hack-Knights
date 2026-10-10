import type { Country, Genus, PreventionAction } from "./types";

const CDC_BITES = "https://www.cdc.gov/mosquitoes/prevention/";
const CDC_HOME = "https://www.cdc.gov/mosquitoes/mosquito-control/mosquito-control-at-home.html";
const CDC_LARVICIDES = "https://www.cdc.gov/mosquitoes/mosquito-control/larvicides.html";
const AEDES_LIFE = "https://www.cdc.gov/mosquitoes/about/life-cycle-of-aedes-mosquitoes.html";
const ANOPHELES_LIFE = "https://www.cdc.gov/mosquitoes/about/life-cycle-of-anopheles-mosquitoes.html";
const CULEX_LIFE = "https://www.cdc.gov/mosquitoes/about/culex-mosquitoes.html";
const BRAZIL_CONTROL = "https://www.gov.br/saude/pt-br/assuntos/saude-de-a-a-z/a/aedes-aegypti/vigilancia-entomologica/vigilancia-entomologica/";
const BRAZIL_LARVICIDES = "https://www.gov.br/saude/pt-br/assuntos/saude-de-a-a-z/a/aedes-aegypti/vigilancia-entomologica/larvicidas";
const REGISTRY: Record<Country, string> = {
  BR: "https://www.gov.br/anvisa/pt-br/sistemas/consulta-a-registro",
  NG: "https://registration.nafdac.gov.ng/Home/",
};

type KnownGenus = Exclude<Genus, "other">;

export type PreventionContext = {
  country: Country;
  district: string;
  recordingGenus: KnownGenus | null;
  regionalGenus: KnownGenus | null;
  rainMm: number | null;
};

function genusName(genus: KnownGenus): string {
  return genus[0].toUpperCase() + genus.slice(1);
}

export function preventionContextLine(ctx: Pick<PreventionContext, "recordingGenus" | "regionalGenus">): string {
  const recording = ctx.recordingGenus ? `Recording: ${genusName(ctx.recordingGenus)}` : null;
  const region = ctx.regionalGenus ? `Recent district detections: ${genusName(ctx.regionalGenus)}` : "Regional prevalence unavailable";
  return [recording, region].filter(Boolean).join(" · ");
}

export async function gatherPreventionContext(
  place: Pick<PreventionContext, "country" | "district" | "recordingGenus">,
  sources: { rain: () => Promise<number | null>; regionalGenus: () => Promise<KnownGenus | null> },
): Promise<PreventionContext> {
  const [rainMm, regionalGenus] = await Promise.all([sources.rain(), sources.regionalGenus()]);
  return { ...place, rainMm, regionalGenus };
}

function action(id: string, title: string, reason: string, sourceUrl: string, registryUrl?: string): PreventionAction {
  return { id, title, reason, sourceUrl, ...(registryUrl ? { registryUrl } : {}) };
}

function specificActions(ctx: PreventionContext, genus: KnownGenus): [PreventionAction, PreventionAction] {
  if (genus === "aedes") {
    const recentRain = ctx.rainMm !== null && ctx.rainMm >= 2;
    return [
      action(
        "aedes-water",
        recentRain ? "Scrub rain-filled containers" : "Scrub small water containers",
        `Eggs can stick to container walls above the waterline${recentRain ? `; about ${Math.round(ctx.rainMm!)} mm of rain fell near ${ctx.district} in the last 72 hours` : ""}. Empty and scrub any containers you have; emptying water alone may leave eggs behind.`,
        AEDES_LIFE,
      ),
      action("aedes-day", "Use repellent during the day", "These mosquitoes can bite in daylight and at night. Use a locally registered skin repellent according to its label when outdoors.", "https://www.cdc.gov/dengue/transmission/index.html"),
    ];
  }
  if (genus === "culex") {
    return [
      action("culex-water", "Check persistent standing water", "Floating egg rafts form on standing water. Check any drains or pools under your control and remove water where possible.", CULEX_LIFE),
      action("culex-dusk", "Use repellent after dusk", "These mosquitoes are most active from dusk to dawn. Use a locally registered skin repellent according to its label when outdoors.", CULEX_LIFE),
    ];
  }
  const water = action("anopheles-water", "Check shallow standing water", "Eggs may be laid near shallow water or marshy edges. If your property has shallow pools, drain them; leave public water treatment to health workers.", ANOPHELES_LIFE);
  const evening = action("anopheles-evening", "Protect yourself after dusk", "Many of these mosquitoes bite in the late evening or at night. Use a locally registered skin repellent according to its label when outdoors.", ANOPHELES_LIFE);
  return ctx.country === "NG"
    ? [action("treated-net", "Sleep under a treated net", "Many bite in the late evening or at night. In malaria-risk areas, an insecticide-treated net helps protect you while sleeping.", "https://www.cdc.gov/dpdx/malaria/index.html"), water]
    : [evening, water];
}

function sharedActions(ctx: PreventionContext): [PreventionAction, PreventionAction] {
  return [
    action("screens", "Check window and door screens", "Repair gaps and keep doors closed so mosquitoes cannot enter the home.", CDC_HOME),
    action(
      "bti-option", "Ask about Bti for fixed water",
      "If you have water that cannot be emptied or covered, Bti is a mosquito larvicide to ask a local health worker about. It does not kill biting adults. Check that a specific product is registered locally and its label allows that exact water site before use.",
      ctx.country === "BR" ? BRAZIL_LARVICIDES : CDC_LARVICIDES,
      REGISTRY[ctx.country],
    ),
  ];
}

/** Location does not establish that a household has any particular water source. */
export function householdCandidates(ctx: PreventionContext): PreventionAction[] {
  const shared = sharedActions(ctx);
  if (ctx.recordingGenus && ctx.regionalGenus && ctx.recordingGenus !== ctx.regionalGenus) {
    return [
      specificActions(ctx, ctx.recordingGenus)[0],
      specificActions(ctx, ctx.regionalGenus)[0],
      ...shared,
    ];
  }
  const genus = ctx.recordingGenus ?? ctx.regionalGenus;
  if (genus) return [...specificActions(ctx, genus), ...shared];
  const recentRain = ctx.rainMm !== null && ctx.rainMm >= 2;
  return [
    action(
      "remove-water",
      recentRain ? "Empty rain-filled containers" : "Check for standing water",
      recentRain
        ? `About ${Math.round(ctx.rainMm!)} mm of rain fell near ${ctx.district} in the last 72 hours. Check containers, gutters, and pool covers; empty and scrub any that hold water.`
        : "Check containers, gutters, and pool covers. Empty and scrub any water-holding items at least weekly.",
      ctx.country === "BR" ? BRAZIL_CONTROL : CDC_HOME,
    ),
    shared[0],
    action("general-repellent", "Use a registered repellent", "Choose a locally registered skin repellent and follow its label, especially when spending time outdoors.", CDC_BITES),
    shared[1],
  ];
}
