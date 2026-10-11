import type { Country, Genus, Language, PreventionAction } from "./types";
import { phrase, tr, type ActionI18n, type Phrase } from "./localize.ts";

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
  US: "https://www.epa.gov/insect-repellents/find-repellent-right-you", // US isn't offered by /api/prevention yet
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

export function preventionContextLine(ctx: Pick<PreventionContext, "recordingGenus" | "regionalGenus">, language: Language = "en"): string {
  const recording = ctx.recordingGenus ? tr(language, "c.recording", { genus: genusName(ctx.recordingGenus) }) : null;
  const region = ctx.regionalGenus ? tr(language, "c.region", { genus: genusName(ctx.regionalGenus) }) : tr(language, "c.regionNone");
  return [recording, region].filter(Boolean).join(" · ");
}

export async function gatherPreventionContext(
  place: Pick<PreventionContext, "country" | "district" | "recordingGenus">,
  sources: { rain: () => Promise<number | null>; regionalGenus: () => Promise<KnownGenus | null> },
): Promise<PreventionContext> {
  const [rainMm, regionalGenus] = await Promise.all([sources.rain(), sources.regionalGenus()]);
  return { ...place, rainMm, regionalGenus };
}

/** An action plus the recipe (`i18n`) for rebuilding its title and reason in another language. */
export type CandidateAction = PreventionAction & { i18n?: ActionI18n };

// The English text comes from en.json so the built-in translations always match it.
function action(id: string, title: Phrase, reason: Phrase, sourceUrl: string, registryUrl?: string): CandidateAction {
  return {
    id,
    title: tr("en", title.key, title.vars),
    reason: tr("en", reason.key, reason.vars),
    sourceUrl,
    ...(registryUrl ? { registryUrl } : {}),
    i18n: { title, reason: [reason] },
  };
}

function specificActions(ctx: PreventionContext, genus: KnownGenus): [CandidateAction, CandidateAction] {
  if (genus === "aedes") {
    const recentRain = ctx.rainMm !== null && ctx.rainMm >= 2;
    return [
      action(
        "aedes-water",
        phrase(recentRain ? "t.scrubRain" : "t.scrubSmall"),
        recentRain ? phrase("r.aedesWaterRain", { mm: Math.round(ctx.rainMm!), district: ctx.district }) : phrase("r.aedesWater"),
        AEDES_LIFE,
      ),
      action("aedes-day", phrase("t.repelDay"), phrase("r.aedesDay"), "https://www.cdc.gov/dengue/transmission/index.html"),
    ];
  }
  if (genus === "culex") {
    return [
      action("culex-water", phrase("t.culexWater"), phrase("r.culexWater"), CULEX_LIFE),
      action("culex-dusk", phrase("t.repelDusk"), phrase("r.culexDusk"), CULEX_LIFE),
    ];
  }
  const water = action("anopheles-water", phrase("t.anophWater"), phrase("r.anophWater"), ANOPHELES_LIFE);
  const evening = action("anopheles-evening", phrase("t.protectDusk"), phrase("r.anophEvening"), ANOPHELES_LIFE);
  return ctx.country === "NG"
    ? [action("treated-net", phrase("t.net"), phrase("r.net"), "https://www.cdc.gov/dpdx/malaria/index.html"), water]
    : [evening, water];
}

function sharedActions(ctx: PreventionContext): [CandidateAction, CandidateAction] {
  return [
    action("screens", phrase("t.screens"), phrase("r.screens"), CDC_HOME),
    action(
      "bti-option", phrase("t.bti"), phrase("r.bti"),
      ctx.country === "BR" ? BRAZIL_LARVICIDES : CDC_LARVICIDES,
      REGISTRY[ctx.country],
    ),
  ];
}

/** Location does not establish that a household has any particular water source. */
export function householdCandidates(ctx: PreventionContext): CandidateAction[] {
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
      phrase(recentRain ? "t.emptyRain" : "t.checkWater"),
      recentRain ? phrase("r.removeWaterRain", { mm: Math.round(ctx.rainMm!), district: ctx.district }) : phrase("r.removeWater"),
      ctx.country === "BR" ? BRAZIL_CONTROL : CDC_HOME,
    ),
    shared[0],
    action("general-repellent", phrase("t.repellent"), phrase("r.repellent"), CDC_BITES),
    shared[1],
  ];
}
