"use client";

import type { AnalyticsMetric } from "@veza/contracts";
import { useMemo, useState } from "react";

function fmt(value: number, unit: string): string {
  if (unit === "%" || unit.toLowerCase().includes("percent")) {
    return `${value.toLocaleString("en-ZA", { maximumFractionDigits: 1 })}%`;
  }
  return `${value.toLocaleString("en-ZA", { maximumFractionDigits: 1 })}${unit ? ` ${unit}` : ""}`;
}

function when(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unavailable";
  return new Intl.DateTimeFormat("en-ZA", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Africa/Johannesburg",
  }).format(date);
}

function freshness(seconds: number): string {
  if (seconds < 60) return "Updated less than a minute ago";
  if (seconds < 3600) return `Updated ${Math.max(1, Math.round(seconds / 60))} min ago`;
  if (seconds < 86400) return `Updated ${Math.max(1, Math.round(seconds / 3600))} hr ago`;
  return `Updated ${Math.max(1, Math.round(seconds / 86400))} d ago`;
}

function chartPoints(values: readonly number[], width = 760, height = 230): string {
  if (!values.length) return "";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  return values.map((value, index) => {
    const x = values.length === 1 ? width / 2 : (index / (values.length - 1)) * width;
    const y = height - 12 - ((value - min) / range) * (height - 24);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
}

function axisLabels(values: readonly number[], unit: string): readonly string[] {
  if (!values.length) return [fmt(0, unit), fmt(0, unit), fmt(0, unit)];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const mid = min + (max - min) / 2;
  return [fmt(max, unit), fmt(mid, unit), fmt(min, unit)];
}

function trendCopy(current: AnalyticsMetric, previous: AnalyticsMetric | undefined): string {
  if (!previous) return "This is the first available governed snapshot for this metric.";
  const delta = current.value - previous.value;
  if (delta === 0) return "No change from the previous governed snapshot.";
  return `${delta > 0 ? "Up" : "Down"} ${fmt(Math.abs(delta), current.unit)} from the previous governed snapshot.`;
}

export function AnalyticsReferenceWorkspace({ metrics }: { metrics: readonly AnalyticsMetric[] }) {
  const groups = useMemo(() => {
    const map = new Map<string, AnalyticsMetric[]>();
    for (const metric of metrics) {
      const rows = map.get(metric.key) ?? [];
      rows.push(metric);
      map.set(metric.key, rows);
    }
    return [...map.entries()].map(([key, rows]) => {
      const ordered = [...rows].sort((a, b) => a.measuredAt.localeCompare(b.measuredAt));
      const latest = ordered.at(-1);
      if (!latest) throw new Error(`Analytics metric ${key} has no snapshots`);
      return { key, rows: ordered, latest };
    });
  }, [metrics]);

  const [selectedKey, setSelectedKey] = useState(groups[0]?.key ?? "");
  const selected = groups.find((group) => group.key === selectedKey) ?? groups[0];

  if (!selected) {
    return (
      <div className="vz-analytics-reference">
        <div className="vz-empty-state">
          <strong>No metric snapshots</strong>
          <p>Analytics appears only after governed metric definitions and measured snapshots exist.</p>
        </div>
      </div>
    );
  }

  const selectedRows = selected.rows.slice(-8);
  const selectedValues = selectedRows.map((row) => row.value);
  const trendPoints = chartPoints(selectedValues.length > 1 ? selectedValues : [selectedValues[0] ?? 0, selectedValues[0] ?? 0]);
  const labels = axisLabels(selectedValues, selected.latest.unit);
  const previous = selected.rows[selected.rows.length - 2];

  return (
    <div className="vz-analytics-reference">
      <header className="vz-analytics-heading">
        <div>
          <p>Insights</p>
          <h1>Institution performance</h1>
          <span>Select a governed metric to understand its current value, trend, freshness and evidence.</span>
        </div>
        <div className="vz-analytics-freshness">
          <span>Latest snapshot</span>
          <strong>{when(selected.latest.measuredAt)}</strong>
        </div>
      </header>

      <section className="vz-analytics-metric-strip" aria-label="Available performance metrics">
        {groups.map((group) => {
          const current = group.latest;
          const prior = group.rows[group.rows.length - 2];
          const delta = prior ? current.value - prior.value : undefined;
          const active = selected.key === group.key;
          return (
            <button
              type="button"
              key={group.key}
              className={active ? "active" : ""}
              aria-pressed={active}
              onClick={() => setSelectedKey(group.key)}
            >
              <span>{current.title}</span>
              <strong>{fmt(current.value, current.unit)}</strong>
              <small>{delta === undefined ? "First snapshot" : `${delta >= 0 ? "+" : ""}${fmt(delta, current.unit)} from previous`}</small>
              <em>{freshness(current.freshnessSeconds)}</em>
            </button>
          );
        })}
      </section>

      <section className="vz-analytics-dashboard" aria-label={`${selected.latest.title} analysis`}>
        <article className="vz-analytics-trend-panel">
          <header>
            <div>
              <p>Performance trend</p>
              <h2>{selected.latest.title}</h2>
              <span>{trendCopy(selected.latest, previous)}</span>
            </div>
            <strong>{fmt(selected.latest.value, selected.latest.unit)}</strong>
          </header>

          <div className="vz-analytics-line-chart">
            <div className="vz-chart-y" aria-hidden="true">
              {labels.map((label) => <span key={label}>{label}</span>)}
            </div>
            <svg viewBox="0 0 760 230" role="img" aria-label={`${selected.latest.title} trend`} preserveAspectRatio="none">
              <path className="grid" d="M0 12H760M0 115H760M0 218H760" />
              <polyline className="line" points={trendPoints} />
              {trendPoints.split(" ").filter(Boolean).map((point, index) => {
                const [cx, cy] = point.split(",");
                return <circle key={`${cx}-${cy}-${index}`} cx={cx} cy={cy} r="4" />;
              })}
            </svg>
            <div className="vz-chart-x">
              {selectedRows.map((row) => <span key={row.measuredAt}>{when(row.measuredAt)}</span>)}
            </div>
          </div>

          <footer>
            <span>Source current to {when(selected.latest.sourceMaxOccurredAt)}</span>
            <span>{selectedRows.length} snapshot{selectedRows.length === 1 ? "" : "s"} shown</span>
          </footer>
        </article>

        <aside className="vz-analytics-definition" aria-labelledby="metric-evidence-title">
          <header>
            <div>
              <p>Metric evidence</p>
              <h2 id="metric-evidence-title">What this number means</h2>
            </div>
            <code>{selected.latest.key}</code>
          </header>
          <dl>
            <div>
              <dt>Definition</dt>
              <dd>{selected.latest.description}</dd>
            </div>
            <div>
              <dt>Measured</dt>
              <dd>{when(selected.latest.measuredAt)}</dd>
            </div>
            <div>
              <dt>Freshness</dt>
              <dd>{freshness(selected.latest.freshnessSeconds)}</dd>
            </div>
            <div>
              <dt>Drill-through filter</dt>
              <dd><pre>{JSON.stringify(selected.latest.drillthroughFilter ?? {}, null, 2)}</pre></dd>
            </div>
          </dl>
        </aside>
      </section>
    </div>
  );
}
