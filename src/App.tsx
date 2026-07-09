import { useEffect, useMemo, useState } from "react";
import * as echarts from "echarts";
import {
  loadIndex, loadEntity, mergeProfiles, summaryFor, sectionSummary, exportReplicaPDF, pctOA, countriesReached, fmt, fmtFull,
  paletteFor, CHANNEL_COLORS, MAP_METRICS,
  type PortalIndex, type PersonaKey, type Cube, type Profile, type SumCtx,
} from "./lib";
import { useTheme } from "./theme";
import { Card, Kpi, RankedList, EntitySelect, Dropdown, MultiDropdown, ChannelSelect, Modal } from "./components";
import {
  EChart, hBar, channelBar, timelineArea, donut, worldMap, network,
} from "./charts";

const PERSONA_ORDER: PersonaKey[] = ["consortia", "societies"];

const KPI_SETS: Record<PersonaKey, { key: string; label: string; sub: string }[]> = {
  consortia: [
    { key: "publications", label: "Published papers", sub: "research outputs" },
    { key: "mentions", label: "Total mentions", sub: "worldwide" },
    { key: "attention", label: "Attention score", sub: "sum of Altmetric" },
    { key: "oa", label: "Open access", sub: "of the portfolio" },
    { key: "citations", label: "Citations", sub: "accrued to date" },
    { key: "countries", label: "Countries reached", sub: "geographic spread" },
    { key: "news", label: "News stories", sub: "press coverage" },
    { key: "policy", label: "Policy & guidelines", sub: "cited in policy" },
  ],
  societies: [
    { key: "mentions", label: "Total mentions", sub: "worldwide" },
    { key: "attention", label: "Attention score", sub: "sum of Altmetric" },
    { key: "oa", label: "Open access", sub: "of output" },
    { key: "policy", label: "Policy & guidelines", sub: "societal impact" },
    { key: "news", label: "News stories", sub: "press coverage" },
    { key: "countries", label: "Countries reached", sub: "geographic spread" },
    { key: "patents", label: "Patents", sub: "cited in patents" },
    { key: "publications", label: "Published papers", sub: "research outputs (2026)" },
  ],
};

// Societal-impact channels (multi-select filter). Values match mention_channel.
const SOC_CHANNELS = [
  { v: "Policy", label: "Policy" },
  { v: "Clinical guideline", label: "Clinical guidelines" },
  { v: "Patent", label: "Patents" },
];

