// Types, data loading (index + per-entity cube, cached), merge, formatting, palette, personas.

export interface NV { name: string; value: number }
export interface Output { title: string; journal: string; attention: number; doi: string }
export interface MentionItem { title: string; outlet: string; channel: string; attention: number }
export interface Network { nodes: NV[]; edges: { source: string; target: string; value: number }[] }

// mention-based metrics (react to the impact / mention year)
export interface MenCell {
  mentions: number; attention: number; policy: number; patents: number; news: number;
  channels_ns: NV[]; countries_ns: NV[]; sentiment: NV[]; timeline: NV[];
  stakeholders: NV[]; map_metrics: Record<string, NV[]>;
}
// publication-based metrics for one publication year, holding the per-impact-year cells
export interface PubCell {
  publications: number; oa_count: number; citations: number;
  sdg: NV[]; oa_mix: NV[]; pub_mix: NV[]; network: Network;
  top_journals: { name: string; mentions: number }[]; top_outputs: Output[];
  contributors: NV[];  // top contributing institutions (by research output)
  country_detail: Record<string, Record<string, MentionItem[]>>;  // metric -> country -> items
  impact: Record<string, MenCell>;
}
export type Cube = Record<string, PubCell>;   // keyed by publication year

// merged view the UI renders
export interface Kpis {
  publications: number; oa_count: number; citations: number;
  mentions: number; attention: number; policy: number; patents: number; news: number;
}
export interface Profile {
  kpis: Kpis;
  channels_ns: NV[]; countries_ns: NV[]; sentiment: NV[]; timeline: NV[]; stakeholders: NV[];
  map_metrics: Record<string, NV[]>;
  sdg: NV[]; oa_mix: NV[]; pub_mix: NV[]; network: Network;
  top_journals: { name: string; mentions: number }[]; top_outputs: Output[];
  contributors: NV[];  // top contributing institutions (by research output)
  country_detail: Record<string, Record<string, MentionItem[]>>;  // metric -> country -> items
}

export interface EntityMeta { id: string; name: string; full?: string; mentions: number; publications: number }
export interface PersonaIndex {
  label: string; entityLabel: string; entities: EntityMeta[]; default: string;
  icon: string; blurb: string; accent: string; accentDark: string; grad: [string, string];
}
export interface PortalIndex {
  meta: {
    generated: string; brand: string; product: string; pubYears: number[]; impactYears: number[];
    sources: Record<string, { table: string; rows: number }>; notes: string[];
  };
  personas: Record<string, PersonaIndex>;
}
export type PersonaKey = "consortia" | "societies";
const DIR: Record<PersonaKey, string> = { consortia: "con", societies: "soc" };
const IMPACT_ALL = ["2024", "2025", "2026", "undated"];

