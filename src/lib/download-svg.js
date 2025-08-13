import { pxToCm } from "$lib/units";

export function downloadSVG(svgNode, filename) {
  const bbox = svgNode.getBBox();
  const rect = svgNode.getBoundingClientRect();
  const wPx = rect.width;
  const hPx = rect.height;

  const pad = 2;
  const overflowTopPx = Math.max(0, -bbox.y) + pad;
  const overflowBottomPx = Math.max(0, bbox.y + bbox.height - hPx) + pad;
  const newHeightPx = hPx + overflowTopPx + overflowBottomPx;

  const clone = svgNode.cloneNode(true);

  const style = document.createElement("style");
  style.textContent = `
    .path{fill:none;stroke:#111;stroke-width:2;opacity:.95}
    .grid-line,.tick-line{display:none}
    .baseline-line{stroke:#ddd;stroke-width:1}
  `;
  clone.insertBefore(style, clone.firstChild);

  clone.setAttribute("viewBox", `0 ${-overflowTopPx} ${wPx} ${newHeightPx}`);

  clone.setAttribute("width", `${pxToCm(wPx)}cm`);
  clone.setAttribute("height", `${pxToCm(newHeightPx)}cm`);

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
  }, 150);
}

export async function downloadAllSVGs() {
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

    await new Promise((r) => setTimeout(r, 160));
  }
}