export default function App() {
  const { dark, toggle } = useTheme();
  const [idx, setIdx] = useState<PortalIndex | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [persona, setPersona] = useState<PersonaKey>("consortia");
  const [entity, setEntity] = useState<string>("SANLIC");
  const [entityData, setEntityData] = useState<Cube | null>(null);
  const [loading, setLoading] = useState(false);
  const [pubYears, setPubYears] = useState<number[]>([]);
  const [impactYear, setImpactYear] = useState<string>("all");
  const [mapMetric, setMapMetric] = useState<string>("all");
  const [drill, setDrill] = useState<string | null>(null);
  const [socChannels, setSocChannels] = useState<string[]>(SOC_CHANNELS.map((c) => c.v));
  const [aiOpen, setAiOpen] = useState<{ key: string; title: string } | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    loadIndex().then((d) => { setIdx(d); setPubYears(d.meta.pubYears); }).catch((e) => console.error(e));
    fetch(`${import.meta.env.BASE_URL}world.json`).then((r) => r.json())
      .then((geo) => { echarts.registerMap("world", geo); setMapReady(true); })
      .catch((e) => console.error("map load failed", e));
  }, []);

  useEffect(() => {
    if (!idx) return;
    let alive = true;
    setLoading(true); setDrill(null);
    loadEntity(persona, entity).then((d) => { if (alive) { setEntityData(d); setLoading(false); } });
    return () => { alive = false; };
  }, [idx, persona, entity]);

  const cfg = idx?.personas[persona];
  const accent = cfg ? (dark ? cfg.accentDark : cfg.accent) : "#2f6bff";
  const p = useMemo(() => paletteFor(dark, accent), [dark, accent]);
  useEffect(() => {
    const r = document.documentElement.style;
    r.setProperty("--accent", accent);
    if (cfg) { r.setProperty("--grad-a", cfg.grad[0]); r.setProperty("--grad-b", cfg.grad[1]); }
  }, [accent, cfg]);

  const activeYears = (pubYears.length ? pubYears : idx?.meta.pubYears ?? []).map(String);
  const prof: Profile | null = useMemo(
    () => (entityData ? mergeProfiles(entityData, activeYears, impactYear) : null),
    [entityData, activeYears, impactYear]
  );

  if (!idx || !cfg) return <div className="loading"><div className="spin" /><div>Loading impact data…</div></div>;

  const isAll = entity === "__all__";
  const entityName = entity === "__all__" ? "Taylor & Francis Group"
    : cfg.entities.find((e) => e.id === entity)?.name ?? entity;
  // short, friendly name for the personalised greeting (drop the "— all members" suffix)
  const greetName = entity === "__all__" ? "Taylor & Francis" : entityName.replace(/\s*—\s*all members$/i, "");
  const kpiColors = [accent, p.series[1], p.series[2], p.series[4], p.series[5], p.series[3], p.series[6], p.series[7]];

  const timeline = prof ? prof.timeline : [];
  const has2026 = pubYears.includes(2026);
  const yearOpts = [{ v: "all", label: "All years" }, ...idx.meta.impactYears.map((y) => ({ v: String(y), label: String(y) }))];
  const metricLabel = MAP_METRICS.find((m) => m.key === mapMetric)?.label ?? "Mentions";
  const metricNoun = mapMetric === "all" ? "mentions" : metricLabel.toLowerCase();
  // aggregated documents attributed to the org: publications + policy/guideline + patent citations
  const totalDocs = prof ? prof.kpis.publications + prof.kpis.policy + prof.kpis.patents : 0;
  const drillItems = drill && prof ? prof.country_detail[mapMetric]?.[drill] ?? [] : [];

  // A mention cannot occur before its paper is published → an impact year earlier
  // than every selected publication year is an impossible combination (show nothing).
  const impossible = impactYear !== "all" && pubYears.length > 0 && Number(impactYear) < Math.min(...pubYears);

  const sumCtx: SumCtx = { entityName, years: activeYears, impactYear, mapMetric, persona };
  const openAi = (key: string, title: string) => setAiOpen({ key, title });
  const doExport = async () => {
    const node = document.querySelector<HTMLElement>(".app");
    if (!node) return;
    setAiOpen(null); setDrill(null); setExporting(true);
    try {
      await new Promise((r) => setTimeout(r, 120)); // let modal/drill close first
      const bg = getComputedStyle(document.body).backgroundColor;
      const safe = entityName.replace(/[^a-z0-9]+/gi, "_").slice(0, 40);
      await exportReplicaPDF(node, `PIX_${persona}_${safe}_pub-${activeYears.join("-")}_impact-${impactYear}`, bg);
    } catch (e) {
      console.error("export failed", e);
    } finally {
      setExporting(false);
    }
  };

  const pubEmpty = (
    <div className="empty"><div className="empty-ico">◔</div>
      <div>Publication-level detail is available for <b>2026</b> outputs.{!has2026 && <> Add 2026 to the filter.</>}</div>
    </div>
  );

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">PIX</div>
          <div className="brand-txt">
            <b>PIX <span className="brand-sub2">· {idx.meta.product.replace("PIX — ", "")}</span></b>
            <span>by {idx.meta.brand}</span>
          </div>
        </div>
        <nav className="ptabs">
          {PERSONA_ORDER.map((key) => {
            const c = idx.personas[key];
            return (
              <button key={key} className={"ptab" + (persona === key ? " on" : "")}
                style={{ ["--pa" as string]: dark ? c.accentDark : c.accent }}
                onClick={() => { setPersona(key); setEntity(c.default); }}>
                <span className="ptab-ico">{c.icon}</span>
                <span className="ptab-txt"><b>{c.label}</b><small>{c.blurb}</small></span>
              </button>
            );
          })}
        </nav>
        <button className="icon-btn" onClick={toggle} title="Toggle theme">{dark ? "☀" : "☾"}</button>
      </header>

      <div className="context">
        <div className="greet">
          <span className="hi">Impact dashboard · viewing as <b style={{ color: accent }}>{cfg.label}</b></span>
          <h1 className="who">Hello, {greetName}!</h1>
          {prof && (
            <div className="hero-docs">
              <b>{fmtFull(totalDocs)}</b> documents attributed
              <span className="hero-docs-sub">{fmtFull(prof.kpis.publications)} publications · {fmtFull(prof.kpis.policy)} policy &amp; guidelines · {fmtFull(prof.kpis.patents)} patents</span>
            </div>
          )}
        </div>
        <div className="ctrls">
          <MultiDropdown label="Publication year" values={pubYears} options={idx.meta.pubYears} onChange={setPubYears} />
          <Dropdown label="Impact year" value={impactYear} options={yearOpts} onChange={setImpactYear} width={160} />
          <EntitySelect label={cfg.entityLabel} current={entity} entities={cfg.entities} onSelect={setEntity}
            allLabel={persona === "consortia" ? "All (Taylor & Francis)" : "All journals (Taylor & Francis)"} />
          <button className="export-btn" onClick={doExport} disabled={!prof || exporting} title="Download an exact PDF of this dashboard">
            <span aria-hidden>⤓</span> {exporting ? "Exporting…" : "Export PDF"}
          </button>
        </div>
      </div>

      <main className="content">
        {loading || !prof ? (
          <div className="empty" style={{ justifyContent: "center", padding: 60 }}><div className="spin" /></div>
        ) : entityData === null ? (
          <div className="ai"><div className="ai-ico">◔</div><div className="ai-body">
            <h3>No impact data</h3><p>No mentions or 2026 publications recorded for <b>{entityName}</b> in this dataset.</p>
          </div></div>
        ) : impossible ? (
          <div className="ai"><div className="ai-ico">⚠</div><div className="ai-body">
            <h3>No data for this combination</h3>
            <p>A mention can't occur before its paper is published, so there's nothing to show for
            work published in {[...pubYears].sort().join(" / ")} that was mentioned in <b>{impactYear}</b>.
            Set the <b>Impact year</b> to “All years” or a year on/after {Math.min(...pubYears)}.</p>
          </div></div>
        ) : (
          <>
            <div className="ai">
              <div className="ai-ico">✦</div>
              <div className="ai-body">
                <h3>AI-generated impact summary <span className="ai-pill">{cfg.label} view</span></h3>
                <p>{summaryFor(persona, entityName, isAll, prof, activeYears, impactYear)}</p>
              </div>
            </div>

            <div className="kpis">
              {KPI_SETS[persona].map((spec, i) => (
                <Kpi key={spec.key} label={spec.label} sub={spec.sub} color={kpiColors[i % kpiColors.length]}
                  value={kpiVal(spec.key, prof)} />
              ))}
            </div>

            <div className="grid">
              <Card title="Global reach" sub="Impact by country — pick a metric, click a country" span={8} aiKey="map" onAi={openAi}
                actions={<Dropdown label="Metric" value={mapMetric} width={200}
                  options={MAP_METRICS.map((m) => ({ v: m.key, label: m.label }))} onChange={setMapMetric} />}>
                {mapReady
                  ? <EChart option={worldMap(prof.map_metrics[mapMetric] ?? [], p)} height={360}
                    onEvents={{ click: (e: any) => setDrill(e?.name ?? null) }} />
                  : <div className="card-note">Loading map…</div>}
              </Card>
              <Card title={drill ? `In ${drill}` : "Country detail"}
                sub={mapMetric === "all" ? "Top outputs mentioned there" : `Top outputs — ${metricLabel}`} span={4}>
                {drill
                  ? (drillItems.length
                    ? <div className="drill">{drillItems.map((it) => (
                      <div className="drow" key={it.title}>
                        <div className="dtitle">{it.title}</div>
                        <div className="dmeta"><span className="dchip">{it.channel}</span>{it.outlet && <span>{it.outlet}</span>}<span className="datt">{fmt(it.attention)} AAS</span></div>
                      </div>))}</div>
                    : <div className="card-note" style={{ paddingTop: 10 }}>No {metricNoun} from {drill} in this selection.</div>)
                  : <div className="empty"><div className="empty-ico">◍</div><div>Click a country on the map to see the top {metricNoun} from there.</div></div>}
              </Card>
            </div>

            <div className="grid">
              <Card title="Engagement over time" sub={impactYear === "all" ? "Dated mentions per month" : `Dated mentions · ${impactYear}`} span={7}
                aiKey="timeline" onAi={openAi}
                note="Covers dated mentions (news, policy, blogs, dated social). Use the Impact year filter to focus a year.">
                <EChart option={timelineArea(timeline, p)} height={280} />
              </Card>
              <Card title="Where impact happens" sub="Mentions by channel" span={5} aiKey="channels" onAi={openAi}>
                <EChart option={channelBar(prof.channels_ns, p, CHANNEL_COLORS)} height={280} />
              </Card>
            </div>

            <div className="grid">
              <Card title="Top countries" sub="By mention volume (excl. social media)" span={6} aiKey="countries" onAi={openAi}>
                {prof.countries_ns.some((c) => c.name !== "Unknown" && c.value > 0)
                  ? <EChart option={hBar(prof.countries_ns.filter((c) => c.name !== "Unknown").slice(0, 10), p)} height={300} />
                  : <div className="card-note" style={{ paddingTop: 10 }}>No country-level data for this selection.</div>}
              </Card>
              <Card title="Open research" sub="Open-access status" span={6} aiKey="oa" onAi={openAi}>
                {prof.kpis.publications > 0
                  ? <EChart height={300} option={donut(prof.oa_mix, p, {
                    centerValue: `${pctOA(prof.kpis)}%`, centerLabel: "open access",
                    colors: [p.series[2], p.series[0], p.series[7], p.series[3], p.mid]
                  })} />
                  : pubEmpty}
              </Card>
            </div>

            <div className="grid">
              <Card title="Societal impact" sub="Uptake in policy, clinical guidance & patents" span={7} aiKey="societal" onAi={openAi}
                actions={<ChannelSelect label="Channels" values={socChannels} options={SOC_CHANNELS} onChange={setSocChannels} />}>
                <div className="soc-stats">
                  {SOC_CHANNELS.filter((c) => socChannels.includes(c.v)).map((c) => (
                    <div className="soc-stat" key={c.v}>
                      <div className="soc-val">{fmt(prof.channels_ns.find((x) => x.name === c.v)?.value ?? 0)}</div>
                      <div className="soc-lbl">{c.label}</div>
                    </div>
                  ))}
                </div>
                {socChannels.some((c) => c === "Policy" || c === "Clinical guideline")
                  ? (prof.stakeholders.filter((s) => s.name !== "Unknown").length
                    ? <>
                        <div className="soc-sub">Organisations citing this research in policy</div>
                        <RankedList metric="citations"
                          items={prof.stakeholders.slice(0, 8).filter((s) => s.name !== "Unknown").map((s) => ({ name: s.name, value: s.value }))} />
                      </>
                    : <div className="card-note" style={{ paddingTop: 10 }}>No citing organisations recorded for this selection.</div>)
                  : <div className="card-note" style={{ paddingTop: 10 }}>Patent citations don’t carry a citing organisation — select Policy or Clinical guidelines to see stakeholders.</div>}
              </Card>
              <Card title="SDG alignment" sub="UN Sustainable Development Goals" span={5} aiKey="sdg" onAi={openAi}>
                {prof.sdg.length > 0 ? <EChart option={hBar(prof.sdg.slice(0, 8), p)} height={300} /> : pubEmpty}
              </Card>
            </div>

            <div className="grid">
              <Card title="Most-discussed research outputs" sub="By Altmetric Attention Score" span={7} aiKey="outputs" onAi={openAi}>
                <RankedList items={prof.top_outputs.slice(0, 8).map((o) => ({ name: o.title, sub: o.journal, value: o.attention }))} />
              </Card>
              <Card title="Top journals" sub="By mention volume" span={5} aiKey="journals" onAi={openAi}>
                <RankedList items={prof.top_journals.slice(0, 8).map((j) => ({ name: j.name, value: j.mentions }))} />
              </Card>
            </div>

            <div className="grid">
              <Card title="Contributor impact"
                sub={persona === "consortia" ? "Member institutions by research output (2026)" : "Top institutions by research output (2026)"}
                span={12} aiKey="contributors" onAi={openAi}
                note="Institutions credited on this entity’s 2026 research outputs (Dimensions research organisations).">
                {prof.contributors.length
                  ? <RankedList metric="outputs" items={prof.contributors.slice(0, 12).map((c) => ({ name: c.name, value: c.value }))} />
                  : pubEmpty}
              </Card>
            </div>

            <div className="grid">
              <Card span={12} title={persona === "consortia" ? "Institutional collaboration network" : "Research collaboration network"}
                sub="Countries co-publishing on the same outputs" aiKey="network" onAi={openAi}
                note="Node size = publications with a research organisation in that country; links = co-authored publications.">
                {prof.network.nodes.length > 1
                  ? <EChart option={network(prof.network, p)} height={420} />
                  : (has2026 ? <div className="card-note">Not enough multi-country collaborations to draw a network.</div> : pubEmpty)}
              </Card>
            </div>

            <footer className="foot">
              <span><b>{idx.meta.product}</b> · {idx.meta.brand}</span>
              <span>Sources: {Object.values(idx.meta.sources).map((s) => s.table).join(" · ")}</span>
              <span>{idx.meta.notes[0]}</span>
            </footer>
          </>
        )}
      </main>

      {aiOpen && prof && (
        <Modal title={aiOpen.title} onClose={() => setAiOpen(null)}>
          {sectionSummary(aiOpen.key, prof, sumCtx)}
        </Modal>
      )}
    </div>
  );
}

function kpiVal(key: string, p: Profile): string {
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
