"use client";

import type { AnalyticsMetric } from "@veza/contracts";
import { useMemo, useState } from "react";
import { Icon } from "../../components/icon";

function fmt(value: number, unit: string): string {
  if (unit === "%" || unit.toLowerCase().includes("percent")) return `${value.toLocaleString("en-ZA", { maximumFractionDigits: 1 })}%`;
  return `${value.toLocaleString("en-ZA", { maximumFractionDigits: 1 })}${unit ? ` ${unit}` : ""}`;
}

function when(value: string): string {
  return new Intl.DateTimeFormat("en-ZA", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Johannesburg" }).format(new Date(value));
}

function points(values: readonly number[], width = 260, height = 72): string {
  if (!values.length) return "";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  return values.map((value, index) => {
    const x = values.length === 1 ? width / 2 : (index / (values.length - 1)) * width;
    const y = height - 8 - ((value - min) / range) * (height - 16);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
}

function Sparkline({ values }: { values: readonly number[] }) {
  const chartPoints = points(values.length > 1 ? values : [values[0] ?? 0, values[0] ?? 0], 92, 30);
  return <svg className="vz-analytics-spark" viewBox="0 0 92 30" role="img" aria-label="Metric trend"><path d="M0 24H92" /><polyline points={chartPoints} /></svg>;
}

export function AnalyticsReferenceWorkspace({ metrics }: { metrics: readonly AnalyticsMetric[] }) {
  const groups = useMemo(() => {
    const map = new Map<string, AnalyticsMetric[]>();
    for (const metric of metrics) {
      const rows = map.get(metric.key) ?? [];
      rows.push(metric);
      map.set(metric.key, rows.sort((a, b) => a.measuredAt.localeCompare(b.measuredAt)));
    }
    return [...map.entries()].map(([key, rows]) => ({ key, rows, latest: rows[rows.length - 1]! }));
  }, [metrics]);
  const [selectedKey, setSelectedKey] = useState(groups[0]?.key ?? "");
  const selected = groups.find((group) => group.key === selectedKey) ?? groups[0];
  const selectedValues = selected?.rows.map((row) => row.value) ?? [];
  const trendPoints = points(selectedValues.length > 1 ? selectedValues : [selectedValues[0] ?? 0, selectedValues[0] ?? 0], 760, 230);

  if (!groups.length) return <div className="vz-analytics-reference"><div className="vz-empty-state"><strong>No metric snapshots</strong><p>Analytics appears only after governed metric definitions and measured snapshots exist.</p></div></div>;

  return <div className="vz-analytics-reference">
    <header className="vz-analytics-heading">
      <div><p>INSIGHTS</p><h1>Institution performance</h1><span>Governed metrics with visible freshness, definitions and drill-through context.</span></div>
      <div className="vz-analytics-tools"><button type="button"><Icon name="calendar" /> Current period</button><button type="button"><Icon name="filter" /> Filters</button><button type="button"><Icon name="download" /> Export</button></div>
    </header>

    <section className="vz-analytics-kpis" aria-label="Key performance metrics">
      {groups.slice(0, 4).map((group) => {
        const current = group.latest;
        const previous = group.rows[group.rows.length - 2];
        const delta = previous ? current.value - previous.value : undefined;
        return <button key={group.key} className={selected?.key === group.key ? "active" : ""} onClick={() => setSelectedKey(group.key)}>
          <div><span>{current.title}</span><small>{current.freshnessSeconds < 3600 ? "Fresh" : `${Math.round(current.freshnessSeconds / 3600)}h old`}</small></div>
          <strong>{fmt(current.value, current.unit)}</strong>
          <footer>{delta !== undefined ? <em className={delta >= 0 ? "up" : "down"}>{delta >= 0 ? "+" : ""}{delta.toLocaleString("en-ZA", { maximumFractionDigits: 1 })}</em> : <em>Latest snapshot</em>}<Sparkline values={group.rows.map((row) => row.value)} /></footer>
        </button>;
      })}
    </section>

    <section className="vz-analytics-dashboard">
      <article className="vz-analytics-trend-panel">
        <header><div><p>PERFORMANCE TREND</p><h2>{selected?.latest.title}</h2><span>{selected?.latest.description}</span></div><strong>{selected ? fmt(selected.latest.value, selected.latest.unit) : ""}</strong></header>
        <div className="vz-analytics-line-chart">
          <div className="vz-chart-y"><span>High</span><span>Mid</span><span>Low</span></div>
          <svg viewBox="0 0 760 230" role="img" aria-label={`${selected?.latest.title ?? "Metric"} trend`} preserveAspectRatio="none">
            <path className="grid" d="M0 32H760M0 115H760M0 198H760" />
            <polyline className="line" points={trendPoints} />
            {trendPoints.split(" ").filter(Boolean).map((point, index) => { const [cx, cy] = point.split(","); return <circle key={`${cx}-${cy}-${index}`} cx={cx} cy={cy} r="4" />; })}
          </svg>
          <div className="vz-chart-x">{selected?.rows.map((row) => <span key={row.measuredAt}>{when(row.measuredAt)}</span>)}</div>
        </div>
        <footer><span>Definition: {selected?.latest.description}</span><span>Source current to {selected ? when(selected.latest.sourceMaxOccurredAt) : ""}</span></footer>
      </article>

      <aside className="vz-analytics-signal-panel">
        <header><div><p>METRIC REGISTER</p><h2>Signals</h2></div><span>{groups.length}</span></header>
        <div>{groups.slice(0, 7).map((group, index) => <button key={group.key} className={selected?.key === group.key ? "active" : ""} onClick={() => setSelectedKey(group.key)}><span className="vz-signal-rank">{String(index + 1).padStart(2, "0")}</span><div><strong>{group.latest.title}</strong><small>{group.latest.key}</small></div><b>{fmt(group.latest.value, group.latest.unit)}</b></button>)}</div>
      </aside>
    </section>

    <section className="vz-analytics-lower-grid">
      <article className="vz-analytics-comparison"><header><div><p>COMPARISON</p><h2>Current metric values</h2></div><Icon name="sliders" /></header><div>{groups.slice(0, 6).map((group) => { const localMax = Math.max(...groups.map((item) => Math.abs(item.latest.value)), 1); return <div key={group.key}><span>{group.latest.title}</span><div><i style={{ width: `${Math.max(4, Math.min(100, Math.abs(group.latest.value) / localMax * 100))}%` }} /></div><strong>{fmt(group.latest.value, group.latest.unit)}</strong></div>; })}</div></article>
      <article className="vz-analytics-definition"><header><div><p>DRILL THROUGH</p><h2>Metric evidence</h2></div><code>{selected?.latest.key}</code></header><dl><div><dt>Measured</dt><dd>{selected ? when(selected.latest.measuredAt) : ""}</dd></div><div><dt>Freshness</dt><dd>{selected?.latest.freshnessSeconds.toLocaleString("en-ZA")} seconds</dd></div><div><dt>Definition</dt><dd>{selected?.latest.description}</dd></div><div><dt>Filter</dt><dd><pre>{JSON.stringify(selected?.latest.drillthroughFilter ?? {}, null, 2)}</pre></dd></div></dl></article>
    </section>
  </div>;
}
