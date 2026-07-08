import ReactECharts from "echarts-for-react";
import type { EChartsOption } from "echarts";
import { fmt, fmtFull, type NV, type Network, type Palette } from "./lib";

export function EChart({ option, height = 260, onEvents }: {
  option: EChartsOption; height?: number; onEvents?: Record<string, (params: any) => void>;
}) {
  return (
    <ReactECharts
      option={option}
      style={{ height, width: "100%" }}
      notMerge
      lazyUpdate
      opts={{ renderer: "canvas" }}
      onEvents={onEvents}
      className="echart"
    />
  );
}

const tip = (p: Palette) => ({
  backgroundColor: p.surface,
  borderColor: p.grid,
  borderWidth: 1,
  textStyle: { color: p.ink, fontSize: 12 },
  extraCssText: "box-shadow:0 8px 24px -12px rgba(0,0,0,.35);border-radius:10px;",
});

const axisText = (p: Palette) => ({ color: p.muted, fontSize: 11 });

// ---------------- horizontal bar (categories) ----------------
export function hBar(data: NV[], p: Palette, opts: { colors?: string[]; unit?: string; max?: number } = {}): EChartsOption {
  const rows = [...data].filter((d) => d.value > 0).sort((a, b) => a.value - b.value);
  const colors = opts.colors ?? rows.map(() => p.accent);
  return {
    grid: { left: 4, right: 46, top: 6, bottom: 4, containLabel: true },
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" }, ...tip(p),
      valueFormatter: (v) => fmtFull(v as number) + (opts.unit ? " " + opts.unit : "") },
    xAxis: { type: "value", max: opts.max, axisLabel: { show: false }, splitLine: { show: false }, axisLine: { show: false }, axisTick: { show: false } },
    yAxis: { type: "category", data: rows.map((r) => r.name),
      axisLabel: { ...axisText(p), width: 150, overflow: "truncate" },
      axisLine: { show: false }, axisTick: { show: false } },
    series: [{
      type: "bar", data: rows.map((r, i) => ({ value: r.value, itemStyle: { color: colors[colors.length - rows.length + i] ?? p.series[0] } })),
      barWidth: "62%",
      itemStyle: { borderRadius: [0, 4, 4, 0] },
      label: { show: true, position: "right", formatter: (o: any) => fmt(o.value), color: p.ink2, fontSize: 11, fontWeight: 600 },
    }],
  };
}

// channel bar with fixed per-channel identity colors
export function channelBar(data: NV[], p: Palette, channelColors: Record<string, number>): EChartsOption {
  const rows = [...data].filter((d) => d.value > 0).sort((a, b) => a.value - b.value);
  return {
    ...hBar(rows, p),
    series: [{
      type: "bar",
      data: rows.map((r) => ({ value: r.value, itemStyle: { color: p.series[channelColors[r.name] ?? 0] } })),
      barWidth: "62%",
      itemStyle: { borderRadius: [0, 4, 4, 0] },
      label: { show: true, position: "right", formatter: (o: any) => fmt(o.value), color: p.ink2, fontSize: 11, fontWeight: 600 },
    }],
  };
}

// ---------------- sentiment spectrum (diverging, single stacked row) ----------------
const SENT_LIGHT = ["#b3261e", "#e34948", "#f0a6a5", "#c9d2df", "#9ec5f4", "#2a78d6", "#184f95"];
const SENT_DARK = ["#e66767", "#d55181", "#a23b52", "#3a475c", "#5598e7", "#3987e5", "#9ec5f4"];
export function sentimentSpectrum(data: NV[], p: Palette, dark: boolean): EChartsOption {
  const colors = dark ? SENT_DARK : SENT_LIGHT;
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  return {
    grid: { left: 4, right: 4, top: 8, bottom: 4, containLabel: false },
    tooltip: { trigger: "item", ...tip(p),
      formatter: (o: any) => `${o.seriesName}<br/><b>${fmtFull(o.value)}</b> (${((o.value / total) * 100).toFixed(1)}%)` },
    xAxis: { type: "value", show: false, max: total },
    yAxis: { type: "category", show: false, data: ["s"] },
    series: data.map((d, i) => ({
      name: d.name, type: "bar", stack: "t", data: [d.value],
      itemStyle: { color: colors[i], borderColor: p.surface, borderWidth: 2 },
      label: {
        show: d.value / total > 0.06, position: "inside", formatter: () => fmt(d.value),
        color: i === 3 ? p.ink2 : "#fff", fontSize: 11, fontWeight: 700,
      },
    })),
  };
}

