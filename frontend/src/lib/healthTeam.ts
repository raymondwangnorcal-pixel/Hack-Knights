import type { Country, Disease, Genus, PreventionAction } from "./types";

// Actions for a district health team on the "For prevention" side. Same shape as the household
// actions in prevention.ts: the server assembles an approved set grounded on the district's
// numbers, Gemini picks three and may translate them (see healthTeamPrompt.ts), and the rules
// order is the fallback.

type KnownGenus = Exclude<Genus, "other">;

export type HealthTeamContext = {
  country: Country;
  district: string;
  disease: Disease;
  riskScore: number | null;
  rank: number | null;
  districtCount: number | null;
  detections7d: number | null;
  cases14d: number | null;
  /** Weekly forecast for the district's main disease. */
  forecast: { unit: string; week1: number; week4: number; low4: number; high4: number } | null;
  regionalGenus: KnownGenus | null;
  rainMm: number | null;
  /** Any input (case history or detections) is simulated demo data. */
  simulated: boolean;
};

const WHO_LSM = "https://www.who.int/publications/i/item/9789241505604";
const WHO_VECTOR = "https://www.who.int/teams/global-malaria-programme/prevention/vector-control";
const WHO_MALARIA = "https://www.who.int/news-room/fact-sheets/detail/malaria";
const WHO_DENGUE = "https://www.who.int/news-room/fact-sheets/detail/dengue-and-severe-dengue";
const WHO_RISK_COMMS = "https://www.who.int/emergencies/risk-communications";
const BRAZIL_CONTROL = "https://www.gov.br/saude/pt-br/assuntos/saude-de-a-a-z/a/aedes-aegypti/vigilancia-entomologica/vigilancia-entomologica/";
const BRAZIL_LARVICIDES = "https://www.gov.br/saude/pt-br/assuntos/saude-de-a-a-z/a/aedes-aegypti/vigilancia-entomologica/larvicidas";
const CDC_LARVICIDES = "https://www.cdc.gov/mosquitoes/mosquito-control/larvicides.html";
const CDC_WNV = "https://www.cdc.gov/west-nile-virus/";
const REGISTRY: Record<Country, string> = {
  BR: "https://www.gov.br/anvisa/pt-br/sistemas/consulta-a-registro",
  NG: "https://registration.nafdac.gov.ng/Home/",
  US: "https://www.epa.gov/mosquitocontrol",
};

export const DISEASE_NAME: Record<Disease, string> = {
  malaria: "malaria",
  dengue: "dengue",
  zika: "Zika",
  chikungunya: "chikungunya",
  yellow_fever: "yellow fever",
  lymphatic_filariasis: "lymphatic filariasis",
  west_nile: "West Nile",
};

function genusName(genus: KnownGenus): string {
  return genus[0].toUpperCase() + genus.slice(1);
}

export function forecastTrend(ctx: Pick<HealthTeamContext, "forecast">): "rising" | "falling" | "flat" | null {
  const f = ctx.forecast;
  if (!f) return null;
  if (f.week4 > f.week1 * 1.1) return "rising";
  if (f.week4 < f.week1 * 0.9) return "falling";
  return "flat";
}

const recentRain = (ctx: HealthTeamContext) => ctx.rainMm !== null && ctx.rainMm >= 2;

/** "Ikeja ranks 1 of 8 (risk 82/100), with 34 detections in the last 7 days" */
function standing(ctx: HealthTeamContext): string {
  const parts: string[] = [];
  if (ctx.rank !== null && ctx.districtCount !== null && ctx.riskScore !== null) {
    parts.push(`${ctx.district} ranks ${ctx.rank} of ${ctx.districtCount} (risk ${ctx.riskScore}/100)`);
  } else if (ctx.riskScore !== null) {
    parts.push(`${ctx.district} has a risk score of ${ctx.riskScore}/100`);
  }
  if (ctx.detections7d !== null) parts.push(`${ctx.detections7d} detections in the last 7 days`);
  return parts.length ? `${parts.join(", with ")}.` : "";
}

function rainNote(ctx: HealthTeamContext): string {
  return recentRain(ctx) ? ` About ${Math.round(ctx.rainMm!)} mm of rain fell in the last 72 hours, so new breeding sites are likely.` : "";
}

function forecastNote(ctx: HealthTeamContext): string {
  const f = ctx.forecast;
  if (!f) return "";
  const trend = forecastTrend(ctx);
  return ` The forecast ${trend === "rising" ? "rises" : trend === "falling" ? "falls" : "holds"} from about ${Math.round(f.week1)} to ${Math.round(f.week4)} ${f.unit} a week by week 4 (range ${Math.round(f.low4)}–${Math.round(f.high4)}).`;
}

function action(id: string, title: string, reason: string, sourceUrl: string, registryUrl?: string): PreventionAction {
  return { id, title, reason: reason.trim(), sourceUrl, ...(registryUrl ? { registryUrl } : {}) };
}

function communityAlerts(ctx: HealthTeamContext, message: string): PreventionAction {
  return action(
    "community-alerts",
    "Send SMS and radio alerts",
    `Reach households in ${ctx.district} in local languages: ${message}`,
    WHO_RISK_COMMS,
  );
}

function confirmTraps(ctx: HealthTeamContext, trapName: string): PreventionAction {
  return action(
    "confirm-traps",
    `Place ${trapName} to confirm the signal`,
    `Phone detections are opportunistic and skew toward phone owners. A few ${trapName} in ${ctx.district} confirm which mosquitoes are present before larger spending.`,
    ctx.country === "BR" ? BRAZIL_CONTROL : WHO_LSM,
  );
}