// ---------- loading ----------
export async function loadIndex(): Promise<PortalIndex> {
  const res = await fetch(`${import.meta.env.BASE_URL}data/index.json`);
  if (!res.ok) throw new Error("failed to load index.json");
  return res.json();
}
const cache = new Map<string, Cube | null>();
export async function loadEntity(persona: PersonaKey, id: string): Promise<Cube | null> {
  const key = `${persona}/${id}`;
  if (cache.has(key)) return cache.get(key)!;
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}data/${DIR[persona]}/${encodeURIComponent(id)}.json`);
    const data = res.ok ? await res.json() : null;
    cache.set(key, data);
    return data;
  } catch {
    cache.set(key, null);
    return null;
  }
}

// ---------- merge cube -> profile ----------
function mergeNV(lists: NV[][]): NV[] {
  const m = new Map<string, number>();
  for (const l of lists) for (const it of l) m.set(it.name, (m.get(it.name) ?? 0) + it.value);
  return [...m].map(([name, value]) => ({ name, value }));
}
const desc = (a: NV, b: NV) => b.value - a.value;

export function mergeProfiles(cube: Cube, pubYears: string[], impactYear: string): Profile {
  let pubCells = pubYears.map((y) => cube[y]).filter(Boolean);
  if (pubCells.length === 0) pubCells = Object.values(cube);
  const impactKeys = impactYear === "all" ? IMPACT_ALL : [impactYear];
  const menCells = pubCells.flatMap((pc) => impactKeys.map((k) => pc.impact[k]).filter(Boolean));

  const sumP = (f: keyof PubCell) => pubCells.reduce((s, c) => s + ((c[f] as number) || 0), 0);
  const sumM = (f: keyof MenCell) => menCells.reduce((s, c) => s + ((c[f] as number) || 0), 0);

  // map metrics (mention-based)
  const mapKeys = menCells[0] ? Object.keys(menCells[0].map_metrics) : [];
  const map_metrics: Record<string, NV[]> = {};
  for (const k of mapKeys) map_metrics[k] = mergeNV(menCells.map((c) => c.map_metrics[k] ?? [])).sort(desc).slice(0, 30);

  // country detail (pub-level), keyed by map metric -> country -> items
  const cd: Record<string, Record<string, MentionItem[]>> = {};
  for (const c of pubCells)
    for (const [metric, byCountry] of Object.entries(c.country_detail ?? {})) {
      cd[metric] ??= {};
      for (const [country, items] of Object.entries(byCountry)) cd[metric][country] = [...(cd[metric][country] ?? []), ...items];
    }
  for (const metric of Object.keys(cd))
    for (const country of Object.keys(cd[metric])) {
      const seen = new Set<string>();
      cd[metric][country] = cd[metric][country].sort((a, b) => b.attention - a.attention).filter((x) => !seen.has(x.title) && seen.add(x.title)).slice(0, 6);
    }
  // journals + outputs + network (pub-level)
  const jMap = new Map<string, number>();
  pubCells.forEach((c) => (c.top_journals ?? []).forEach((j) => jMap.set(j.name, (jMap.get(j.name) ?? 0) + j.mentions)));
  const oMap = new Map<string, Output>();
  pubCells.forEach((c) => c.top_outputs.forEach((o) => {
    const key = o.doi || o.title; const cur = oMap.get(key);
    if (!cur || o.attention > cur.attention) oMap.set(key, o);
  }));
  const nodeMap = new Map<string, number>();
  pubCells.forEach((c) => (c.network?.nodes ?? []).forEach((n) => nodeMap.set(n.name, (nodeMap.get(n.name) ?? 0) + n.value)));
  const edgeMap = new Map<string, { source: string; target: string; value: number }>();
  pubCells.forEach((c) => (c.network?.edges ?? []).forEach((e) => {
    const k = e.source + "|" + e.target; const cur = edgeMap.get(k);
    if (cur) cur.value += e.value; else edgeMap.set(k, { ...e });
  }));
  const nodes = [...nodeMap].map(([name, value]) => ({ name, value })).sort(desc).slice(0, 14);
  const nset = new Set(nodes.map((n) => n.name));

  return {
    kpis: {
      publications: sumP("publications"), oa_count: sumP("oa_count"), citations: sumP("citations"),
      mentions: sumM("mentions"), attention: sumM("attention"), policy: sumM("policy"),
      patents: sumM("patents"), news: sumM("news"),
    },
    channels_ns: mergeNV(menCells.map((c) => c.channels_ns)).sort(desc),
    countries_ns: mergeNV(menCells.map((c) => c.countries_ns)).sort(desc).slice(0, 20),
    sentiment: mergeNV(menCells.map((c) => c.sentiment)),
    timeline: mergeNV(menCells.map((c) => c.timeline)).sort((a, b) => a.name.localeCompare(b.name)),
    stakeholders: mergeNV(menCells.map((c) => c.stakeholders)).sort(desc).slice(0, 12),
    map_metrics,
    sdg: mergeNV(pubCells.map((c) => c.sdg)).sort(desc).slice(0, 10),
    oa_mix: mergeNV(pubCells.map((c) => c.oa_mix)),
    pub_mix: mergeNV(pubCells.map((c) => c.pub_mix)).sort(desc),
    contributors: mergeNV(pubCells.map((c) => c.contributors ?? [])).sort(desc).slice(0, 12),
    network: { nodes, edges: [...edgeMap.values()].filter((e) => nset.has(e.source) && nset.has(e.target)) },
    top_journals: [...jMap].map(([name, mentions]) => ({ name, mentions })).sort((a, b) => b.mentions - a.mentions).slice(0, 8),
    top_outputs: [...oMap.values()].sort((a, b) => b.attention - a.attention).slice(0, 8),
    country_detail: cd,
  };
}

// ---------- derived ----------
export const pctOA = (k: Kpis) => (k.publications > 0 ? Math.round((k.oa_count / k.publications) * 1000) / 10 : 0);
export const countriesReached = (p: Profile) => p.countries_ns.filter((c) => c.name !== "Unknown" && c.value > 0).length;

// ---------- formatting ----------
export function fmt(n: number): string {
  if (n == null || Number.isNaN(n)) return "–";
  if (Math.abs(n) >= 1_000_000) return (n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1) + "M";
  if (Math.abs(n) >= 1_000) return (n / 1_000).toFixed(n >= 10_000 ? 0 : 1) + "k";
  return n.toLocaleString();
}
export const fmtFull = (n: number) => (n ?? 0).toLocaleString();

// ---------- palette ----------
export interface Palette {
  series: string[]; surface: string; ink: string; ink2: string; muted: string;
  grid: string; axis: string; pos: string; neg: string; mid: string; seq: string[]; accent: string;
}
const SERIES_LIGHT = ["#2a78d6", "#1baf7a", "#eda100", "#008300", "#4a3aa7", "#e34948", "#e87ba4", "#eb6834"];
const SERIES_DARK = ["#3987e5", "#199e70", "#c98500", "#008300", "#9085e9", "#e66767", "#d55181", "#d95926"];
const SEQ_LIGHT = ["#eaf2fd", "#cde2fb", "#9ec5f4", "#5598e7", "#2a78d6", "#184f95"];
const SEQ_DARK = ["#12233a", "#184f95", "#256abf", "#3987e5", "#6da7ec", "#9ec5f4"];
export function paletteFor(dark: boolean, accent: string): Palette {
  return dark
    ? { series: SERIES_DARK, surface: "#141a2b", ink: "#f2f5fa", ink2: "#aeb9cc", muted: "#8493a8",
        grid: "#232c42", axis: "#31405c", pos: "#3987e5", neg: "#e66767", mid: "#1c2540", seq: SEQ_DARK, accent }
    : { series: SERIES_LIGHT, surface: "#ffffff", ink: "#0b1524", ink2: "#47536b", muted: "#7a869c",
        grid: "#eef1f7", axis: "#c9d2df", pos: "#2a78d6", neg: "#e34948", mid: "#eef2f8", seq: SEQ_LIGHT, accent };
}
export const CHANNEL_COLORS: Record<string, number> = {
  "Social media": 0, "News": 1, "Blog": 2, "Policy": 4, "Clinical guideline": 3,
  "Patent": 7, "Podcast": 6, "Video": 5, "Encyclopedia": 1, "Academic": 4, "Other": 0,
};
// Map metrics. Patents have no mention `country`, so they're mapped by filing
// jurisdiction derived from the patent number (build_web_data.PATENT_OFFICE);
// EP/WO patents count in the KPI but don't colour a single country.
export const MAP_METRICS: { key: string; label: string }[] = [
  { key: "all", label: "All mentions" },
  { key: "policies", label: "Policies" },
  { key: "patents", label: "Patents" },
  { key: "clinical", label: "Clinical guidelines" },
];

// ---------- persona summaries ----------
const topName = (l: { name: string }[], skip = "Unknown") => l.find((x) => x.name !== skip)?.name ?? null;
const posShare = (sent: NV[]) => {
  const tot = sent.reduce((s, x) => s + x.value, 0) || 1;
  const pos = sent.filter((x) => x.name.includes("positive")).reduce((s, x) => s + x.value, 0);
  return Math.round((pos / tot) * 100);
};
const toneOf = (sent: NV[]) => { const p = posShare(sent); return p >= 70 ? "strongly positive" : p >= 50 ? "largely positive" : "mixed"; };
const topChannelNS = (p: Profile) => { const c = [...p.channels_ns].sort(desc)[0]; return c ? c.name.toLowerCase() : "news"; };

export function summaryFor(persona: PersonaKey, entity: string, isAll: boolean, p: Profile, years: string[], impactYear: string): string {
  const sy = [...years].sort();
  const yp = sy.length === 1 ? sy[0] : `${sy[0]}–${sy.at(-1)}`;
  const window = impactYear === "all" ? `published ${yp}` : `published ${yp}, mentioned in ${impactYear}`;
  const st = topName(p.stakeholders), sdg = topName(p.sdg);
  if (persona === "consortia") {
    const who = isAll ? "Taylor & Francis research" : (entity.startsWith("SANLiC") ? "SANLiC" : entity);
    const outs = p.kpis.publications ? ` across ${fmtFull(p.kpis.publications)} outputs` : "";
    let s = `For research ${window}, ${who} drew ${fmtFull(p.kpis.mentions)} mentions and ${fmtFull(p.kpis.attention)} attention${outs}.`;
    if (p.kpis.publications) { const cite = p.kpis.citations ? `, with ${fmtFull(p.kpis.citations)} citations` : ""; s += ` ${pctOA(p.kpis)}% is open access${cite}.`; }
    s += ` Societal signals: ${fmtFull(p.kpis.policy)} policy/guideline and ${fmtFull(p.kpis.patents)} patent references.`;
    if (st) s += ` Policy interest from ${st}.`;
    return s;
  }
  const who = isAll ? "the Taylor & Francis portfolio" : entity;
  const oa = p.kpis.publications ? `, and ${pctOA(p.kpis)}% of output is open access` : "";
  let s = `For research ${window}, ${who} generated ${fmtFull(p.kpis.mentions)} mentions, led by ${topChannelNS(p)} (excluding social)${oa}.`;
  if (sdg) s += ` Strongest SDG alignment: ${sdg}.`;
  if (st) s += ` Policy interest from ${st}.`;
  return s;
}

export function kpiValue(key: string, p: Profile): string {
  const k = p.kpis;
  switch (key) {
    case "publications": return fmt(k.publications);
    case "mentions": return fmt(k.mentions);
    case "attention": return fmt(k.attention);
    case "policy": return fmt(k.policy);
    case "patents": return fmt(k.patents);
    case "news": return fmt(k.news);
    case "citations": return fmt(k.citations);
    case "oa": return `${pctOA(k)}%`;
    case "countries": return fmt(countriesReached(p));
    default: return "–";
  }
}

// ---------- per-section AI summaries (for the clickable popups) ----------
export interface SumCtx { entityName: string; years: string[]; impactYear: string; mapMetric?: string; persona: PersonaKey }
function windowPhrase(years: string[], impactYear: string): string {
  const sy = [...years].sort();
  const yp = sy.length === 1 ? sy[0] : `${sy[0]}–${sy.at(-1)}`;
  return impactYear === "all" ? `published ${yp}` : `published ${yp}, mentioned in ${impactYear}`;
}
const pctStr = (part: number, total: number) => (total ? `${Math.round((part / total) * 100)}%` : "0%");
const topN = (l: NV[], n = 3) => l.filter((x) => x.name !== "Unknown" && x.value > 0).slice(0, n);
const list3 = (t: NV[], noun: string) =>
  t.map((x, i) => `${i === 0 ? "" : i === t.length - 1 ? " and " : ", "}${x.name} (${fmtFull(x.value)}${noun})`).join("");

export function sectionSummary(key: string, p: Profile, ctx: SumCtx): string {
  const w = windowPhrase(ctx.years, ctx.impactYear);
  const k = p.kpis;
  switch (key) {
    case "overview":
      return summaryFor(ctx.persona, ctx.entityName, ctx.entityName === "Taylor & Francis Group", p, ctx.years, ctx.impactYear);
    case "channels": {
      const t = topN(p.channels_ns); const sum = p.channels_ns.reduce((s, x) => s + x.value, 0);
      if (!t.length) return `No non-social mentions for ${ctx.entityName} in this window (${w}).`;
      return `For research ${w}, ${ctx.entityName}'s engagement (excluding social media) is led by${list3(t, " mentions")}. In total ${fmtFull(sum)} mentions span ${p.channels_ns.length} channels.`;
    }
    case "map": {
      const label = MAP_METRICS.find((m) => m.key === ctx.mapMetric)?.label ?? "signals";
      const arr = p.map_metrics[ctx.mapMetric ?? "policies"] ?? []; const t = topN(arr);
      if (!t.length) return `No ${label.toLowerCase()} recorded by country for ${ctx.entityName} (${w}).`;
      return `This map shows ${label.toLowerCase()} by country (${w}). Leading:${list3(t, "")}. ${arr.filter((x) => x.value > 0).length} countries recorded ${label.toLowerCase()}.`;
    }
    case "timeline": {
      if (!p.timeline.length) return `No dated mentions for ${ctx.entityName} (${w}). Undated social posts are excluded from the timeline.`;
      const peak = [...p.timeline].sort((a, b) => b.value - a.value)[0];
      const sum = p.timeline.reduce((s, x) => s + x.value, 0);
      return `Dated mentions for research ${w} total ${fmtFull(sum)} across ${p.timeline.length} months, peaking in ${peak.name} (${fmtFull(peak.value)}). Undated social posts are excluded.`;
    }
    case "countries": {
      const t = topN(p.countries_ns);
      if (!t.length) return `No country-level (non-social) data for ${ctx.entityName} (${w}).`;
      return `Excluding social media, the widest reach is${list3(t, " mentions")} — ${countriesReached(p)} countries in total (${w}).`;
    }
    case "sentiment": {
      const tot = p.sentiment.reduce((s, x) => s + x.value, 0);
      if (!tot) return `No sentiment data for ${ctx.entityName} (${w}).`;
      const pos = p.sentiment.filter((x) => x.name.includes("positive")).reduce((s, x) => s + x.value, 0);
      const neg = p.sentiment.filter((x) => x.name.includes("negative")).reduce((s, x) => s + x.value, 0);
      const topS = [...p.sentiment].sort((a, b) => b.value - a.value)[0];
      return `Reception of ${ctx.entityName} (${w}) is ${toneOf(p.sentiment)} — ${pctStr(pos, tot)} positive, ${pctStr(neg, tot)} negative. Most common: “${topS.name}” (${fmtFull(topS.value)}).`;
    }
    case "oa": {
      if (!k.publications) return `Open-access detail needs 2026 publications; none are in this selection.`;
      const g = (n: string) => p.oa_mix.find((x) => x.name === n)?.value ?? 0;
      return `${pctOA(k)}% of ${ctx.entityName}'s ${fmtFull(k.publications)} outputs are open access — ${fmtFull(g("Gold"))} gold, ${fmtFull(g("Hybrid"))} hybrid, ${fmtFull(g("Bronze"))} bronze, ${fmtFull(g("Green"))} green; ${fmtFull(g("Closed"))} remain closed.`;
    }
    case "stakeholders": {
      const t = topN(p.stakeholders);
      if (!t.length) return `No policy or guideline citations recorded for ${ctx.entityName} (${w}).`;
      return `${p.stakeholders.length} organisations cite ${ctx.entityName}'s research in policy (${w}), led by${list3(t, " citations")}.`;
    }
    case "sdg": {
      const t = topN(p.sdg);
      if (!t.length) return `SDG alignment needs 2026 publications; none are in this selection.`;
      return `${ctx.entityName}'s research aligns most with${list3(t, " outputs")}. ${p.sdg.length} SDGs represented.`;
    }
    case "outputs": {
      if (!p.top_outputs.length) return `No mentioned outputs for ${ctx.entityName} (${w}).`;
      const o = p.top_outputs[0];
      return `The most-discussed output for ${ctx.entityName} (${w}) is “${o.title}” — ${fmtFull(o.attention)} Altmetric attention${o.journal ? `, in ${o.journal}` : ""}. The top ${Math.min(8, p.top_outputs.length)} by attention are listed.`;
    }
    case "journals": {
      const t = topN(p.top_journals.map((j) => ({ name: j.name, value: j.mentions })));
      if (!t.length) return `No journal-level mentions for ${ctx.entityName} (${w}).`;
      return `Top journals for ${ctx.entityName} (${w}):${list3(t, " mentions")}.`;
    }
    case "contributors": {
      const t = topN(p.contributors);
      if (!t.length) return `Contributor detail needs 2026 publications; none are in this selection.`;
      return `${p.contributors.length} institutions contribute to ${ctx.entityName}'s 2026 output, led by${list3(t, " outputs")}.`;
    }
    case "societal": {
      const g = (n: string) => p.channels_ns.find((x) => x.name === n)?.value ?? 0;
      const pol = g("Policy"), pat = g("Patent"), cli = g("Clinical guideline");
      const tot = pol + pat + cli;
      if (!tot) return `No policy, patent or clinical-guideline uptake for ${ctx.entityName} (${w}).`;
      const st = topN(p.stakeholders)[0];
      let s = `${ctx.entityName}'s research shows ${fmtFull(tot)} societal-uptake signals (${w}): ${fmtFull(pol)} policy, ${fmtFull(cli)} clinical-guideline and ${fmtFull(pat)} patent citations.`;
      if (st) s += ` Leading policy citer: ${st.name}.`;
      return s;
    }
    case "network": {
      if (p.network.nodes.length < 2) return `Not enough multi-country collaboration to summarise for ${ctx.entityName}.`;
      const t = [...p.network.nodes].sort((a, b) => b.value - a.value).slice(0, 3);
      const e = [...p.network.edges].sort((a, b) => b.value - a.value)[0];
      return `Collaboration spans ${p.network.nodes.length} countries, centred on ${t[0].name} (${fmtFull(t[0].value)} outputs). Strongest partnership: ${e ? `${e.source}–${e.target} (${e.value} co-published)` : "—"}.`;
    }
    default: return "";
  }
}

