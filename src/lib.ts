// Types, data loading, cross-year merge, formatting, palette, and per-persona config.

export interface NV { name: string; value: number }
export interface Journal { name: string; mentions: number; attention: number }
export interface Output { title: string; journal: string; attention: number; doi: string }
export interface Network { nodes: NV[]; edges: { source: string; target: string; value: number }[] }

export interface Kpis {
  publications: number; mentions: number; attention: number; policy: number;
  patents: number; news: number; citations: number; oa_count: number;
}
export interface Profile {
  kpis: Kpis;
  channels: NV[]; sentiment: NV[]; timeline: NV[]; countries_top: NV[];
  sdg: NV[]; fields: NV[]; pub_mix: NV[]; oa_mix: NV[];
  top_journals: Journal[]; top_outputs: Output[]; stakeholders: NV[]; network: Network;
}
export type YearProfiles = Record<string, Profile>;

export interface EntityMeta { id: string; name: string; mentions: number; publications: number }
export interface Persona {
  label: string; entityLabel: string; describe: string;
  entities: EntityMeta[]; profiles: Record<string, YearProfiles>;
}
export interface Portal {
  meta: {
    generated: string; brand: string; product: string; years: number[];
    sources: Record<string, { table: string; rows: number; scope?: string }>;
    notes: string[];
  };
  personas: Record<string, Persona>;
}
export type PersonaKey = "researchers" | "institutions" | "societies" | "authors";

export async function loadPortal(): Promise<Portal> {
  const res = await fetch(`${import.meta.env.BASE_URL}data/portal.json`);
  if (!res.ok) throw new Error("failed to load portal.json");
  return res.json();
}

// ---------- cross-year merge ----------
function mergeNV(lists: NV[][]): NV[] {
  const m = new Map<string, number>();
  for (const l of lists) for (const it of l) m.set(it.name, (m.get(it.name) ?? 0) + it.value);
  return [...m].map(([name, value]) => ({ name, value }));
}
const desc = (a: NV, b: NV) => b.value - a.value;

export function mergeProfiles(yp: YearProfiles, years: string[]): Profile {
  const ps = years.map((y) => yp[y]).filter(Boolean);
  if (ps.length === 0) ps.push(Object.values(yp)[0]);
  const sk = (f: keyof Kpis) => ps.reduce((s, p) => s + (p.kpis[f] ?? 0), 0);

  const jMap = new Map<string, Journal>();
  ps.forEach((p) => p.top_journals.forEach((j) => {
    const e = jMap.get(j.name) ?? { name: j.name, mentions: 0, attention: 0 };
    e.mentions += j.mentions; e.attention = Math.max(e.attention, j.attention); jMap.set(j.name, e);
  }));
  const oMap = new Map<string, Output>();
  ps.forEach((p) => p.top_outputs.forEach((o) => {
    const key = o.doi || o.title; const cur = oMap.get(key);
    if (!cur || o.attention > cur.attention) oMap.set(key, o);
  }));
  const nodeMap = new Map<string, number>();
  ps.forEach((p) => p.network.nodes.forEach((n) => nodeMap.set(n.name, (nodeMap.get(n.name) ?? 0) + n.value)));
  const edgeMap = new Map<string, { source: string; target: string; value: number }>();
  ps.forEach((p) => p.network.edges.forEach((e) => {
    const k = e.source + "|" + e.target; const cur = edgeMap.get(k);
    if (cur) cur.value += e.value; else edgeMap.set(k, { ...e });
  }));
  const nodes = [...nodeMap].map(([name, value]) => ({ name, value })).sort(desc).slice(0, 14);
  const nset = new Set(nodes.map((n) => n.name));
  const edges = [...edgeMap.values()].filter((e) => nset.has(e.source) && nset.has(e.target));

  return {
    kpis: { publications: sk("publications"), mentions: sk("mentions"), attention: sk("attention"),
      policy: sk("policy"), patents: sk("patents"), news: sk("news"), citations: sk("citations"), oa_count: sk("oa_count") },
    channels: mergeNV(ps.map((p) => p.channels)),        // order preserved
    sentiment: mergeNV(ps.map((p) => p.sentiment)),
    oa_mix: mergeNV(ps.map((p) => p.oa_mix)),
    pub_mix: mergeNV(ps.map((p) => p.pub_mix)).sort(desc),
    sdg: mergeNV(ps.map((p) => p.sdg)).sort(desc).slice(0, 12),
    fields: mergeNV(ps.map((p) => p.fields)).sort(desc).slice(0, 10),
    countries_top: mergeNV(ps.map((p) => p.countries_top)).sort(desc).slice(0, 20),
    stakeholders: mergeNV(ps.map((p) => p.stakeholders)).sort(desc).slice(0, 12),
    timeline: mergeNV(ps.map((p) => p.timeline)).sort((a, b) => (a.name < b.name ? -1 : 1)),
    top_journals: [...jMap.values()].sort((a, b) => b.mentions - a.mentions).slice(0, 10),
    top_outputs: [...oMap.values()].sort((a, b) => b.attention - a.attention).slice(0, 10),
    network: { nodes, edges },
  };
}

