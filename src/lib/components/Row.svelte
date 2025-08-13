<script>
  import { cmToPx } from "$lib/units";

  export let label = "";
  export let path = "";
  export let rowHeightCm = 1;
  export let graphWidthCm = 21;
  export let margin = { left: 0.3, right: 0.3, top: 0.1, bottom: 0.1 };
  export let allYears = [];
  export let xScale;
  export let selected = false;
</script>

<div class="row">
  <div class="label" style="width: {8.5}cm;">
    <span>{label}</span>
  </div>

  <svg class="row-svg" width={graphWidthCm + "cm"} height={rowHeightCm + "cm"}>
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

    <line
      x1={cmToPx(margin.left)}
      x2={cmToPx(graphWidthCm) - cmToPx(margin.right)}
      y1={cmToPx(rowHeightCm) / 2}
      y2={cmToPx(rowHeightCm) / 2}
      class="baseline-line"
    />

    <path d={path} class="path {selected ? 'selected' : ''}" />
  </svg>
</div>

<style>
  .row {
    display: flex;
    align-items: flex-start;
  }
  .label {
    font-size: 14px;
    text-align: right;
    white-space: nowrap;
    display: flex;
    align-items: center;
    justify-content: flex-end;
  }
  .label span {
    border: 1px solid var(--grid, #eee);
    background: var(--chip, #f5f5f5);
    padding: 4px 8px;
    border-radius: 999px;
    font-size: 12px;
  }
  .row-svg {
    display: block;
    overflow: visible;
  }
  .grid-line {
    stroke: var(--grid, #eee);
    stroke-width: 1;
  }
  .baseline-line {
    stroke: #ddd;
    stroke-width: 1;
  }
  .path {
    fill: none;
    stroke: var(--accent, #111);
    stroke-width: 2;
    opacity: 0.95;
  }
  .path.selected {
    stroke-width: 3;
    opacity: 1;
  }
</style>
