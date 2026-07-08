import { useEffect, useMemo, useState } from "react";
import * as echarts from "echarts";
import {
  loadPortal, paletteFor, mergeProfiles, pctOA, kpiValue, fmt,
  PERSONA_CFG, PERSONA_ORDER, CHANNEL_COLORS,
  type Portal, type PersonaKey,
} from "./lib";
import { useTheme } from "./theme";
import { Card, Segmented, RankedList, EntitySelect, YearMulti } from "./components";
import {
  EChart, hBar, channelBar, sentimentSpectrum, timelineArea, donut, worldMap, network,
} from "./charts";

export default function App() {
  const { dark, toggle } = useTheme();
  const [portal, setPortal] = useState<Portal | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [persona, setPersona] = useState<PersonaKey>("researchers");
  const [entity, setEntity] = useState<string>("__all__");
  const [years, setYears] = useState<number[]>([]);
  const [tlYear, setTlYear] = useState<"all" | string>("all");

  useEffect(() => {
    loadPortal().then((pt) => { setPortal(pt); setYears(pt.meta.years); }).catch((e) => console.error(e));
    fetch(`${import.meta.env.BASE_URL}world.json`).then((r) => r.json())
      .then((geo) => { echarts.registerMap("world", geo); setMapReady(true); })
      .catch((e) => console.error("map load failed", e));
  }, []);

  const cfg = PERSONA_CFG[persona];
  const accent = dark ? cfg.accentDark : cfg.accent;
  const p = useMemo(() => paletteFor(dark, accent), [dark, accent]);

  useEffect(() => {
    const r = document.documentElement.style;
    r.setProperty("--accent", accent);
    r.setProperty("--grad-a", cfg.grad[0]);
    r.setProperty("--grad-b", cfg.grad[1]);
  }, [accent, cfg]);

  const prof = useMemo(() => {
    if (!portal) return null;
    const yp = portal.personas[persona].profiles[entity] ?? portal.personas[persona].profiles["__all__"];
    const ys = (years.length ? years : portal.meta.years).map(String);
    return mergeProfiles(yp, ys);
  }, [portal, persona, entity, years]);

  if (!portal || !prof) {
    return <div className="loading"><div className="spin" /><div>Loading impact data…</div></div>;
  }

  const per = portal.personas[persona];
  const isAll = entity === "__all__";
  const entityName = isAll ? "Taylor & Francis Group" : entity;
  const yearsStr = (years.length ? years : portal.meta.years).map(String);
  const summary = cfg.summary(entityName, isAll, prof, yearsStr);
  const has2026 = years.includes(2026);
  const kpiColors = [accent, p.series[1], p.series[2], p.series[4], p.series[5], p.series[3], p.series[6], p.series[7]];
  const timeline = prof.timeline.filter((d) => tlYear === "all" || d.name.startsWith(tlYear));

  const pubEmpty = (
    <div className="empty">
      <div className="empty-ico">◔</div>
      <div>Publication-level detail is available for <b>2026</b> outputs in this dataset.
        {!has2026 && <> Add 2026 to the year filter to view.</>}</div>
    </div>
  );

  return (
    <div className="app">
      {/* ===== top bar ===== */}
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">PIX</div>
          <div className="brand-txt">
            <b>PIX <span className="brand-sub2">· Publication Impact Portal</span></b>
            <span>by Taylor &amp; Francis Group</span>
          </div>
        </div>
        <nav className="ptabs">
          {PERSONA_ORDER.map((key) => {
            const c = PERSONA_CFG[key];
            return (
              <button key={key} className={"ptab" + (persona === key ? " on" : "")}
                style={{ "--pa": dark ? c.accentDark : c.accent } as React.CSSProperties}
                onClick={() => { setPersona(key); setEntity("__all__"); }}>
                <span className="ptab-ico">{c.icon}</span>
                <span className="ptab-txt"><b>{c.label}</b><small>{c.blurb}</small></span>
              </button>
            );
          })}
        </nav>
        <button className="icon-btn" onClick={toggle} title="Toggle theme">{dark ? "☀" : "☾"}</button>
      </header>

      {/* ===== context row ===== */}
      <div className="context">
        <div className="greet">
          <span className="hi">Impact dashboard · viewing as <b style={{ color: accent }}>{cfg.label}</b></span>
          <h1 className="who">{entityName}</h1>
        </div>
        <div className="ctrls">
          <YearMulti years={portal.meta.years} selected={years} onChange={setYears} />
          <EntitySelect label={per.entityLabel} current={entity} entities={per.entities} onSelect={setEntity} />
        </div>
      </div>

      <main className="content">
        {/* AI summary hero */}
        <div className="ai">
          <div className="ai-ico">✦</div>
          <div className="ai-body">
            <h3>AI-generated impact summary <span className="ai-pill">{cfg.label} view</span></h3>
            <p>{summary}</p>
          </div>
        </div>

        {/* KPI bento */}
        <div className="kpis">
          {cfg.kpis.map((spec, i) => (
            <div className="kpi" key={spec.key}>
              <div className="k-top"><span className="k-dot" style={{ background: kpiColors[i % kpiColors.length] }} />{spec.label}</div>
              <div className="k-val">{kpiValue(spec.key, prof).value}</div>
              <div className="k-sub">{spec.sub}</div>
            </div>
          ))}
        </div>

        {/* timeline + channels */}
        <div className="grid">
          <Card title="Engagement over time" sub="Dated mentions per month" span={7}
            note="Covers mentions carrying a date (news, policy, blogs, dated social). Undated social posts are excluded here."
            actions={<Segmented value={tlYear} onChange={setTlYear}
              options={[{ v: "all", label: "All" }, ...portal.meta.years.map((y) => ({ v: String(y), label: String(y) }))]} />}>
            <EChart option={timelineArea(timeline, p)} height={280} />
          </Card>
          <Card title="Where impact happens" sub="Mentions by channel" span={5}>
            <EChart option={channelBar(prof.channels, p, CHANNEL_COLORS)} height={280} />
          </Card>
        </div>

        {/* map + top countries */}
        <div className="grid">
          <Card title="Global reach" sub="Mentions by country" span={7}>
            {mapReady ? <EChart option={worldMap(prof.countries_top, p)} height={340} /> : <div className="card-note">Loading map…</div>}
          </Card>
          <Card title="Top countries" sub="By mention volume" span={5}>
            {prof.countries_top.some((c) => c.name !== "Unknown" && c.value > 0)
              ? <EChart option={hBar(prof.countries_top.filter((c) => c.name !== "Unknown").slice(0, 10), p)} height={340} />
              : <div className="card-note" style={{ paddingTop: 12 }}>No country-level data for this selection.</div>}
          </Card>
        </div>

        {/* sentiment + OA + SDG */}
        <div className="grid">
          <Card title="Reception" sub="Sentiment of mentions" span={4}>
            <EChart option={sentimentSpectrum(prof.sentiment, p, dark)} height={64} />
            <div className="spectrum-legend"><span>◀ Critical</span><span>Neutral</span><span>Positive ▶</span></div>
            <div style={{ marginTop: 12 }}>
              <RankedList items={[...prof.sentiment].reverse().filter((s) => s.value > 0).map((s) => ({ name: s.name, value: s.value }))} />
            </div>
          </Card>
          <Card title="Open research" sub="Open-access status of outputs" span={4}>
            {prof.kpis.publications > 0
              ? <EChart height={300} option={donut(prof.oa_mix, p, {
                  centerValue: `${pctOA(prof.kpis)}%`, centerLabel: "open access",
                  colors: [p.series[2], p.series[0], p.series[7], p.series[3], p.mid] })} />
              : pubEmpty}
          </Card>
          <Card title="SDG alignment" sub="UN Sustainable Development Goals" span={4}>
            {prof.sdg.length > 0 ? <EChart option={hBar(prof.sdg.slice(0, 8), p)} height={300} /> : pubEmpty}
          </Card>
        </div>

        {/* stakeholders + pub mix */}
        <div className="grid">
          <Card title="Knowledge & policy stakeholders" sub="Organisations citing this research in policy" span={7}>
            <RankedList metric="citations"
              items={prof.stakeholders.slice(0, 10).filter((s) => s.name !== "Unknown").map((s) => ({ name: s.name, value: s.value }))} />
          </Card>
          <Card title="Publication mix" sub="By document type" span={5}>
            {prof.pub_mix.length > 0 ? <EChart option={hBar(prof.pub_mix.slice(0, 7), p)} height={280} /> : pubEmpty}
          </Card>
        </div>

        {/* top journals + outputs */}
        <div className="grid">
          <Card title={persona === "societies" ? "Society journals" : "Top journals"} sub="By mention volume" span={5}>
            <RankedList items={prof.top_journals.slice(0, 8).map((j) => ({ name: j.name, value: j.mentions, value2: `· ${fmt(j.attention)} AAS` }))} />
          </Card>
          <Card title={persona === "authors" ? "Their most-discussed work" : "Most-discussed research outputs"} sub="By Altmetric Attention Score" span={7}>
            <RankedList items={prof.top_outputs.slice(0, 8).map((o) => ({ name: o.title, sub: o.journal, value: o.attention }))} />
          </Card>
        </div>

        {/* network */}
        <div className="grid">
          <Card span={12}
            title={persona === "authors" ? "Co-authorship network" : persona === "institutions" ? "Institutional collaboration network" : "Research collaboration network"}
            sub="Countries co-publishing on the same outputs"
            note="Node size = publications with a research organisation in that country; links = co-authored publications between two countries.">
            {prof.network.nodes.length > 1
              ? <EChart option={network(prof.network, p)} height={430} />
              : has2026
                ? <div className="card-note">Not enough multi-country collaborations in this selection to draw a network.</div>
                : pubEmpty}
          </Card>
        </div>

        <footer className="foot">
          <span><b>{portal.meta.product}</b> · {portal.meta.brand}</span>
          <span>Sources: {Object.values(portal.meta.sources).map((s) => s.table).join(" · ")}</span>
          <span>{portal.meta.notes[0]}</span>
        </footer>
      </main>
    </div>
  );
}
