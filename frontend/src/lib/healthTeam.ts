import type { Country, Disease, Genus, Language, PreventionAction } from "./types";
import { phrase, tr, type ActionI18n, type Phrase } from "./localize.ts";

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

/** "Ikeja ranks 1 of 8 (risk 82/100), with 34 detections in the last 7 days." */
function standing(ctx: HealthTeamContext): Phrase | null {
  const det = ctx.detections7d;
  if (ctx.rank !== null && ctx.districtCount !== null && ctx.riskScore !== null) {
    const vars = { district: ctx.district, rank: ctx.rank, count: ctx.districtCount, score: ctx.riskScore };
    return det !== null ? phrase("h.standRankDet", { ...vars, detections: det }) : phrase("h.standRank", vars);
  }
  if (ctx.riskScore !== null) {
    const vars = { district: ctx.district, score: ctx.riskScore };
    return det !== null ? phrase("h.standScoreDet", { ...vars, detections: det }) : phrase("h.standScore", vars);
  }
  return det !== null ? phrase("h.standDet", { detections: det }) : null;
}

function rainNote(ctx: HealthTeamContext): Phrase | null {
  return recentRain(ctx) ? phrase("h.rain", { mm: Math.round(ctx.rainMm!) }) : null;
}

function forecastNote(ctx: HealthTeamContext): Phrase | null {
  const f = ctx.forecast;
  if (!f) return null;
  const trend = forecastTrend(ctx);
  const unit = /pool/i.test(f.unit) ? "Pools" : "Cases";
  const kind = trend === "flat" ? "Flat" : trend === "rising" ? "Rise" : "Fall";
  return phrase(`h.fc${kind}${unit}`, {
    w1: Math.round(f.week1), w4: Math.round(f.week4), low: Math.round(f.low4), high: Math.round(f.high4),
  });
}

type CandidateAction = PreventionAction & { i18n?: ActionI18n };

// English comes from en.json so the built-in translations always match it. A reason may be built
// from several sentences (standing, rain, the action itself, forecast); missing ones are skipped.
function action(id: string, title: Phrase, reason: (Phrase | null)[], sourceUrl: string, registryUrl?: string): CandidateAction {
  const parts = reason.filter((p): p is Phrase => p !== null);
  return {
    id,
    title: tr("en", title.key, title.vars),
    reason: parts.map((p) => tr("en", p.key, p.vars)).join(" ").trim(),
    sourceUrl,
    ...(registryUrl ? { registryUrl } : {}),
    i18n: { title, reason: parts },
  };
}

function communityAlerts(ctx: HealthTeamContext, key: string): CandidateAction {
  return action("community-alerts", phrase("t.alerts"), [phrase(key, { district: ctx.district })], WHO_RISK_COMMS);
}

function confirmTraps(ctx: HealthTeamContext, traps: "lightTraps" | "ovitraps"): CandidateAction {
  return action(
    "confirm-traps",
    phrase(`t.${traps}`),
    [phrase(`h.${traps}`, { district: ctx.district })],
    ctx.country === "BR" ? BRAZIL_CONTROL : WHO_LSM,
  );
}

function malariaActions(ctx: HealthTeamContext): CandidateAction[] {
  const d = { district: ctx.district };
  return [
    action(
      "larval-sources",
      phrase(recentRain(ctx) ? "t.rainPools" : "t.drainPools"),
      [standing(ctx), rainNote(ctx), phrase("h.larval")],
      WHO_LSM,
    ),
    action("net-campaign", phrase("t.netCampaign"), [phrase("h.netCampaign", d)], WHO_VECTOR),
    action("clinic-readiness", phrase("t.clinicMalaria"), [phrase("h.clinicMalaria", d), forecastNote(ctx)], WHO_MALARIA),
    communityAlerts(ctx, "h.alertsMalaria"),
    confirmTraps(ctx, "lightTraps"),
  ];
}

function dengueActions(ctx: HealthTeamContext): CandidateAction[] {
  const d = { district: ctx.district };
  return [
    action(
      "container-sweep",
      phrase(recentRain(ctx) ? "t.sweepRain" : "t.sweep"),
      [standing(ctx), rainNote(ctx), phrase("h.sweep")],
      BRAZIL_CONTROL,
    ),
    action(
      "fixed-water-larvicide",
      phrase("t.fixedWater"),
      [phrase(ctx.country === "BR" ? "h.fixedWaterBR" : "h.fixedWater")],
      ctx.country === "BR" ? BRAZIL_LARVICIDES : CDC_LARVICIDES,
      REGISTRY[ctx.country],
    ),
    action("clinic-readiness", phrase("t.clinicDengue"), [phrase("h.clinicDengue", d), forecastNote(ctx)], WHO_DENGUE),
    communityAlerts(ctx, "h.alertsDengue"),
    confirmTraps(ctx, "ovitraps"),
  ];
}

