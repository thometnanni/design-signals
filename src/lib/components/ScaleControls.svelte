<script>
  export let valueFields = [];
  export let selectedField;
  export let setSelectedField;

  export let rowHeightCm;
  export let setRowHeightCm;

  export let graphWidthCm;
  export let setGraphWidthCm;

  export let amplitudeCm;
  export let setAmplitudeCm;

  export let scaleType;
  export let setScaleType;

  export let scaleParam;
  export let setScaleParam;

  export let onDownloadAll;
</script>

<div class="controls">
  <label>
    Parameter:
    <select
      bind:value={selectedField}
      on:change={(e) => setSelectedField(e.target.value)}
    >
      {#each valueFields as f}
        <option value={f.key}>{f.label}</option>
      {/each}
    </select>
  </label>

  <label>
    Amplitude (cm):
    <input
      type="number"
      step="0.1"
      min="0.1"
      max="12"
      bind:value={amplitudeCm}
      on:input={(e) => setAmplitudeCm(+e.target.value)}
    />
  </label>

  <label>
    Row height (cm):
    <input
      type="number"
      step="0.1"
      min="0.2"
      max="6"
      bind:value={rowHeightCm}
      on:input={(e) => setRowHeightCm(+e.target.value)}
    />
  </label>

  <label>
    Graph width (cm):
    <input
      type="number"
      step="0.1"
      min="5"
      max="60"
      bind:value={graphWidthCm}
      on:input={(e) => setGraphWidthCm(+e.target.value)}
    />
  </label>

  <label>
    Scale:
    <select
      bind:value={scaleType}
      on:change={(e) => setScaleType(e.target.value)}
    >
      <option value="linear">linear</option>
      <option value="pow">pow</option>
      <option value="symlog">symlog</option>
    </select>
  </label>

  <label>
    Scale param:
    <input
      type="number"
      bind:value={scaleParam}
      step="1"
      on:input={(e) => setScaleParam(+e.target.value)}
    />
  </label>

  <button on:click={onDownloadAll}>Download all rows as SVG</button>
</div>

<style>
  .controls {
    display: flex;
    gap: 0.75rem;
    align-items: center;
    flex-wrap: wrap;
  }
  input[type="number"] {
    width: 90px;
  }
</style>
