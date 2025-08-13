<script>
  import * as d3 from "d3";
  import { onMount } from "svelte";
  import Row from "$lib/components/Row.svelte";
  import ScaleControls from "$lib/components/ScaleControls.svelte";
  import { cmToPx } from "$lib/units";
  import { createNormalizer } from "$lib/scales";
  import { downloadAllSVGs } from "$lib/download-svg";

  let graphWidthCm = 21;
  let rowHeightCm = 1;
  let amplitudeCm = 6;
  let labelWidthCm = 8.5;
  let margin = { left: 0.3, right: 0.3, top: 0.1, bottom: 0.1 };

  let scaleType = "symlog";
  let scaleParam = Math.pow(2, 29);

  const valueFields = [
    { key: "tradeBalanceDiff", label: "Trade balance" },
    { key: "export", label: "Export (Real Value USD)" },
    { key: "normPCI", label: "Norm PCI" },
    { key: "normRCA", label: "Norm RCA" },
  ];
  let selectedField = valueFields[0].key;

  const groupFields = [
    { key: "Chemical Vertical", label: "Chemical Vertical" },
    { key: "Nace-2 Label", label: "NACE-2" },
    { key: "NACE-4 Labels", label: "NACE-4" },
    { key: "HS92-2 Short Label", label: "HS92-2" },
    { key: "HS92-4 Short Label", label: "HS92-4" },
  ];
  let selectedGroupField = groupFields[0].key;

  const groupSortModes = [
    { key: "az", label: "Groups A–Z" },
    { key: "valueDesc", label: "Groups by intensity ↓" },
    { key: "valueAsc", label: "Groups by intensity ↑" },
  ];
  let selectedGroupSort = groupSortModes[0].key;

  const itemSortModes = [
    { key: "az", label: "Items A–Z" },
    { key: "valueDesc", label: "Items by intensity ↓" },
    { key: "valueAsc", label: "Items by intensity ↑" },
  ];
  let selectedItemSort = itemSortModes[0].key;

  let raw = [];
  let allYears = [];
  let xScale;
  let series = [];
  let groups = [];
  let selectedLabels = new Set();
  let collapsedGroups = new Set();

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

  function buildSeries() {
    if (!raw.length || !allYears.length || !xScale) {
      series = [];
      groups = [];
      return;
    }

    const groupedByLabel = d3
      .groups(raw, (d) => String(d["HS92-4 Short Label"] ?? "").trim())
      .sort(([a], [b]) => d3.ascending(a, b));

    const temp = [];
    let globalAbsMax = 0;

    for (const [label, values] of groupedByLabel) {
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

      let baseYear;
      if (selectedField === "tradeBalanceDiff") {
        baseYear =
          allYears.find(
            (y) =>
              (byYearExp.get(y) ?? 0) !== 0 || (byYearImp.get(y) ?? 0) !== 0
          ) ?? allYears[0];
      } else {
        baseYear =
          allYears.find((y) => (byYearSel.get(y) ?? 0) !== 0) ?? allYears[0];
      }

      const baseVal =
        selectedField === "tradeBalanceDiff"
          ? (byYearExp.get(baseYear) ?? 0) - (byYearImp.get(baseYear) ?? 0)
          : (byYearSel.get(baseYear) ?? 0);

      const valuesAligned = allYears.map((y) => {
        const v =
          selectedField === "tradeBalanceDiff"
            ? (byYearExp.get(y) ?? 0) - (byYearImp.get(y) ?? 0)
            : (byYearSel.get(y) ?? 0);
        const delta = v - baseVal;
        globalAbsMax = Math.max(globalAbsMax, Math.abs(delta));
        return { year: y, value: delta };
      });

      const intensity = d3.sum(valuesAligned, (d) => Math.abs(d.value));
      temp.push({ label, group, valuesAligned, intensity });
    }

    if (!Number.isFinite(globalAbsMax) || globalAbsMax === 0)
      globalAbsMax = 1e-9;
    const amplitudePx = cmToPx(amplitudeCm);

    series = temp.map(({ label, group, valuesAligned, intensity }) => {
      const svgH = cmToPx(rowHeightCm);
      const baselineY = svgH / 2;

      const norm = createNormalizer(globalAbsMax, scaleType, scaleParam);
      const toY = (delta) => baselineY - norm(delta) * amplitudePx;

      const path = d3
        .line()
        .x((d) => xScale(d.year))
        .y((d) => toY(d.value))(valuesAligned);

      return {
        label,
        group,
        values: valuesAligned,
        path,
        y: {
          domain: () => [-globalAbsMax, globalAbsMax],
          baselineY,
          toY,
          scaleType,
          scaleParam,
          _: "pulsar",
        },
        total: intensity,
      };
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
      if (selectedItemSort === "az") {
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
      selectedGroupField,
      selectedGroupSort,
      selectedItemSort,
      selectedLabels,
      rowHeightCm,
      graphWidthCm,
      amplitudeCm,
      scaleType,
      scaleParam;

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

  const setSelectedField = (v) => (selectedField = v);
  const setRowHeightCm = (v) => (rowHeightCm = v);
  const setGraphWidthCm = (v) => (graphWidthCm = v);
  const setAmplitudeCm = (v) => (amplitudeCm = v);
  const setScaleType = (v) => (scaleType = v);
  const setScaleParam = (v) => (scaleParam = v);
  const onDownloadAll = () => downloadAllSVGs();
</script>

<div class="menu no-print">
  <ScaleControls
    {valueFields}
    {selectedField}
    {rowHeightCm}
    {graphWidthCm}
    {amplitudeCm}
    {scaleType}
    {scaleParam}
    {onDownloadAll}
    {setSelectedField}
    {setRowHeightCm}
    {setGraphWidthCm}
    {setAmplitudeCm}
    {setScaleType}
    {setScaleParam}
  />

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
</div>

<article
  id="chart"
  style="padding-top: {amplitudeCm / 2}cm; padding-bottom: {amplitudeCm / 2}cm;"
>
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
        <div class="group-header" style="height:{rowHeightCm + 'cm'};">
          <div class="group-title">{g.key || "Unassigned"}</div>
        </div>

        {#if !collapsedGroups.has(g.key)}
          {#each g.items as d}
            <Row
              label={d.label}
              path={d.path}
              {rowHeightCm}
              {graphWidthCm}
              {margin}
              {allYears}
              {xScale}
              selected={selectedLabels.has(d.label)}
            />
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

  .header-row {
    display: flex;
    align-items: flex-end;
    position: sticky;
    top: 0;
    background: var(--bg);
    z-index: 10;
    border-bottom: 1px solid var(--grid);
  }
  .label {
    width: 8.5cm;
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

  .group {
    background: var(--group-bg);
  }
  .group-title {
    font-weight: bold;
    font-size: 14px;
  }

  @media print {
    @page {
      size: 21cm auto;
      margin: 0;
    }
    .no-print,
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
