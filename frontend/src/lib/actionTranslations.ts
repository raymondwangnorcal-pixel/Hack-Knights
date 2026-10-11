import type { Language, PreventionAction } from "./types";

// Built-in translations of prevention action titles, used when Gemini can't translate (no key,
// quota exhausted, or an invalid reply). Keyed by the exact English title from prevention.ts and
// healthTeam.ts; a title missing here simply stays in English. Only titles are covered: they are
// what the card shows first and what the voice reads. Reasons stay in English until Gemini is back.
// Actions with a regulator link (chemical products) are never translated here, matching the
// Gemini path. Machine-quality translations, not professionally reviewed. Yoruba is not included.

type Titles = Record<string, string>;

const PT: Titles = {
  "Scrub rain-filled containers": "Esfregue recipientes com água da chuva",
  "Scrub small water containers": "Esfregue pequenos recipientes com água",
  "Use repellent during the day": "Use repelente durante o dia",
  "Check persistent standing water": "Verifique água parada persistente",
  "Use repellent after dusk": "Use repelente após o anoitecer",
  "Check shallow standing water": "Verifique água parada rasa",
  "Protect yourself after dusk": "Proteja-se após o anoitecer",
  "Sleep under a treated net": "Durma sob um mosquiteiro tratado",
  "Check window and door screens": "Verifique as telas de janelas e portas",
  "Empty rain-filled containers": "Esvazie recipientes com água da chuva",
  "Check for standing water": "Procure água parada",
  "Use a registered repellent": "Use um repelente registrado",
  "Target rain-fed breeding pools": "Priorize criadouros formados pela chuva",
  "Map and drain shallow breeding pools": "Mapeie e drene criadouros rasos",
  "Distribute treated nets to top wards": "Distribua mosquiteiros tratados nas áreas prioritárias",
  "Stock rapid tests and ACTs at clinics": "Abasteça as clínicas com testes rápidos e ACTs",
  "Send SMS and radio alerts": "Envie alertas por SMS e rádio",
  "Place light traps to confirm the signal": "Instale armadilhas luminosas para confirmar o sinal",
  "Place ovitraps to confirm the signal": "Instale ovitrampas para confirmar o sinal",
  "Sweep rain-filled containers house to house": "Vistorie de casa em casa os recipientes com água da chuva",
  "Run house-to-house container checks": "Faça vistorias de recipientes de casa em casa",
  "Prepare clinics for a dengue rise": "Prepare as clínicas para um aumento da dengue",
  "Expand mosquito pool testing": "Amplie a testagem de lotes de mosquitos",
  "Issue a clinician advisory": "Emita um alerta aos médicos",
};

const ES: Titles = {
  "Scrub rain-filled containers": "Friegue los recipientes con agua de lluvia",
  "Scrub small water containers": "Friegue los recipientes pequeños con agua",
  "Use repellent during the day": "Use repelente durante el día",
  "Check persistent standing water": "Revise el agua estancada persistente",
  "Use repellent after dusk": "Use repelente después del anochecer",
  "Check shallow standing water": "Revise el agua estancada poco profunda",
  "Protect yourself after dusk": "Protéjase después del anochecer",
  "Sleep under a treated net": "Duerma bajo un mosquitero tratado",
  "Check window and door screens": "Revise las mallas de ventanas y puertas",
  "Empty rain-filled containers": "Vacíe los recipientes con agua de lluvia",
  "Check for standing water": "Busque agua estancada",
  "Use a registered repellent": "Use un repelente registrado",
  "Target rain-fed breeding pools": "Priorice los criaderos formados por la lluvia",
  "Map and drain shallow breeding pools": "Ubique y drene los criaderos poco profundos",
  "Distribute treated nets to top wards": "Distribuya mosquiteros tratados en las zonas prioritarias",
  "Stock rapid tests and ACTs at clinics": "Abastezca las clínicas con pruebas rápidas y TCA",
  "Send SMS and radio alerts": "Envíe alertas por SMS y radio",
  "Place light traps to confirm the signal": "Coloque trampas de luz para confirmar la señal",
  "Place ovitraps to confirm the signal": "Coloque ovitrampas para confirmar la señal",
  "Sweep rain-filled containers house to house": "Revise casa por casa los recipientes con agua de lluvia",
  "Run house-to-house container checks": "Revise los recipientes casa por casa",
  "Prepare clinics for a dengue rise": "Prepare las clínicas para un aumento del dengue",
  "Expand mosquito pool testing": "Amplíe el análisis de lotes de mosquitos",
  "Issue a clinician advisory": "Emita un aviso para el personal médico",
};