// ---------- CSV export ----------
function csvCell(v: unknown): string {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
const csvRows = (rows: (string | number)[][]) => rows.map((r) => r.map(csvCell).join(",")).join("\n");

export function buildExportCSV(persona: PersonaKey, entityName: string, years: string[], impactYear: string, p: Profile): string {
  const L: string[] = ["PIX — Partner Impact Experience export"];
  L.push(csvRows([["Persona", persona], ["Entity", entityName],
    ["Publication years", [...years].sort().join(" / ")], ["Impact year", impactYear === "all" ? "All" : impactYear]]));
  const sec = (t: string) => { L.push(""); L.push(`# ${t}`); };
  const nvSec = (t: string, cols: [string, string], arr: { name: string; value: number }[]) => {
    sec(t); L.push(csvRows([cols, ...arr.map((x) => [x.name, x.value] as (string | number)[])]));
  };
  const k = p.kpis;
  sec("KPIs");
  L.push(csvRows([["Metric", "Value"], ["Published papers", k.publications], ["Open access %", pctOA(k)],
    ["Citations", k.citations], ["Total mentions", k.mentions], ["Attention score", k.attention],
    ["Policy & guidelines", k.policy], ["Patents", k.patents], ["News stories", k.news], ["Countries reached", countriesReached(p)]]));
  nvSec("Where impact happens (excl. social)", ["Channel", "Mentions"], p.channels_ns);
  nvSec("Top countries (excl. social)", ["Country", "Mentions"], p.countries_ns);
  nvSec("Reception (sentiment)", ["Sentiment", "Mentions"], p.sentiment);
  nvSec("Open access", ["Type", "Outputs"], p.oa_mix);
  nvSec("Publication mix", ["Document type", "Outputs"], p.pub_mix);
  nvSec("SDG alignment", ["SDG", "Outputs"], p.sdg);
  nvSec("Knowledge & policy stakeholders", ["Organisation", "Citations"], p.stakeholders);
  nvSec("Top journals", ["Journal", "Mentions"], p.top_journals.map((j) => ({ name: j.name, value: j.mentions })));
  nvSec("Engagement timeline", ["Month", "Mentions"], p.timeline);
  sec("Most-discussed outputs");
  L.push(csvRows([["Title", "Journal", "Attention (AAS)", "DOI"], ...p.top_outputs.map((o) => [o.title, o.journal, o.attention, o.doi] as (string | number)[])]));
  for (const m of MAP_METRICS) nvSec(`Map — ${m.label} by country`, ["Country", m.label], p.map_metrics[m.key] ?? []);
  sec("Collaboration network — nodes");
  L.push(csvRows([["Country", "Publications"], ...p.network.nodes.map((n) => [n.name, n.value] as (string | number)[])]));
  sec("Collaboration network — links");
  L.push(csvRows([["Source", "Target", "Co-published"], ...p.network.edges.map((e) => [e.source, e.target, e.value] as (string | number)[])]));
  return L.join("\n");
}

// ---------- PDF export (lazy-loaded jsPDF) ----------
function hexRGB(h: string): [number, number, number] {
  const s = h.replace("#", "");
  return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
}

// Capture the live dashboard DOM (exact layout + charts) and save it as a PDF.
export async function exportReplicaPDF(node: HTMLElement, fileBase: string, bg: string): Promise<void> {
  const [{ toPng }, { jsPDF }] = await Promise.all([import("html-to-image"), import("jspdf")]);

  // Pick a pixel ratio that keeps the rasterized canvas within limits EVERY browser
  // supports. WebKit (Safari) caps canvas area at ~16.7M px and each side at 8192;
  // going over yields corrupted "rainbow static" output instead of an error — which
  // is why export looked broken on some machines (Safari / weaker GPUs) and fine on
  // others (Chrome / Firefox, far larger limits). Scale 2x down only as far as needed.
  const baseW = node.scrollWidth || node.getBoundingClientRect().width;
  const baseH = node.scrollHeight || node.getBoundingClientRect().height;
  const SAFE_AREA = 16_000_000;
  const SAFE_SIDE = 8192;
  const pixelRatio = Math.min(
    2,
    SAFE_SIDE / baseW,
    SAFE_SIDE / baseH,
    Math.sqrt(SAFE_AREA / (baseW * baseH))
  );

  const opts = {
    pixelRatio,
    backgroundColor: bg,
    cacheBust: true,
    width: baseW,
    height: baseH,
    filter: (el: HTMLElement) => {
      const c = el.classList;
      return !c || (!c.contains("export-btn") && !c.contains("modal-overlay"));
    },
  };
  // WebKit occasionally drops embedded fonts/images on the first serialization pass;
  // a warm-up render makes the captured output deterministic across browsers.
  await toPng(node, opts);
  const dataUrl = await toPng(node, opts);
  const img = new Image();
  await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(new Error("img")); img.src = dataUrl; });
  const w = img.width, h = img.height;
  const pdf = new jsPDF({ unit: "px", format: [w, h], orientation: w > h ? "landscape" : "portrait", compress: true });
  pdf.addImage(dataUrl, "PNG", 0, 0, w, h);
  pdf.save(`${fileBase}.pdf`);
}

