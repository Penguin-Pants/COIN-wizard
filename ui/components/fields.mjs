import { S, esc } from "../state.mjs";

// ---------- field templates
export const fld = (label, html, hint = "") => `<label class="fld"><span>${label}</span>${html}${hint ? `<small>${hint}</small>` : ""}</label>`;
// Binding attributes. data-path is the JSON pointer the validator reports, so an issue can find its field.
export const bound = (path, t = "s", r = false) => `data-b="${esc(path)}" data-path="${esc("/" + path)}" data-t="${t}" ${r ? 'data-r="1"' : ""}`;
export const inp = (path, val, { t = "s", type = "text", cls = "", r = false, attrs = "" } = {}) => `<input class="${cls}" type="${type}" ${bound(path, t, r)} value="${esc(val)}" ${attrs}>`;
export const area = (path, val, { t = "s", rows = 3, r = false } = {}) => `<textarea rows="${rows}" ${bound(path, t, r)}>${esc(t === "l" ? (val ?? []).join("\n") : t === "j" ? JSON.stringify(val, null, 1) : val)}</textarea>`;
export const sel = (path, val, opts, { t = "s", r = false, attrs = "" } = {}) => `<select ${bound(path, t, r)} ${attrs}>${opts.map((o) => { const [v, l, dis] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(v)}" ${String(v) === String(val) ? "selected" : ""} ${dis ? "disabled" : ""}>${esc(l)}</option>`; }).join("")}</select>`;
export const chip = (kind, text) => `<span class="chip ${kind}">${esc(text)}</span>`;
export const btn = (action, label, { cls = "", data = "", dis = false } = {}) => `<button type="button" class="${cls}" data-a="${action}" ${data} ${dis ? "disabled" : ""}>${label}</button>`;
export const issueCount = (editorNames) => S.issues.errors.filter((e) => editorNames.includes(e.editor)).length;