// ---------------- timeline area ----------------
export function timelineArea(data: NV[], p: Palette): EChartsOption {
  return {
    grid: { left: 6, right: 14, top: 14, bottom: 4, containLabel: true },
    tooltip: { trigger: "axis", ...tip(p), valueFormatter: (v) => fmtFull(v as number) + " mentions" },
    xAxis: {
      type: "category", data: data.map((d) => d.name), boundaryGap: false,
      axisLabel: { ...axisText(p), formatter: (v: string) => v.slice(0, 7) },
      axisLine: { lineStyle: { color: p.axis } }, axisTick: { show: false },
    },
    yAxis: {
      type: "value", axisLabel: { ...axisText(p), formatter: (v: number) => fmt(v) },
      splitLine: { lineStyle: { color: p.grid } }, axisLine: { show: false },
    },
    series: [{
      type: "line", data: data.map((d) => d.value), smooth: true, symbol: "circle", symbolSize: 7,
      showSymbol: false, lineStyle: { width: 2.5, color: p.accent }, itemStyle: { color: p.accent },
      areaStyle: {
        color: {
          type: "linear", x: 0, y: 0, x2: 0, y2: 1,
          colorStops: [
            { offset: 0, color: p.accent + "66" },
            { offset: 1, color: p.accent + "05" },
          ],
        },
      },
    }],
  };
}

// ---------------- donut ----------------
export function donut(data: NV[], p: Palette, opts: { centerLabel?: string; centerValue?: string; colors?: string[] } = {}): EChartsOption {
  const rows = data.filter((d) => d.value > 0);
  const colors = opts.colors ?? p.series;
  return {
    tooltip: { trigger: "item", ...tip(p), valueFormatter: (v) => fmtFull(v as number) },
    legend: { bottom: 0, left: "center", textStyle: { color: p.ink2, fontSize: 11 }, itemWidth: 11, itemHeight: 11, icon: "roundRect" },
    series: [{
      type: "pie", radius: ["58%", "82%"], center: ["50%", "44%"], avoidLabelOverlap: true,
      itemStyle: { borderColor: p.surface, borderWidth: 2, borderRadius: 3 },
      label: { show: false }, labelLine: { show: false },
      data: rows.map((r, i) => ({ name: r.name, value: r.value, itemStyle: { color: colors[i % colors.length] } })),
    }],
    ...(opts.centerValue ? {
      graphic: {
        type: "group", left: "center", top: "36%",
        children: [
          { type: "text", style: { text: opts.centerValue, fontSize: 24, fontWeight: 700, fill: p.ink, textAlign: "center" }, left: "center" },
          { type: "text", top: 30, style: { text: opts.centerLabel ?? "", fontSize: 11, fill: p.muted, textAlign: "center" }, left: "center" },
        ],
      },
    } : {}),
  } as EChartsOption;
}

// ---------------- world choropleth ----------------
export function worldMap(data: NV[], p: Palette): EChartsOption {
  // piecewise buckets so the US doesn't flatten every other country to invisible
  const pieces = [
    { min: 10000, label: "10k+", color: p.seq[5] },
    { min: 2000, max: 9999, label: "2k–10k", color: p.seq[4] },
    { min: 500, max: 1999, label: "500–2k", color: p.seq[3] },
    { min: 100, max: 499, label: "100–500", color: p.seq[2] },
    { min: 1, max: 99, label: "1–100", color: p.seq[1] },
  ];
  return {
    tooltip: { trigger: "item", ...tip(p),
      formatter: (o: any) => `${o.name}<br/><b>${o.value != null && !Number.isNaN(o.value) ? fmtFull(o.value) : 0}</b> mentions` },
    visualMap: {
      type: "piecewise", left: 8, bottom: 8, pieces, itemWidth: 13, itemHeight: 13,
      textStyle: { color: p.muted, fontSize: 10 }, itemGap: 4,
    },
    series: [{
      type: "map", map: "world", roam: false, silent: false,
      itemStyle: { areaColor: p.mid, borderColor: p.surface, borderWidth: 0.4 },
      emphasis: { itemStyle: { areaColor: p.series[2] }, label: { show: false } },
      select: { disabled: true },
      data: data.map((d) => ({ name: d.name, value: d.value })),
    }],
  };
}

// ---------------- network graph ----------------
export function network(net: Network, p: Palette): EChartsOption {
  const max = Math.max(...net.nodes.map((n) => n.value), 1);
  const maxE = Math.max(...net.edges.map((e) => e.value), 1);
  return {
    tooltip: { ...tip(p),
      formatter: (o: any) => o.dataType === "edge"
        ? `${o.data.source} — ${o.data.target}<br/><b>${o.data.value}</b> co-published`
        : `${o.name}<br/><b>${fmtFull(o.value)}</b> publications` },
    series: [{
      type: "graph", layout: "force", roam: true, draggable: true,
      force: { repulsion: 220, edgeLength: [40, 110], gravity: 0.12 },
      label: { show: true, color: p.ink2, fontSize: 10, position: "right" },
      lineStyle: { color: p.grid, curveness: 0.12 },
      emphasis: { focus: "adjacency", lineStyle: { color: p.accent, width: 2 } },
      data: net.nodes.map((n) => ({
        name: n.name, value: n.value,
        symbolSize: 12 + (n.value / max) * 34,
        itemStyle: { color: p.accent },
      })),
      links: net.edges.map((e) => ({
        source: e.source, target: e.target, value: e.value,
        lineStyle: { width: 1 + (e.value / maxE) * 5 },
      })),
    }],
  };
}