// ---------- derived helpers ----------
export const pctOA = (k: Kpis) => (k.publications > 0 ? Math.round((k.oa_count / k.publications) * 1000) / 10 : 0);
export const countriesReached = (p: Profile) => p.countries_top.filter((c) => c.name !== "Unknown" && c.value > 0).length;

// ---------- formatting ----------
export function fmt(n: number): string {
  if (n == null || isNaN(n)) return "–";
  if (Math.abs(n) >= 1_000_000) return (n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1) + "M";
  if (Math.abs(n) >= 1_000) return (n / 1_000).toFixed(n >= 10_000 ? 0 : 1) + "k";
  return n.toLocaleString();
}
export const fmtFull = (n: number) => (n ?? 0).toLocaleString();

// ---------- palette (validated categorical, for multi-series charts) ----------
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

// ---------- persona configuration (accents, icons, KPI layout, AI summary voice) ----------
export interface KpiSpec { key: string; label: string; sub: string }
export interface PersonaCfg {
  label: string; icon: string; lens: string; blurb: string;
  accent: string; accentDark: string; grad: [string, string];
  kpis: KpiSpec[];
  summary: (entity: string, isAll: boolean, prof: Profile, years: string[]) => string;
}

const yearsPhrase = (years: string[]) => {
  const ys = [...years].sort();
  if (ys.length === 1) return ys[0];
  if (ys.length === 2) return `${ys[0]} and ${ys[1]}`;
  return `${ys[0]}–${ys[ys.length - 1]}`;
};
const top = (l: { name: string }[], skip = "Unknown") => l.find((x) => x.name !== skip)?.name ?? null;
const posShare = (sent: NV[]) => {
  const tot = sent.reduce((s, x) => s + x.value, 0) || 1;
  const pos = sent.filter((x) => x.name.includes("positive") || x.name === "Positive" || x.name === "Strong positive")
    .reduce((s, x) => s + x.value, 0);
  return Math.round((pos / tot) * 100);
};
const tone = (sent: NV[]) => { const p = posShare(sent); return p >= 70 ? "strongly positive" : p >= 50 ? "largely positive" : "mixed"; };
const topChannel = (p: Profile) => { const c = [...p.channels].sort(desc)[0]; return c && c.value > 0 ? c.name.toLowerCase() : "social media"; };

