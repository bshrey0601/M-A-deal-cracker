import { checkNumber, CheckedNumber, Fact, findNumbers } from "./factCheck";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const fmtFact = (f: Fact) =>
  `${f.label}: ${f.value.toLocaleString("en", { maximumFractionDigits: 2 })}${f.kind === "pct" ? "%" : f.kind === "multiple" ? "x" : f.kind === "money" ? "M" : ""} (${f.source})`;

/**
 * Marks every number in already-sanitized memo HTML: matched numbers get a green underline with the
 * source figure on hover, unmatched ones a red highlight. Browser only (uses DOMParser).
 */
export function annotateMemo(safeHtml: string, facts: Fact[]): { html: string; checked: CheckedNumber[] } {
  const doc = new DOMParser().parseFromString(`<div>${safeHtml}</div>`, "text/html");
  const root = doc.body.firstElementChild!;
  const checked: CheckedNumber[] = [];
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  while (walker.nextNode()) nodes.push(walker.currentNode as Text);

  for (const node of nodes) {
    const text = node.data;
    const tokens = findNumbers(text).map(t => checkNumber(t, facts)).filter(t => t.status !== "ignored");
    if (!tokens.length) continue;
    let html = "";
    let pos = 0;
    for (const t of tokens) {
      checked.push(t);
      const raw = text.slice(t.index, t.index + t.text.length);
      html += esc(text.slice(pos, t.index));
      html +=
        t.status === "verified"
          ? `<span class="fc-ok" title="${esc(`Matches ${fmtFact(t.fact!)}`)}">${esc(raw)}</span>`
          : `<span class="fc-bad" title="Not found in the model's figures. The AI may have invented or miscalculated this number.">${esc(raw)}</span>`;
      pos = t.index + t.text.length;
    }
    html += esc(text.slice(pos));
    const span = doc.createElement("span");
    span.innerHTML = html;
    node.replaceWith(...Array.from(span.childNodes));
  }
  return { html: root.innerHTML, checked };
}