export interface ChartShot { title: string; img: string; w: number; h: number }

export async function exportPDF(
  persona: PersonaKey, entityName: string, years: string[], impactYear: string, p: Profile, accentHex: string,
  charts: ChartShot[] = []
): Promise<void> {
  const [{ jsPDF }, autoTableMod] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const autoTable = autoTableMod.default;
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const accent = hexRGB(accentHex);
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 40;
  const nv = (arr: { name: string; value: number }[]) => arr.map((x) => [x.name, fmtFull(x.value)]);

  // ---- header ----
  doc.setFillColor(accent[0], accent[1], accent[2]);
  doc.rect(0, 0, W, 74, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold"); doc.setFontSize(18);
  doc.text("PIX — Partner Impact Experience", M, 34);
  doc.setFont("helvetica", "normal"); doc.setFontSize(11);
  doc.text(`${persona === "consortia" ? "Consortia" : "Societies"} impact report · Taylor & Francis Group`, M, 54);
  let y = 96;
  doc.setTextColor(20, 20, 30); doc.setFont("helvetica", "bold"); doc.setFontSize(15);
  doc.text(entityName, M, y); y += 8;
  doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(110, 110, 120);
  doc.text(`Publication year: ${[...years].sort().join(" / ")}   ·   Impact year: ${impactYear === "all" ? "All" : impactYear}`, M, y + 10);
  y += 30;

  const k = p.kpis;
  const section = (title: string, head: string[], body: (string | number)[][]) => {
    if (!body.length) return;
    if (y > H - 90) { doc.addPage(); y = M; }
    doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.setTextColor(accent[0], accent[1], accent[2]);
    doc.text(title, M, y);
    autoTable(doc, {
      startY: y + 8, head: [head], body,
      styles: { fontSize: 9, cellPadding: 4, textColor: [30, 30, 40] },
      headStyles: { fillColor: accent, textColor: [255, 255, 255], fontStyle: "bold" },
      alternateRowStyles: { fillColor: [244, 246, 250] },
      margin: { left: M, right: M },
      theme: "striped",
    });
    y = ((doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY) + 24;
  };

  section("Key metrics", ["Metric", "Value"], [
    ["Published papers (2026)", fmtFull(k.publications)], ["Open access", `${pctOA(k)}%`],
    ["Citations", fmtFull(k.citations)], ["Total mentions", fmtFull(k.mentions)],
    ["Attention score", fmtFull(k.attention)], ["Policy & guidelines", fmtFull(k.policy)],
    ["Patents", fmtFull(k.patents)], ["News stories", fmtFull(k.news)],
    ["Countries reached", fmtFull(countriesReached(p))],
  ]);
  section("Where impact happens (excl. social)", ["Channel", "Mentions"], nv(p.channels_ns));
  section("Top countries (excl. social)", ["Country", "Mentions"], nv(p.countries_ns));
  section("Reception (sentiment)", ["Sentiment", "Mentions"], nv(p.sentiment.filter((s) => s.value > 0)));
  section("Open access", ["Type", "Outputs"], nv(p.oa_mix));
  section("Publication mix", ["Document type", "Outputs"], nv(p.pub_mix));
  section("SDG alignment", ["SDG", "Outputs"], nv(p.sdg));
  section("Knowledge & policy stakeholders", ["Organisation", "Citations"], nv(p.stakeholders.filter((s) => s.name !== "Unknown")));
  section("Top journals", ["Journal", "Mentions"], p.top_journals.map((j) => [j.name, fmtFull(j.mentions)]));
  section("Engagement timeline (dated mentions)", ["Month", "Mentions"], nv(p.timeline));
  section("Most-discussed research outputs", ["Title", "Journal", "Attention"],
    p.top_outputs.map((o) => [o.title, o.journal, fmtFull(o.attention)]));
  for (const m of MAP_METRICS) section(`Map — ${m.label} by country`, ["Country", "Mentions"], nv((p.map_metrics[m.key] ?? []).filter((x) => x.value > 0)));
  section("Collaboration network — countries", ["Country", "Publications"], nv(p.network.nodes));
  section("Collaboration network — partnerships", ["Country A", "Country B", "Co-published"],
    p.network.edges.map((e) => [e.source, e.target, e.value]));

  // ---- chart images ----
  if (charts.length) {
    doc.addPage(); y = M;
    doc.setFont("helvetica", "bold"); doc.setFontSize(14); doc.setTextColor(accent[0], accent[1], accent[2]);
    doc.text("Charts", M, y); y += 18;
    const maxW = W - M * 2;
    for (const c of charts) {
      const drawW = maxW;
      const drawH = Math.min(maxW * (c.h / c.w), H - M * 2 - 24);
      if (y + drawH + 22 > H - M) { doc.addPage(); y = M; }
      doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(30, 30, 40);
      doc.text(c.title, M, y); y += 8;
      try { doc.addImage(c.img, "PNG", M, y, drawW, drawH); } catch { /* skip unreadable */ }
      y += drawH + 22;
    }
  }

  // footer page numbers
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(8); doc.setTextColor(150, 150, 160);
    doc.text(`PIX — Partner Impact Experience   ·   page ${i} of ${pages}`, M, H - 18);
  }
  const safe = entityName.replace(/[^a-z0-9]+/gi, "_").slice(0, 40);
  doc.save(`PIX_${persona}_${safe}_pub-${[...years].sort().join("-")}_impact-${impactYear}.pdf`);
}