function westNileActions(ctx: HealthTeamContext): CandidateAction[] {
  const d = { district: ctx.district };
  return [
    action(
      "catch-basins",
      phrase(recentRain(ctx) ? "t.drainsRain" : "t.drains"),
      [standing(ctx), rainNote(ctx), phrase("h.drains")],
      CDC_LARVICIDES,
      REGISTRY[ctx.country],
    ),
    action("pool-testing", phrase("t.poolTesting"), [phrase("h.poolTesting", d), forecastNote(ctx)], CDC_WNV),
    action("clinician-advisory", phrase("t.clinician"), [phrase("h.clinician", d)], CDC_WNV),
    communityAlerts(ctx, "h.alertsWnv"),
    action("adult-control-review", phrase("t.adultControl"), [phrase("h.adultControl")], CDC_WNV, REGISTRY[ctx.country]),
  ];
}

/**
 * Health-team candidates in rules priority order. The first is the district's main vector control
 * action and is mandatory; when the district is high-risk or the forecast is rising, clinic
 * readiness moves up to second.
 */
export function healthTeamCandidates(ctx: HealthTeamContext): CandidateAction[] {
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

/** The numbers behind the plan as labeled cells for the Action plan card. */
export function healthTeamStats(ctx: HealthTeamContext, language: Language = "en"): { label: string; value: string }[] {
  const t = (key: string, vars?: Record<string, string | number>) => tr(language, key, vars);
  const pools = /pool/i.test(ctx.forecast?.unit ?? "");
  const cells: { label: string; value: string }[] = [];
  if (ctx.riskScore !== null) cells.push({ label: t("s.risk"), value: `${ctx.riskScore}/100` });
  if (ctx.rank !== null && ctx.districtCount !== null) cells.push({ label: t("s.rank"), value: t("s.rankValue", { rank: ctx.rank, count: ctx.districtCount }) });
  if (ctx.detections7d !== null) cells.push({ label: t("s.detections"), value: t("s.detectionsValue", { detections: ctx.detections7d }) });
  // Zero usually means no case reports for the district yet, not zero cases, so it is left out.
  if (ctx.cases14d) cells.push({ label: t("s.reported"), value: t(pools ? "s.reportedPools" : "s.reportedCases", { n: ctx.cases14d }) });
  const trend = forecastTrend(ctx);
  if (trend) cells.push({ label: t("s.cases"), value: t(trend === "rising" ? "s.rising" : trend === "falling" ? "s.falling" : "s.steady") });
  if (ctx.regionalGenus) cells.push({ label: t("s.mosquito"), value: t("s.mostly", { genus: genusName(ctx.regionalGenus) }) });
  return cells;
}

/** One short line above the actions: the numbers the plan is grounded on,
 *  e.g. "Risk 70/100 · #1 of 20 · 42 detections in 7 days · Cases rising · Mostly Anopheles". */
export function healthTeamContextLine(ctx: HealthTeamContext, language: Language = "en"): string {
  const t = (key: string, vars?: Record<string, string | number>) => tr(language, key, vars);
  const pools = /pool/i.test(ctx.forecast?.unit ?? "");
  const parts: string[] = [];
  if (ctx.riskScore !== null) parts.push(t("c.risk", { score: ctx.riskScore }));
  if (ctx.rank !== null && ctx.districtCount !== null) parts.push(t("s.rankValue", { rank: ctx.rank, count: ctx.districtCount }));
  if (ctx.detections7d !== null) parts.push(t("c.detections", { detections: ctx.detections7d }));
  // Zero usually means no case reports for the district yet, not zero cases, so it is left out.
  if (ctx.cases14d) parts.push(t(pools ? "s.reportedPools" : "s.reportedCases", { n: ctx.cases14d }));
  const trend = forecastTrend(ctx);
  if (trend) parts.push(t(trend === "flat" ? "c.casesSteady" : trend === "rising" ? "c.casesRising" : "c.casesFalling"));
  if (ctx.regionalGenus) parts.push(t("s.mostly", { genus: genusName(ctx.regionalGenus) }));
  return parts.length ? parts.join(" · ") : `${DISEASE_NAME[ctx.disease]} data unavailable`;
}
