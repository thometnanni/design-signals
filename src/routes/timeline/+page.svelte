<script>
  import { onMount } from "svelte";
  import * as d3 from "d3";

  let graphWidthCm = 21;
  let rowHeightCm = 2;
  let labelWidthCm = 8.5;
  let margin = { left: 0.3, right: 0.3, top: 0.1, bottom: 0.1 };

  let valueFields = [
    { key: "normRCA", label: "Norm RCA" },
    { key: "normPCI", label: "Norm PCI" },
    { key: "export", label: "Export (Real Value USD)" },
    { key: "tradeBalanceDiff", label: "Trade balance" },
  ];
  let selectedField = valueFields[0].key;

  let modes = [
    { key: "normalized", label: "Global" },
    { key: "raw", label: "Local" },
    { key: "log", label: "Log" },
  ];
  let selectedMode = modes[0].key;

  let groupFields = [
    { key: "Chemical Vertical", label: "Chemical Vertical" },
    { key: "Nace-2 Label", label: "NACE-2" },
    { key: "NACE-4 Labels", label: "NACE-4" },
    { key: "HS92-2 Short Label", label: "HS92-2" },
    { key: "HS92-4 Short Label", label: "HS92-4" },
  ];
  let selectedGroupField = groupFields[0].key;

  let groupSortModes = [
    { key: "az", label: "Groups A–Z" },
    { key: "valueDesc", label: "Groups by total ↓" },
    { key: "valueAsc", label: "Groups by total ↑" },
  ];
  let selectedGroupSort = groupSortModes[0].key;

  let itemSortModes = [
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
  function num(x) {
    if (x == null) return 0;

    const s = String(x).trim().replace(/\s/g, "");

    if (/,/.test(s) && /\./.test(s)) {
      if (s.lastIndexOf(",") > s.lastIndexOf(".")) {
        return parseFloat(s.replace(/\./g, "").replace(",", "."));
      }
    }

    const cleaned = s.replace(/(?<=\d)[.,](?=\d{3}(\D|$))/g, "");
    return parseFloat(cleaned.replace(",", "."));
  }

  function getCol(d, names) {
    for (const n of names) if (d[n] != null) return d[n];
    return 0;
  }

  function extractField(d, field) {
    if (field === "export") {
      return num(
        getCol(d, ["Export (Real Value USD)", "Export  (Real Value USD)"])
      );
    } else if (field === "import") {
      return num(
        getCol(d, ["Import (Real Value USD)", "Import  (Real Value USD)"])
      );
    } else if (field === "normPCI") {
      return parseFloat(String(getCol(d, ["Norm PCI"])).replace(",", ".")) || 0;
    } else if (field === "normRCA") {
      return parseFloat(String(getCol(d, ["Norm RCA"])).replace(",", ".")) || 0;
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

    const groupedByLabel = d3
      .groups(raw, (d) => String(d["HS92-4 Short Label"] ?? "").trim())
      .sort(([a], [b]) => d3.ascending(a, b));

    let valuesFlat = [];
    for (const [, values] of groupedByLabel) {
      const byYearExp = d3.rollup(
        values,
        (vv) => d3.sum(vv, (dd) => extractField(dd, "export")),
        (dd) => dd.Year
      );
      const byYearImp = d3.rollup(
        values,
        (vv) => d3.sum(vv, (dd) => extractField(dd, "import")),
        (dd) => dd.Year
      );

      if (selectedField === "tradeBalanceDiff") {
        const startYear = allYears[0];
        const tb0 =
          (byYearExp.get(startYear) ?? 0) - (byYearImp.get(startYear) ?? 0);
        for (const y of allYears) {
          const tb = (byYearExp.get(y) ?? 0) - (byYearImp.get(y) ?? 0);
          valuesFlat.push(tb - tb0);
        }
      } else {
        const byYearSel = d3.rollup(
          values,
          (vv) => d3.sum(vv, (dd) => extractField(dd, selectedField)),
          (dd) => dd.Year
        );
        for (const y of allYears) valuesFlat.push(byYearSel.get(y) ?? 0);
      }
    }

    const min = d3.min(valuesFlat) ?? 0;
    const max = d3.max(valuesFlat) ?? 1;

    const rowHeightPx = cmToPx(rowHeightCm);
    let yLogGlobal = null;
    if (selectedMode === "log") {
      const lo = min,
        hi = max;
      const pad = lo === hi ? (hi === 0 ? 1 : Math.abs(hi) * 0.1) : 0;
      yLogGlobal = d3
        .scaleSymlog()
        .constant(1)
        .domain([lo - pad, hi + pad])
        .range([rowHeightPx - cmToPx(margin.bottom), cmToPx(margin.top)])
        .clamp(true);
    }

    series = groupedByLabel.map(([label, values]) => {
      const group = values[0]?.[selectedGroupField] ?? "";

      const byYearExp = d3.rollup(
        values,
        (vv) => d3.sum(vv, (dd) => extractField(dd, "export")),
        (dd) => dd.Year
      );
      const byYearImp = d3.rollup(
        values,
        (vv) => d3.sum(vv, (dd) => extractField(dd, "import")),
        (dd) => dd.Year
      );
      const byYearSel = d3.rollup(
        values,
        (vv) => d3.sum(vv, (dd) => extractField(dd, selectedField)),
        (dd) => dd.Year
      );

      const startYear = allYears[0];
      const tb0 =
        (byYearExp.get(startYear) ?? 0) - (byYearImp.get(startYear) ?? 0);

      const valuesAligned = allYears.map((y) => {
        let value;
        if (selectedField === "tradeBalanceDiff") {
          const tb = (byYearExp.get(y) ?? 0) - (byYearImp.get(y) ?? 0);
          value = tb - tb0;
        } else {
          value = byYearSel.get(y) ?? 0;
        }
        if (selectedMode === "normalized") {
          value = max !== min ? (value - min) / (max - min) : 0.5;
        }
        return { year: y, value };
      });

      let y;
      if (selectedMode === "log") {
        y = yLogGlobal;
      } else {
        const vMin = d3.min(valuesAligned, (d) => d.value) ?? 0;
        const vMax = d3.max(valuesAligned, (d) => d.value) ?? 1;
        y = d3
          .scaleLinear()
          .domain(
            selectedMode === "normalized"
              ? [0, 1]
              : vMin < 0
                ? [vMin, vMax]
                : [0, vMax || 1]
          )
          .range([rowHeightPx - cmToPx(margin.bottom), cmToPx(margin.top)]);
      }

      const path = d3
        .line()
        .x((d) => xScale(d.year))
        .y((d) => y(d.value))(valuesAligned);

      const total = totalOfValues(valuesAligned);
      return { label, group, values: valuesAligned, y, path, total };
    });

    let g = d3
      .groups(series, (d) => d.group)
      .map(([key, items]) => ({
        key,
        items,
        total: d3.sum(items, (s) => s.total),
      }));

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
        <div class="group-header">
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
  article,
  * {
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
