<script>
  import { onMount } from "svelte";
  import * as d3 from "d3";

  let graphWidthCm = 21;
  let rowHeightCm = 2;
  let labelWidthCm = 5.5;
  let margin = { left: 0.3, right: 0.3, top: 0.1, bottom: 0.1 };

  let valueFields = [
    { key: "export", label: "Export (Real Value USD)" },
    { key: "normPCI", label: "Norm PCI" },
    { key: "normRCA", label: "Norm RCA" },
  ];
  let selectedField = valueFields[0].key;

  let modes = [
    { key: "raw", label: "Local" },
    { key: "normalized", label: "Global" },
    { key: "log", label: "Log" },
  ];
  let selectedMode = modes[0].key;

  let groupFields = [
    { key: "Chemical Vertical", label: "Chemical Vertical" },
    { key: "NACE-4 Labels", label: "NACE-4" },
    { key: "Nace-2 Label", label: "NACE-2" },
  ];
  let selectedGroupField = groupFields[0].key;

  let groupSortModes = [
    { key: "az", label: "Groups A–Z" },
    { key: "valueDesc", label: "Groups by total ↓" },
    { key: "valueAsc", label: "Groups by total ↑" },
  ];
  let selectedGroupSort = groupSortModes[0].key;

  let itemSortModes = [
    { key: "selectedFirst", label: "Selected first" },
    { key: "az", label: "Items A–Z" },
    { key: "valueDesc", label: "Items by total ↓" },
    { key: "valueAsc", label: "Items by total ↑" },
  ];
  let selectedItemSort = itemSortModes[0].key;

  let allYears = [];
  let raw = [];
  let series = [];
  let groups = [];
  let xScale;
  let selectedLabels = new Set();
  let collapsedGroups = new Set();

  function cmToPx(cm) {
    return (cm * 96) / 2.54;
  }

  function extractField(d, field) {
    if (field === "export") {
      return +String(d["Export (Real Value USD)"])
        .replace(/\./g, "")
        .replace(/,/g, "")
        .replace(/\s/g, "");
    } else if (field === "normPCI") {
      return parseFloat(String(d["Norm PCI"]).replace(",", "."));
    } else if (field === "normRCA") {
      return parseFloat(String(d["Norm RCA"]).replace(",", "."));
    }
    return 0;
  }

  function downloadSVG(svgNode, filename) {
    const clone = svgNode.cloneNode(true);

    const style = document.createElement("style");
    style.textContent = `
    .path{fill:none;stroke:#111;stroke-width:2;opacity:.7}
    .grid-line,.tick-line{display:none}
  `;
    clone.insertBefore(style, clone.firstChild);

    const serializer = new XMLSerializer();
    let svgString = serializer.serializeToString(clone);

    svgString = svgString.replace(
      /(<svg[^>]+)style="[^"]*background[^"]*"([^>]*>)/gi,
      "$1$2"
    );
    svgString = svgString.replace(/background:[^;"]*;?/gi, "");
    svgString = '<?xml version="1.0" encoding="UTF-8"?>\n' + svgString;

    const blob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    setTimeout(() => {
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }, 100);
  }

  async function downloadAllSVGs() {
    const svgs = Array.from(document.querySelectorAll("svg.row-svg"));
    for (let i = 0; i < svgs.length; i++) {
      const svg = svgs[i];
      const labelNode = svg
        .closest(".row")
        ?.querySelector(".label button, .label span");
      const name = (labelNode?.textContent || `chart_${i + 1}`)
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_\-]+/g, "_");
      downloadSVG(svg, `${name}.svg`);
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  function totalOfValues(values) {
    return d3.sum(values, (d) => d.value);
  }

  function buildSeries() {
    if (!raw.length || !allYears.length || !xScale) {
      series = [];
      groups = [];
      return;
    }

    let valuesFlat = raw
      .map((d) => extractField(d, selectedField))
      .filter((v) => !isNaN(v));
    let min = d3.min(valuesFlat) ?? 0;
    let max = d3.max(valuesFlat) ?? 1;

    const groupedByLabel = d3
      .groups(raw, (d) => d["HS92-4 Short Label"])
      .sort(([a], [b]) => d3.ascending(a, b));

    series = groupedByLabel.map(([label, values]) => {
      const group = values[0]?.[selectedGroupField] ?? "";
      const yearMap = new Map(
        values.map((d) => [d.Year, extractField(d, selectedField)])
      );

      const valuesAligned = allYears.map((year) => {
        let rawValue = yearMap.get(year);
        let value = rawValue === undefined || isNaN(rawValue) ? 0 : rawValue;

        if (selectedMode === "normalized") {
          value = max !== min ? (value - min) / (max - min) : 0;
        } else if (selectedMode === "log") {
          value = value > 0 ? Math.log(value) : 0;
        }
        return { year, value };
      });

      const rowHeightPx = cmToPx(rowHeightCm);
      const yDomain =
        selectedMode === "normalized"
          ? [0, 1]
          : [0, d3.max(valuesAligned, (d) => d.value) || 1];

      const y = d3
        .scaleLinear()
        .domain(yDomain)
        .range([rowHeightPx - cmToPx(margin.bottom), cmToPx(margin.top)]);

      const path = d3
        .line()
        .x((d) => xScale(d.year))
        .y((d) => y(d.value))(valuesAligned);

      const total = totalOfValues(valuesAligned);

      return { label, group, values: valuesAligned, y, path, total };
    });

    let g = d3
      .groups(series, (d) => d.group)
      .map(([key, items]) => {
        const total = d3.sum(items, (s) => s.total);
        return { key, items, total };
      });

    if (selectedGroupSort === "az") {
      g.sort((a, b) => d3.ascending(a.key || "", b.key || ""));
    } else if (selectedGroupSort === "valueDesc") {
      g.sort(
        (a, b) =>
          d3.descending(a.total, b.total) ||
          d3.ascending(a.key || "", b.key || "")
      );
    } else if (selectedGroupSort === "valueAsc") {
      g.sort(
        (a, b) =>
          d3.ascending(a.total, b.total) ||
          d3.ascending(a.key || "", b.key || "")
      );
    }

    g = g.map((grp) => {
      let items = grp.items.slice();
      if (selectedItemSort === "selectedFirst") {
        items.sort((a, b) => {
          const sa = selectedLabels.has(a.label) ? 0 : 1;
          const sb = selectedLabels.has(b.label) ? 0 : 1;
          return sa !== sb ? sa - sb : d3.ascending(a.label, b.label);
        });
      } else if (selectedItemSort === "az") {
        items.sort((a, b) => d3.ascending(a.label, b.label));
      } else if (selectedItemSort === "valueDesc") {
        items.sort(
          (a, b) =>
            d3.descending(a.total, b.total) || d3.ascending(a.label, b.label)
        );
      } else if (selectedItemSort === "valueAsc") {
        items.sort(
          (a, b) =>
            d3.ascending(a.total, b.total) || d3.ascending(a.label, b.label)
        );
      }
      return { ...grp, items };
    });

    groups = g;
  }

  function toggleLabel(label) {
    if (selectedLabels.has(label)) {
      selectedLabels.delete(label);
    } else {
      selectedLabels.add(label);
    }
    selectedLabels = selectedLabels;
  }

  function toggleCollapse(groupKey) {
    if (collapsedGroups.has(groupKey)) {
      collapsedGroups.delete(groupKey);
    } else {
      collapsedGroups.add(groupKey);
    }
    collapsedGroups = collapsedGroups;
  }

  $: {
    selectedField,
      selectedMode,
      selectedGroupField,
      selectedGroupSort,
      selectedItemSort,
      selectedLabels,
      rowHeightCm,
      graphWidthCm;

    if (allYears.length) {
      xScale = d3
        .scaleLinear()
        .domain(d3.extent(allYears))
        .range([
          cmToPx(margin.left),
          cmToPx(graphWidthCm) - cmToPx(margin.right),
        ]);
    }

    buildSeries();
  }

  $: {
    if (allYears.length) {
      xScale = d3
        .scaleLinear()
        .domain(d3.extent(allYears))
        .range([
          cmToPx(margin.left),
          cmToPx(graphWidthCm) - cmToPx(margin.right),
        ]);
    }

    buildSeries();
  }

  onMount(async () => {
    const data = await d3.dsv(";", "data/data.csv", (d) => ({
      ...d,
      Year: +d.Year,
    }));
    raw = data;

    allYears = Array.from(new Set(data.map((d) => d.Year))).sort(
      (a, b) => a - b
    );
  });
</script>

<div class="menu no-print">
  <div class="controls">
    <label>
      Group by:
      <select bind:value={selectedGroupField}>
        {#each groupFields as f}
          <option value={f.key}>{f.label}</option>
        {/each}
      </select>
    </label>
    <label>
      Group sort:
      <select bind:value={selectedGroupSort}>
        {#each groupSortModes as m}
          <option value={m.key}>{m.label}</option>
        {/each}
      </select>
    </label>
    <label>
      Item sort:
      <select bind:value={selectedItemSort}>
        {#each itemSortModes as m}
          <option value={m.key}>{m.label}</option>
        {/each}
      </select>
    </label>
  </div>
  <div class="controls">
    <label>
      Parameter:
      <select bind:value={selectedField}>
        {#each valueFields as f}
          <option value={f.key}>{f.label}</option>
        {/each}
      </select>
    </label>
    <label>
      Mode:
      {#each modes as m}
        <label>
          <input type="radio" bind:group={selectedMode} value={m.key} />
          {m.label}
        </label>
      {/each}
    </label>
  </div>
  <div class="controls">
    <label>
      Graph width (cm):
      <input
        type="number"
        step="0.1"
        min="5"
        max="60"
        bind:value={graphWidthCm}
      />
    </label>
    <label>
      Row height (cm):
      <input
        type="number"
        step="0.1"
        min="0.5"
        max="10"
        bind:value={rowHeightCm}
      />
    </label>
    <button on:click={downloadAllSVGs}>Download all rows as SVG</button>
    <div class="hint">
      Chart height: {(rowHeightCm * series.length).toFixed(1)} cm
    </div>
  </div>
</div>

<article id="chart">
  {#if groups.length > 0}
    <div class="header-row">
      <div class="label" style="width:{labelWidthCm}cm;">&nbsp;</div>
      <svg class="ticks-svg" width={graphWidthCm + "cm"} height={"1cm"}>
        {#each allYears as year, i}
          {#if allYears.length < 21 || i % Math.ceil(allYears.length / 20) === 0 || i === allYears.length - 1}
            <g>
              <line
                x1={xScale(year)}
                x2={xScale(year)}
                y1={0}
                y2={cmToPx(rowHeightCm)}
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

    {#each groups as g}
      <div class="group">
        <div class="group-header" on:click={() => toggleCollapse(g.key)}>
          <div class="group-title">{g.key || "Unassigned"}</div>
          <div class="group-meta">
            Items: {g.items.length} • Total: {d3.format(",.2f")(g.total)}
          </div>
        </div>
        {#if !collapsedGroups.has(g.key)}
          {#each g.items as d}
            <div class="row">
              <div class="label" style="width:{labelWidthCm}cm;">
                <span>{d.label}</span>
              </div>

              <svg
                class="row-svg"
                width={graphWidthCm + "cm"}
                height={rowHeightCm + "cm"}
              >
                {#each allYears as year, j}
                  {#if allYears.length < 21 || j % Math.ceil(allYears.length / 20) === 0 || j === allYears.length - 1}
                    <line
                      x1={xScale(year)}
                      x2={xScale(year)}
                      y1={0}
                      y2={cmToPx(rowHeightCm)}
                      class="grid-line"
                    />
                  {/if}
                {/each}
                <path
                  d={d.path}
                  class="path {selectedLabels.has(d.label) ? 'selected' : ''}"
                />
              </svg>
            </div>
          {/each}
        {/if}
      </div>
    {/each}
  {:else}
    <p>Loading data...</p>
  {/if}
</article>

<style>
  :root {
    --accent: #111;
    --muted: #999;
    --grid: #eee;
    --bg: #fff;
    --chip: #f5f5f5;
    --group-bg: #fafafa;
  }
  article, * {
    font-family: Arial, Helvetica, sans-serif;
  }
  .menu {
    display: grid;
    gap: 0.75rem;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    align-items: end;
    margin-bottom: 0.75rem;
  }
  .controls {
    display: flex;
    gap: 0.75rem;
    align-items: center;
    flex-wrap: wrap;
  }
  .hint {
    font-size: 12px;
    color: var(--muted);
  }
  .header-row,
  .row {
    display: flex;
    align-items: baseline;
  }
  .header-row {
    align-items: flex-end;
    position: sticky;
    top: 0;
    background: var(--bg);
    z-index: 10;
    border-bottom: 1px solid var(--grid);
  }

  .label {
    font-size: 14px;
    text-align: right;
    padding-right: 8px;
    white-space: nowrap;
    display: flex;
    align-items: center;
    justify-content: flex-end;
  }
  .label span {
    border: 1px solid var(--grid);
    background: var(--chip);
    padding: 4px 8px;
    border-radius: 999px;
    font-size: 12px;
  }

  .tick-line,
  .grid-line {
    stroke: var(--grid);
    stroke-width: 1;
  }
  .tick-label {
    font-size: 8px;
    fill: var(--accent);
  }
  .row-svg {
    display: block;
  }
  .path {
    fill: none !important;
    stroke: var(--accent);
    stroke-width: 2;
    opacity: 1;
  }

  .group {
    border: 1px solid var(--grid);
    margin-bottom: 10px;
    background: var(--group-bg);
  }
  .group-header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    padding: 8px 10px;
    cursor: pointer;
    user-select: none;
    border-bottom: 1px solid var(--grid);
  }
  .group-title {
    font-weight: bold;
    font-size: 14px;
  }
  .group-meta {
    color: var(--muted);
    font-size: 12px;
  }
  input[type="number"] {
    width: 70px;
  }
  @media print {
    @page {
      size: 21cm auto;
      margin: 0;
    }

    :global(.no-p.pathrint),
    .no-print * {
      display: none !important;
    }

    #chart,
    article {
      background: #fff !important;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
  }
</style>