const FR: Titles = {
  "Scrub rain-filled containers": "Frottez les récipients remplis d'eau de pluie",
  "Scrub small water containers": "Frottez les petits récipients d'eau",
  "Use repellent during the day": "Utilisez un répulsif pendant la journée",
  "Check persistent standing water": "Vérifiez les eaux stagnantes persistantes",
  "Use repellent after dusk": "Utilisez un répulsif après le crépuscule",
  "Check shallow standing water": "Vérifiez les eaux stagnantes peu profondes",
  "Protect yourself after dusk": "Protégez-vous après le crépuscule",
  "Sleep under a treated net": "Dormez sous une moustiquaire imprégnée",
  "Check window and door screens": "Vérifiez les moustiquaires des fenêtres et des portes",
  "Empty rain-filled containers": "Videz les récipients remplis d'eau de pluie",
  "Check for standing water": "Recherchez les eaux stagnantes",
  "Use a registered repellent": "Utilisez un répulsif homologué",
  "Target rain-fed breeding pools": "Ciblez les gîtes larvaires créés par la pluie",
  "Map and drain shallow breeding pools": "Repérez et drainez les gîtes peu profonds",
  "Distribute treated nets to top wards": "Distribuez des moustiquaires imprégnées dans les quartiers prioritaires",
  "Stock rapid tests and ACTs at clinics": "Approvisionnez les centres de santé en tests rapides et CTA",
  "Send SMS and radio alerts": "Envoyez des alertes par SMS et radio",
  "Place light traps to confirm the signal": "Posez des pièges lumineux pour confirmer le signal",
  "Place ovitraps to confirm the signal": "Posez des pièges pondoirs pour confirmer le signal",
  "Sweep rain-filled containers house to house": "Inspectez maison par maison les récipients d'eau de pluie",
  "Run house-to-house container checks": "Inspectez les récipients maison par maison",
  "Prepare clinics for a dengue rise": "Préparez les centres de santé à une hausse de la dengue",
  "Expand mosquito pool testing": "Étendez les tests sur les lots de moustiques",
  "Issue a clinician advisory": "Diffusez une alerte aux médecins",
};

const ZH: Titles = {
  "Scrub rain-filled containers": "刷洗积满雨水的容器",
  "Scrub small water containers": "刷洗小型盛水容器",
  "Use repellent during the day": "白天使用驱蚊剂",
  "Check persistent standing water": "检查长期积水",
  "Use repellent after dusk": "黄昏后使用驱蚊剂",
  "Check shallow standing water": "检查浅层积水",
  "Protect yourself after dusk": "黄昏后做好防护",
  "Sleep under a treated net": "睡在药浸蚊帐里",
  "Check window and door screens": "检查门窗纱网",
  "Empty rain-filled containers": "倒空积满雨水的容器",
  "Check for standing water": "检查积水",
  "Use a registered repellent": "使用已注册的驱蚊剂",
  "Target rain-fed breeding pools": "重点处理雨后形成的孳生地",
  "Map and drain shallow breeding pools": "排查并排干浅水孳生地",
  "Distribute treated nets to top wards": "向高风险社区发放药浸蚊帐",
  "Stock rapid tests and ACTs at clinics": "为诊所储备快速检测试剂和青蒿素联合疗法药物",
  "Send SMS and radio alerts": "发送短信和广播警报",
  "Place light traps to confirm the signal": "放置诱蚊灯以确认信号",
  "Place ovitraps to confirm the signal": "放置诱卵器以确认信号",
  "Sweep rain-filled containers house to house": "逐户清理积满雨水的容器",
  "Run house-to-house container checks": "开展逐户容器检查",
  "Prepare clinics for a dengue rise": "让诊所为登革热病例增加做好准备",
  "Expand mosquito pool testing": "扩大蚊虫样本检测",
  "Issue a clinician advisory": "向临床医生发布提示",
};

