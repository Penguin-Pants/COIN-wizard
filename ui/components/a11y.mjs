// Fields in table cells take their name from the column header and the row's first cell,
// so a screen reader says "Pop, Dublin" and not "edit text".
export function labelTableFields(root) {
  root.querySelectorAll("td input, td select, td textarea").forEach((el) => {
    if (el.getAttribute("aria-label") || el.closest("label")) return;
    const td = el.closest("td"), tr = td.parentElement, rows = tr.closest("table").tHead?.rows;
    const head = rows ? rows[rows.length - 1].cells[td.cellIndex]?.innerText.trim() ?? "" : "";
    const first = tr.cells[0];
    const row = first === td ? "" : (first.querySelector("input, select")?.value ?? first.innerText).trim();
    el.setAttribute("aria-label", [head, row].filter(Boolean).join(", ") || "Value");
  });
}