function malariaActions(ctx: HealthTeamContext): PreventionAction[] {
  return [
    action(
      "larval-sources",
      recentRain(ctx) ? "Target rain-fed breeding pools" : "Map and drain shallow breeding pools",
      `${standing(ctx)}${rainNote(ctx)} Send teams to drain or fill shallow pools and puddles; larviciding is a supplement where sites are few, fixed and findable.`,
      WHO_LSM,
    ),
    action(
      "net-campaign",
      "Distribute treated nets to top wards",
      `Insecticide-treated nets are the core malaria vector control tool. Prioritise households in ${ctx.district} without a net or with nets older than about three years.`,
      WHO_VECTOR,
    ),
    action(
      "clinic-readiness",
      "Stock rapid tests and ACTs at clinics",
      `Ask clinics in ${ctx.district} to test every fever and hold enough rapid tests and artemisinin-based treatment.${forecastNote(ctx)}`,
      WHO_MALARIA,
    ),
    communityAlerts(ctx, "sleep under a net every night and get tested within a day of any fever."),
    confirmTraps(ctx, "light traps"),
  ];
}

function dengueActions(ctx: HealthTeamContext): PreventionAction[] {
  return [
    action(
      "container-sweep",
      recentRain(ctx) ? "Sweep rain-filled containers house to house" : "Run house-to-house container checks",
      `${standing(ctx)}${rainNote(ctx)} Send field agents to empty, scrub or cover water tanks, buckets, tyres and plant pots, where most breeding happens.`,
      BRAZIL_CONTROL,
    ),
    action(
      "fixed-water-larvicide",
      "Treat water that cannot be removed",
      `Where containers cannot be emptied or covered, field agents can apply a larvicide ${ctx.country === "BR" ? "approved by the Ministry of Health" : "registered locally"}. Use only registered products according to their label for that water site.`,
      ctx.country === "BR" ? BRAZIL_LARVICIDES : CDC_LARVICIDES,
      REGISTRY[ctx.country],
    ),
    action(
      "clinic-readiness",
      "Prepare clinics for a dengue rise",
      `Brief clinics in ${ctx.district} on warning signs and oral and IV fluids, and check test stock.${forecastNote(ctx)}`,
      WHO_DENGUE,
    ),
    communityAlerts(ctx, "empty standing water weekly, use repellent during the day, and seek care for fever with severe pain."),
    confirmTraps(ctx, "ovitraps"),
  ];
}

function westNileActions(ctx: HealthTeamContext): PreventionAction[] {
  return [
    action(
      "catch-basins",
      recentRain(ctx) ? "Treat storm drains after the rain" : "Treat catch basins and storm drains",
      `${standing(ctx)}${rainNote(ctx)} Culex mosquitoes breed in catch basins and stagnant drains; treat them with a registered larvicide according to its label.`,
      CDC_LARVICIDES,
      REGISTRY[ctx.country],
    ),
    action(
      "pool-testing",
      "Expand mosquito pool testing",
      `Trap and test more mosquito pools in ${ctx.district} for West Nile virus to track how far it has spread.${forecastNote(ctx)}`,
      CDC_WNV,
    ),
    action(
      "clinician-advisory",
      "Issue a clinician advisory",
      `Remind clinicians in ${ctx.district} to test for West Nile virus in patients with fever, meningitis or encephalitis, and to report cases promptly.`,
      CDC_WNV,
    ),
    communityAlerts(ctx, "use repellent from dusk to dawn, repair window screens, and empty water from containers."),
    action(
      "adult-control-review",
      "Review targeted adult control",
      "If positive pools keep rising, assess targeted adult mosquito control under your local plan and product labels.",
      CDC_WNV,
      REGISTRY[ctx.country],
    ),
  ];
}

/**
 * Health-team candidates in rules priority order. The first is the district's main vector control
 * action and is mandatory; when the district is high-risk or the forecast is rising, clinic
 * readiness moves up to second.
 */
export function healthTeamCandidates(ctx: HealthTeamContext): PreventionAction[] {
  const list =
    ctx.disease === "west_nile" ? westNileActions(ctx)
    : ctx.disease === "malaria" ? malariaActions(ctx)
    : dengueActions(ctx);
  const urgent = (ctx.riskScore !== null && ctx.riskScore >= 70) || forecastTrend(ctx) === "rising";
  if (!urgent) return list;
  const clinicAt = list.findIndex((a) => a.id === "clinic-readiness" || a.id === "clinician-advisory" || a.id === "pool-testing");
  if (clinicAt <= 1) return list;
  const [clinic] = list.splice(clinicAt, 1);
  list.splice(1, 0, clinic);
  return list;
}

/** One line above the actions: the numbers the plan is grounded on. */
export function healthTeamContextLine(ctx: HealthTeamContext): string {
  const parts: string[] = [];
  if (ctx.riskScore !== null) parts.push(`Risk ${ctx.riskScore}/100`);
  if (ctx.rank !== null && ctx.districtCount !== null) parts.push(`rank ${ctx.rank} of ${ctx.districtCount}`);
  if (ctx.detections7d !== null) parts.push(`${ctx.detections7d} buzzes / 7d`);
  if (ctx.cases14d !== null) parts.push(`${ctx.cases14d} ${ctx.forecast?.unit ?? "cases"} / 14d`);
  const trend = forecastTrend(ctx);
  if (trend) parts.push(`forecast ${trend}`);
  if (ctx.regionalGenus) parts.push(`mostly ${genusName(ctx.regionalGenus)}`);
  if (ctx.simulated) parts.push("simulated data");
  return parts.length ? parts.join(" · ") : `${DISEASE_NAME[ctx.disease]} data unavailable`;
}
