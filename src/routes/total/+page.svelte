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

  function makePath(values, x, y) {
    let str = "";
    for (let i = 0; i < values.length; i++) {
      let v = values[i];
      str +=
        (i === 0 ? "M" : "L") +
        x(v.year) +
        "," +
        y(isNaN(v.export) ? 0 : v.export);
    }
    return str;
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

      let y = d3
        .scaleLinear()
        .domain([0, globalMax])
        .range([height - margin.bottom, margin.top]);

      return {
        label,
        values: valuesAligned,
        y,
        path: makePath(valuesAligned, xScale, y),
      };
    });
  });
</script>

<article>
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
            </g>
          {/if}
        {/each}
      </svg>
    </div>
    {#each data as d}
      <div class="row">
        <div class="label" style="width:{labelWidth}px;">
          {d.label}
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

  .header-row,
  .row {
    display: flex;
    align-items: baseline;
  }

  .header-row {
    align-items: flex-end;
    position: fixed;
    top: 0;
  }

  .label {
    font-family: inherit;
    font-size: 14px;
    color: #222;
    text-align: right;
    padding-right: 8px;
    white-space: nowrap;
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