export const PERSONA_CFG: Record<PersonaKey, PersonaCfg> = {
  researchers: {
    label: "Researchers", icon: "⚛", lens: "field", blurb: "Research fields",
    accent: "#2f6bff", accentDark: "#5b8bff", grad: ["#2f6bff", "#7a3ff2"],
    kpis: [
      { key: "mentions", label: "Total mentions", sub: "worldwide engagement" },
      { key: "attention", label: "Attention score", sub: "sum of Altmetric scores" },
      { key: "countries", label: "Countries reached", sub: "geographic spread" },
      { key: "policy", label: "Policy & guidelines", sub: "citations in policy" },
      { key: "news", label: "News stories", sub: "press coverage" },
      { key: "patents", label: "Patent references", sub: "cited in patents" },
      { key: "oa", label: "Open access", sub: "of research outputs" },
      { key: "publications", label: "Research outputs", sub: "2026 publications" },
    ],
    summary: (entity, isAll, p, years) => {
      const who = isAll ? "Taylor & Francis research" : `research in ${entity}`;
      const c = countriesReached(p), sdg = top(p.sdg), st = top(p.stakeholders);
      let s = `Across ${yearsPhrase(years)}, ${who} attracted ${fmtFull(p.kpis.mentions)} mentions${c ? ` across ${c} countries` : ""}, led by ${topChannel(p)}. Reception is ${tone(p.sentiment)} (${posShare(p.sentiment)}% positive).`;
      if (sdg) s += ` It aligns most with ${sdg}.`;
      if (st) s += ` Policy interest comes from ${st}.`;
      if (p.top_outputs[0]) s += ` The most-discussed output is “${p.top_outputs[0].title}”.`;
      return s;
    },
  },
  institutions: {
    label: "Institutions", icon: "▤", lens: "institution", blurb: "Institutions & consortia",
    accent: "#7c3aed", accentDark: "#a78bfa", grad: ["#7c3aed", "#4f46e5"],
    kpis: [
      { key: "publications", label: "Research outputs", sub: "2026 publications" },
      { key: "oa", label: "Open access", sub: "of the portfolio" },
      { key: "citations", label: "Citations", sub: "accrued to date" },
      { key: "mentions", label: "Total mentions", sub: "worldwide engagement" },
      { key: "attention", label: "Attention score", sub: "sum of Altmetric scores" },
      { key: "policy", label: "Policy & guidelines", sub: "citations in policy" },
      { key: "countries", label: "Collaborations", sub: "partner countries" },
      { key: "patents", label: "Patent references", sub: "cited in patents" },
    ],
    summary: (entity, isAll, p, years) => {
      const who = isAll ? "Taylor & Francis" : entity;
      const st = top(p.stakeholders), col = p.network.nodes.filter((n) => n.name !== entity).sort(desc)[0]?.name;
      let s = `${who}'s research${p.kpis.publications ? ` — ${fmtFull(p.kpis.publications)} outputs` : ""} earned ${fmtFull(p.kpis.mentions)} mentions and ${fmtFull(p.kpis.attention)} attention points in ${yearsPhrase(years)}.`;
      if (p.kpis.publications) s += ` ${pctOA(p.kpis)}% is open access${p.kpis.citations ? `, with ${fmtFull(p.kpis.citations)} citations` : ""}.`;
      if (col) s += ` Its strongest collaboration is with ${col}.`;
      if (st) s += ` It is cited in policy by ${st}.`;
      return s;
    },
  },
  societies: {
    label: "Societies", icon: "◎", lens: "society", blurb: "Journal-owning societies",
    accent: "#0d9488", accentDark: "#2dd4bf", grad: ["#0d9488", "#0ea5e9"],
    kpis: [
      { key: "mentions", label: "Total mentions", sub: "across society titles" },
      { key: "attention", label: "Attention score", sub: "sum of Altmetric scores" },
      { key: "oa", label: "Open access", sub: "of published output" },
      { key: "policy", label: "Policy & guidelines", sub: "citations in policy" },
      { key: "news", label: "News stories", sub: "press coverage" },
      { key: "countries", label: "Countries reached", sub: "geographic spread" },
      { key: "patents", label: "Patent references", sub: "cited in patents" },
      { key: "publications", label: "Research outputs", sub: "2026 publications" },
    ],
    summary: (entity, isAll, p, years) => {
      const who = isAll ? "the Taylor & Francis portfolio" : `${entity}'s journal portfolio`;
      const j = p.top_journals[0]?.name, st = top(p.stakeholders);
      let s = `In ${yearsPhrase(years)}, ${who} generated ${fmtFull(p.kpis.mentions)} mentions${j ? `, led by ${j}` : ""}.`;
      s += ` Engagement is mostly ${topChannel(p)}, reception is ${tone(p.sentiment)}${p.kpis.publications ? `, and ${pctOA(p.kpis)}% of output is open access` : ""}.`;
      if (st) s += ` Policy interest comes from ${st}.`;
      return s;
    },
  },
  authors: {
    label: "Authors", icon: "✎", lens: "author", blurb: "Individual contributors",
    accent: "#ea580c", accentDark: "#fb923c", grad: ["#ea580c", "#e11d48"],
    kpis: [
      { key: "publications", label: "Research outputs", sub: "authored (2026)" },
      { key: "citations", label: "Citations", sub: "accrued to date" },
      { key: "attention", label: "Attention score", sub: "sum of Altmetric scores" },
      { key: "mentions", label: "Total mentions", sub: "of their work" },
      { key: "topscore", label: "Top output score", sub: "best single paper" },
      { key: "oa", label: "Open access", sub: "of their outputs" },
      { key: "news", label: "News stories", sub: "press coverage" },
      { key: "policy", label: "Policy & guidelines", sub: "citations in policy" },
    ],
    summary: (entity, isAll, p, years) => {
      const who = isAll ? "Taylor & Francis authors" : entity;
      const co = p.network.nodes.filter((n) => n.name !== entity).sort(desc)[0]?.name;
      let s = `${who}${p.kpis.publications ? ` published ${fmtFull(p.kpis.publications)} Taylor & Francis outputs` : "'s work"} drawing ${fmtFull(p.kpis.attention)} attention${p.kpis.citations ? ` and ${fmtFull(p.kpis.citations)} citations` : ""} in ${yearsPhrase(years)}.`;
      s += ` The work travels via ${topChannel(p)}.`;
      if (co) s += ` Frequent co-authorship with ${co}.`;
      if (p.top_outputs[0]) s += ` Standout paper: “${p.top_outputs[0].title}”.`;
      return s;
    },
  },
};

export function kpiValue(key: string, p: Profile): { value: string } {
  const k = p.kpis;
  switch (key) {
    case "publications": return { value: fmt(k.publications) };
    case "mentions": return { value: fmt(k.mentions) };
    case "attention": return { value: fmt(k.attention) };
    case "policy": return { value: fmt(k.policy) };
    case "patents": return { value: fmt(k.patents) };
    case "news": return { value: fmt(k.news) };
    case "citations": return { value: fmt(k.citations) };
    case "oa": return { value: `${pctOA(k)}%` };
    case "countries": return { value: fmt(countriesReached(p)) };
    case "topscore": return { value: fmt(p.top_outputs[0]?.attention ?? 0) };
    default: return { value: "–" };
  }
}
export const PERSONA_ORDER: PersonaKey[] = ["researchers", "institutions", "societies", "authors"];
