<script>
  import { onMount } from "svelte";
  import * as d3 from "d3";

  let data = [];
  let allYears = [];
  let xScale;
  let width = 600;
  let height = 36;
  let margin = { left: 10, right: 10, top: 4, bottom: 4 };
  let labelWidth = 280;
  let mode = "global";

  function makePath(values, x, y, valueField = "export") {
    let str = "";
    for (let i = 0; i < values.length; i++) {
      let v = values[i];
      let val = v[valueField];
      str += (i === 0 ? "M" : "L") + x(v.year) + "," + y(isNaN(val) ? 0 : val);
    }
    return str;
  }

  function percentile(arr, p) {
    if (!arr.length) return 0;
    let sorted = arr.slice().sort((a, b) => a - b);
    let idx = (p / 100) * (sorted.length - 1);
    let lower = Math.floor(idx);
    let upper = Math.ceil(idx);
    if (lower === upper) return sorted[lower];
    return sorted[lower] + (sorted[upper] - sorted[lower]) * (idx - lower);
  }

  onMount(async () => {
    let raw = await d3.dsv(";", "/data/data.csv", (d) => ({
      label: d["HS92-4 Short Label"],
      year: +d.Year,
      export: +String(d["Export (Real Value USD)"])
        .replace(/\./g, "")
        .replace(/,/g, "")
        .replace(/\s/g, ""),
    }));

    allYears = Array.from(new Set(raw.map((d) => d.year))).sort(
      (a, b) => a - b
    );

    xScale = d3
      .scaleLinear()
      .domain([allYears[0], allYears[allYears.length - 1]])
      .range([margin.left, width - margin.right]);

    const globalMax = d3.max(raw, (d) => d.export) || 1;

    let grouped = d3
      .groups(raw, (d) => d.label)
      .sort(([a], [b]) => d3.ascending(a, b));

    data = grouped.map(([label, values]) => {
      let yearMap = Object.fromEntries(values.map((d) => [d.year, d.export]));
      let valuesAligned = allYears.map((year) => {
        let v = yearMap[year];
        return {
          year,
          export: v != null && !isNaN(v) ? v : 0,
        };
      });

      let first = valuesAligned.find((v) => v.export > 0);
      let base = first ? first.export : 1;
      let normed = valuesAligned.map((v) => ({
        ...v,
        exportNorm: base !== 0 ? v.export / base : 0,
      }));

      let series = valuesAligned.map((d) => d.export);
      let p05 = percentile(series, 5);
      let p95 = percentile(series, 95);

      return {
        label,
        values: valuesAligned,
        normed,
        p05,
        p95,
        globalMax,
      };
    });
  });

  $: processedData = data.map((d) => {
    let y;
    let path;
    if (mode === "global") {
      y = d3
        .scaleLinear()
        .domain([0, d.globalMax])
        .range([height - margin.bottom, margin.top]);
      path = makePath(d.values, xScale, y, "export");
    } else if (mode === "local") {
      let localMax = d3.max(d.values, (v) => v.export) || 1;
      y = d3
        .scaleLinear()
        .domain([0, localMax])
        .range([height - margin.bottom, margin.top]);
      path = makePath(d.values, xScale, y, "export");
    } else if (mode === "normalized") {
      let maxNorm = d3.max(d.normed, (v) => v.exportNorm) || 1;
      y = d3
        .scaleLinear()
        .domain([0, maxNorm])
        .range([height - margin.bottom, margin.top]);
      path = makePath(d.normed, xScale, y, "exportNorm");
    } else if (mode === "clamped") {
      y = d3
        .scaleLinear()
        .domain([d.p05, d.p95])
        .range([height - margin.bottom, margin.top]);
      path = makePath(d.values, xScale, y, "export");
    }
    return {
      label: d.label,
      y,
      path,
      p05: d.p05,
      p95: d.p95,
    };
  });
</script>

<article>
  <div class="controls">
    <label>
      Y scale:
      <select bind:value={mode}>
        <option value="global">Global (absolute values)</option>
        <option value="local">Local (per row)</option>
        <option value="normalized">Normalized (first year = 1)</option>
        <option value="clamped">Percentile Clamped (5–95%)</option>
      </select>
    </label>
  </div>
  {#if data.length > 0}
    <div class="header-row">
      <div class="label" style="width:{labelWidth}px;">&nbsp;</div>
      <svg class="ticks-svg" {width} {height}>
        {#each allYears as year, i}
          {#if allYears.length < 21 || i % Math.ceil(allYears.length / 20) === 0 || i === allYears.length - 1}
            <g>
              <line
                x1={xScale(year)}
                x2={xScale(year)}
                y1={0}
                y2={height}
                class="tick-line"
              />
              <text
                x={xScale(year)}
                y={13}
                text-anchor="middle"
                class="tick-label">{year}</text
              >
              >
            </g>
          {/if}
        {/each}
      </svg>
    </div>
    {#each processedData as d}
      <div class="row">
        <div class="label" style="width:{labelWidth}px;">
          {d.label}
          {#if mode === "clamped"}
            <span class="sparkline-percentiles">
              <span style="color:#bbb;"
                >[p5: {d3.format(".2s")(d.p05)}, p95: {d3.format(".2s")(
                  d.p95
                )}]</span
              >
            </span>
          {/if}
        </div>
        <svg class="svg" {width} {height}>
          {#each allYears as year, i}
            {#if allYears.length < 21 || i % Math.ceil(allYears.length / 20) === 0 || i === allYears.length - 1}
              <line
                x1={xScale(year)}
                x2={xScale(year)}
                y1={0}
                y2={height}
                class="grid-line"
              />
            {/if}
          {/each}
          <path d={d.path} class="path" />
        </svg>
      </div>
    {/each}
  {:else}
    <p>Loading data...</p>
  {/if}
</article>

<style>
  article {
    font-family: Arial, Helvetica, sans-serif;
  }

  .controls {
    margin-bottom: 1.2em;
    font-size: 15px;
  }

  .header-row,
  .row {
    display: flex;
    align-items: baseline;
  }

  .header-row {
    align-items: flex-end;
  }

  .label {
    font-family: inherit;
    font-size: 14px;
    color: #222;
    text-align: right;
    padding-right: 8px;
    white-space: nowrap;
  }

  .sparkline-percentiles {
    font-size: 11px;
    margin-left: 8px;
  }

  .tick-line {
    stroke: #eee;
    stroke-width: 1;
  }

  .tick-label {
    font-size: 8px;
    fill: #111;
  }

  .svg {
    background: #fff;
    display: block;
  }

  .grid-line {
    stroke: #eee;
    stroke-width: 1;
  }

  .path {
    fill: none;
    stroke: #111;
    stroke-width: 2;
  }
</style>
