/** Bar charts for the report, drawn with Vega-Lite and written as SVG. */
import * as vega from 'vega';
import { type TopLevelSpec, compile } from 'vega-lite';

/** How much of a dataset a library read correctly, by size: all, at least 95%, at least half, or less. */
export type Coverage = 'all' | 'most' | 'half' | 'failed';

/** One bar: a library's value on a dataset, the text at its tip, and how much of the dataset it covers. */
export interface Bar {
  readonly dataset: string;
  readonly library: string;
  readonly value: number;
  readonly label: string;
  readonly coverage: Coverage;
}

/** What a chart shows, in the order its panels and bars go. */
export interface BarChart {
  readonly title: string;
  readonly subtitle: readonly string[];
  readonly datasets: readonly string[];
  readonly libraries: readonly string[];
  readonly bars: readonly Bar[];
  /** A shared top for every panel's scale, such as 100 for percentages; each panel scales to its own data without it. */
  readonly max?: number;
}

// The light chart surface, exemplar's accent, the others' gray, the coverage warnings, and inks checked against it.
const SURFACE = '#f3f3f0';
const ACCENT = '#2a78d6';
const OTHERS = '#898781';
const MOST = '#e07b39';
const HALF = '#b42318';
const INK = '#0b0b0b';
const SECONDARY = '#52514e';
const GRID = '#dcdbd4';
const BASELINE = '#c3c2b7';
const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** The Vega-Lite spec: a panel per dataset with its own scale, a bar per library, exemplar's in the accent, partial coverage in orange or red. */
function spec(chart: BarChart): TopLevelSpec {
  const y = { field: 'library', type: 'nominal', sort: [...chart.libraries], title: null } as const;
  const x = { field: 'value', type: 'quantitative', title: null } as const;
  return {
    $schema: 'https://vega.github.io/schema/vega-lite/v6.json',
    title: { text: chart.title, subtitle: [...chart.subtitle] },
    background: SURFACE,
    padding: 16,
    data: { values: [...chart.bars] },
    facet: { field: 'dataset', type: 'nominal', sort: [...chart.datasets], title: null },
    columns: 2,
    resolve: { scale: { x: 'independent' } },
    spacing: { row: 32, column: 56 },
    spec: {
      width: 300,
      height: { step: 26 },
      layer: [
        {
          mark: { type: 'bar', cornerRadiusEnd: 4, height: 18 },
          encoding: {
            y,
            x: {
              ...x,
              axis: { tickCount: 3, format: '~s' },
              ...(chart.max !== undefined && { scale: { domain: [0, chart.max] } }),
            },
            color: {
              condition: [
                { test: "datum.library === 'exemplar'", value: ACCENT },
                { test: "datum.coverage === 'half'", value: HALF },
                { test: "datum.coverage === 'most'", value: MOST },
              ],
              value: OTHERS,
            },
          },
        },
        {
          mark: { type: 'text', align: 'left', baseline: 'middle', dx: 5, fontSize: 12, color: SECONDARY },
          encoding: { y, x, text: { field: 'label' } },
        },
      ],
    },
    config: {
      font: FONT,
      view: { stroke: null },
      title: { anchor: 'start', color: INK, fontSize: 18, subtitleColor: SECONDARY, subtitleFontSize: 13, offset: 14 },
      header: { labelAnchor: 'start', labelColor: INK, labelFontSize: 14, labelFontWeight: 600, labelPadding: 8 },
      axis: {
        labelColor: SECONDARY,
        labelFontSize: 12,
        titleColor: SECONDARY,
        titleFontSize: 12,
        titleFontWeight: 'normal',
        domainColor: BASELINE,
        tickColor: BASELINE,
        gridColor: GRID,
      },
      axisY: { grid: false, ticks: false, domain: false, labelPadding: 8 },
      axisX: { grid: true, domain: false },
    },
  };
}

/** Renders a chart as an SVG document. */
export function renderChart(chart: BarChart): Promise<string> {
  const compiled = compile(spec(chart)).spec;
  const view = new vega.View(vega.parse(compiled), { renderer: 'none' });
  return view.toSVG();
}