const YUE: Titles = {
  "Scrub rain-filled containers": "擦洗積滿雨水嘅容器",
  "Scrub small water containers": "擦洗細嘅盛水容器",
  "Use repellent during the day": "日間用驅蚊劑",
  "Check persistent standing water": "檢查長期積水",
  "Use repellent after dusk": "黃昏之後用驅蚊劑",
  "Check shallow standing water": "檢查淺水積水",
  "Protect yourself after dusk": "黃昏之後做好防護",
  "Sleep under a treated net": "瞓喺浸過藥嘅蚊帳入面",
  "Check window and door screens": "檢查門窗紗網",
  "Empty rain-filled containers": "倒清積滿雨水嘅容器",
  "Check for standing water": "檢查有冇積水",
  "Use a registered repellent": "用已註冊嘅驅蚊劑",
  "Target rain-fed breeding pools": "集中處理雨後形成嘅滋生地",
  "Map and drain shallow breeding pools": "搵出並排走淺水滋生地",
  "Distribute treated nets to top wards": "向高風險社區派發浸藥蚊帳",
  "Stock rapid tests and ACTs at clinics": "幫診所備定快速測試同青蒿素聯合療法藥物",
  "Send SMS and radio alerts": "發送短訊同電台警報",
  "Place light traps to confirm the signal": "放置誘蚊燈確認訊號",
  "Place ovitraps to confirm the signal": "放置誘卵器確認訊號",
  "Sweep rain-filled containers house to house": "逐戶清理積滿雨水嘅容器",
  "Run house-to-house container checks": "逐戶檢查容器",
  "Prepare clinics for a dengue rise": "幫診所準備應對登革熱個案上升",
  "Expand mosquito pool testing": "擴大蚊樣本測試",
  "Issue a clinician advisory": "向醫生發出提示",
};

const HA: Titles = {
  "Scrub rain-filled containers": "Goge kwantenonin da ruwan sama ya cika",
  "Scrub small water containers": "Goge ƙananan kwantenonin ruwa",
  "Use repellent during the day": "Yi amfani da maganin sauro da rana",
  "Check persistent standing water": "Duba ruwan da ya daɗe a kwance",
  "Use repellent after dusk": "Yi amfani da maganin sauro bayan magariba",
  "Check shallow standing water": "Duba ruwa mara zurfi da ke kwance",
  "Protect yourself after dusk": "Kare kai bayan magariba",
  "Sleep under a treated net": "Kwana cikin gidan sauro mai magani",
  "Check window and door screens": "Duba ragar tagogi da ƙofofi",
  "Empty rain-filled containers": "Zubar da ruwan sama daga kwantenoni",
  "Check for standing water": "Nemi ruwan da ke kwance",
  "Use a registered repellent": "Yi amfani da maganin sauro mai rajista",
  "Target rain-fed breeding pools": "Mai da hankali kan kududdufan da ruwan sama ya samar",
  "Map and drain shallow breeding pools": "Gano da tsiyaye kududdufai marasa zurfi",
  "Distribute treated nets to top wards": "Raba gidajen sauro masu magani a unguwannin da suka fi haɗari",
  "Stock rapid tests and ACTs at clinics": "Tara gwaje-gwajen gaggawa da magungunan ACT a asibitoci",
  "Send SMS and radio alerts": "Aika saƙonnin SMS da sanarwar rediyo",
  "Place light traps to confirm the signal": "Saka tarkon haske don tabbatar da alamar",
  "Place ovitraps to confirm the signal": "Saka tarkon ƙwai don tabbatar da alamar",
  "Sweep rain-filled containers house to house": "Bi gida-gida don duba kwantenonin ruwan sama",
  "Run house-to-house container checks": "Bi gida-gida don duba kwantenoni",
  "Prepare clinics for a dengue rise": "Shirya asibitoci don ƙaruwar zazzaɓin dengue",
  "Expand mosquito pool testing": "Faɗaɗa gwajin samfuran sauro",
  "Issue a clinician advisory": "Aika sanarwa ga likitoci",
};

const TITLES: Partial<Record<Language, Titles>> = { pt: PT, es: ES, fr: FR, zh: ZH, yue: YUE, ha: HA };

/**
 * Translates action titles with the built-in table. Translated actions are marked with the target
 * `language`; anything left in English is marked "en". `language` in the result is the target when
 * at least one title was translated, else "en".
 */
export function withBuiltinTitles(actions: PreventionAction[], language: Language): { actions: PreventionAction[]; language: Language } {
  if (language === "en") return { actions, language: "en" };
  const table = TITLES[language];
  let any = false;
  const out = actions.map((a) => {
    const title = !a.registryUrl ? table?.[a.title] : undefined;
    if (!title) return { ...a, language: "en" as const };
    any = true;
    return { ...a, title, englishTitle: a.title, language };
  });
  return { actions: out, language: any ? language : "en" };
}
