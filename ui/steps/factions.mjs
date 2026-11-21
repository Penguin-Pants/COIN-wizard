import { S, $, esc } from "../state.mjs";
import { fld, inp, area, sel, btn, bound } from "../components/fields.mjs";
import { addButton, removeButton, defineList } from "../components/listEditor.mjs";
import { stepList } from "../components/stepList.mjs";
import { condEditor } from "../components/exprEditor.mjs";
import { draftButton, staleChip } from "../components/plainText.mjs";
import { SHAPES, fvars, colorWarn, fidx, fbadge, factionIssues, isOpen } from "../components/faction.mjs";
import { TEMPLATES, templatesFor, instantiate, defaultTarget, defaultRoles, unmet } from "../../src/templates.mjs";
import { presetPieces } from "../../src/presets.mjs";
import { touch, check, ask, guard } from "../store.mjs";
import { render } from "../shell.mjs";

function actionEditor(a, f) {
  const ai = S.game.actions.findIndex((x) => x.id === a.id), base = `actions/${ai}`, k = `act-${a.id}`, sa = a.kind === "specialActivity";
  const cost = a.cost.amount === 0 ? "free" : `cost ${a.cost.amount} per ${a.cost.per}`;
  return `<details class="act" data-k="${esc(k)}" ${isOpen(k, false) ? "open" : ""}><summary><span class="${sa ? "sam" : `opm s-${SHAPES[fidx(f.id) % 4]}`}" aria-hidden="true"></span><b>${esc(a.name)}</b><span class="grow"></span>${sa ? `<span class="chip tag">${esc(a.timing ?? "after")}</span>` : ""}<span class="chip tag">${esc(cost)}</span></summary>
    <div class="grid2">${fld("Name", inp(`${base}/name`, a.name, { r: true }))}${fld("Cost", `<span class="row">${inp(`${base}/cost/amount`, a.cost.amount, { t: "n", type: "number", attrs: 'min="0"', r: true })}${sel(`${base}/cost/per`, a.cost.per, ["space", "use"], { r: true })}${sel(`${base}/cost/track`, a.cost.track, S.game.tracks.map((t) => t.id))}</span>`)}</div>
    <div class="grid2">${fld("Purpose (one line, printed on the faction sheet)", inp(`${base}/purpose`, a.purpose ?? "", { t: "o" }))}${fld("Rule section", inp(`${base}/ruleRef`, a.ruleRef ?? "", { t: "o", attrs: 'placeholder="3.3.1"' }), "Printed after the name, such as (3.3.1).")}</div>
    ${sa ? accompaniesField(a, f, base) : ""}
    ${fld(`What it does (plain text, printed in the rulebook)${staleChip(a)}`, area(`${base}/plain`, a.plain, { rows: 3 }))}${draftButton(base, "plain")}
    <div class="grid2">${sa ? fld("Timing", sel(`${base}/timing`, a.timing ?? "after", ["before", "during", "after", "any"], { r: true })) : fld("Allowed as Limited Operation", `<input type="checkbox" ${bound(`${base}/limitedAllowed`, "b")} ${a.limitedAllowed ? "checked" : ""}>`)}${fld("Depends on (one per line)", area(`${base}/dependsOn`, a.dependsOn ?? [], { t: "l", rows: 2 }), "Pieces, tracks or board features. Missing ones are flagged.")}</div>
    <h4>Legal spaces</h4><p><small>A space is legal when this holds. It is checked once for each space.</small></p>${condEditor(`${base}/targets`, a.targets, { space: true })}
    <h4>Effects, in order</h4><ol class="steps">${stepList(a.steps, `${base}/steps`, { space: true })}</ol>${addButton("steps", "Add effect", { data: `data-p="${base}/steps"` })}
    ${removeButton("actions", { id: a.id, label: "Delete this action", cls: "danger" })}</details>`;
}
function lane(f, kind) {
  const g = S.game, key = `act-${f.id}-${kind}`, sa = kind === "specialActivity";
  const acts = (sa ? f.specialActivities : f.operations).map((id) => g.actions.find((a) => a.id === id)).filter(Boolean);
  const list = templatesFor(g, f.id).filter((x) => x.tpl.kind === kind);
  const opt = ({ tpl, reason, fit }) => `<option value="${esc(tpl.id)}" ${reason ? "disabled" : ""}>${esc(tpl.name)}${fit ? " (fits " + esc(f.type) + ")" : ""}${reason ? ": " + esc(reason) : ""} - ${esc(tpl.blurb)}</option>`;
  const label = sa ? "Special Activity" : "Operation";
  const pr = S.proposal?.kind === "actions" && S.proposal.faction === f.id && S.proposal.lane === kind ? `<div class="proposal"><h4>Claude's suggestions</h4><ul class="pick">${S.proposal.data.map((x, i) => `<li><b>${esc(x.name)}</b> <small>built from ${esc(TEMPLATES.find((t) => t.id === x.templateId)?.name ?? x.templateId)}. ${esc(x.why ?? "")}</small> ${btn("accept-action", "Add", { cls: "primary", data: `data-i="${i}"` })}</li>`).join("") || "<li>No more suggestions.</li>"}</ul>${btn("dismiss", "Close")}<p><small>Each action starts with the effects of its archetype. Open it and edit the effects to match your rules.</small></p></div>` : "";
  return `<section class="lane ${sa ? "sa" : "op"}" aria-label="${esc(f.name)} ${label}s">
    <div class="lh"><span class="${sa ? "sam" : `opm s-${SHAPES[fidx(f.id) % 4]}`}" aria-hidden="true"></span><h3 class="h4">${sa ? "Special Activities" : "Operations"}</h3><span class="chip cnt">${acts.length}</span></div>
    <p class="cap">${sa ? "Played with an Operation. Timing shows on each card." : "The main action on a faction's turn."}</p>
    <div class="cards">${acts.map((a) => actionEditor(a, f)).join("") || `<p class="empty">None yet. Add one below.</p>`}</div>
    <div class="add"><select id="tpl-${esc(f.id)}-${kind}" aria-label="${label} template for ${esc(f.name)}">${list.map(opt).join("")}</select>${g.factions.length > 2 ? `<label class="mini"><span>Against</span><select id="tgt-${esc(f.id)}-${kind}" aria-label="Enemy faction for the ${label.toLowerCase()} template">${g.factions.filter((x) => x.id !== f.id).map((x) => `<option value="${esc(x.id)}" ${x.id === defaultTarget(g, f.id) ? "selected" : ""}>${esc(x.name)}</option>`).join("")}</select></label>` : ""}${S.msg[`tpl-${f.id}`] ? `<p class="err">${esc(S.msg[`tpl-${f.id}`])}</p>` : ""}
    <div class="row">${btn("addtpl", "Add from template", { cls: "ob", data: `data-f="${esc(f.id)}" data-kind="${kind}"` })}${btn("suggest-actions", S.busy[key] ? "Asking Claude..." : `Suggest ${sa ? "Special Activities" : "Operations"} with Claude`, { cls: "fb", dis: S.busy[key] || !S.sample, data: `data-f="${esc(f.id)}" data-kind="${kind}"` })}${addButton("actions", `Blank ${label}`, { data: `data-f="${esc(f.id)}" data-kind="${kind}"` })}</div>
    ${S.msg[key] ? `<p class="err">${esc(S.msg[key])}</p>` : ""}${pr}</div></section>`;
}
// With 3 or 4 factions, one faction shows at a time behind tabs.
const curTab = () => { const g = S.game; if (!g.factions.some((f) => f.id === S.ftab)) S.ftab = g.factions[0]?.id; return S.ftab; };
function tabs() {
  const g = S.game;
  if (g.factions.length < 3) return "";
  return `<div class="tabs" role="tablist" aria-label="Factions">${g.factions.map((f, i) => `<button type="button" role="tab" aria-selected="${f.id === curTab()}" class="${f.id === curTab() ? "on" : ""}" data-a="fac-tab" data-f="${esc(f.id)}">${fbadge(f, i)} ${esc(f.name)}</button>`).join("")}</div>`;
}
export function renderFactions() {
  const g = S.game;
  const prop = S.proposal?.kind === "factions" ? `<div class="proposal"><h4>Claude's suggestions</h4><ul>${S.proposal.data.map((f) => `<li><b>${esc(f.symbol)}</b> ${esc(f.name)} (${esc(f.type)}, ${esc(f.color)}): ${esc(f.role)}</li>`).join("")}</ul>${btn("accept-factions", "Apply names, colors and roles", { cls: "primary" })} ${btn("dismiss", "Keep mine")}</div>` : "";
  return `<h2 tabindex="-1" id="h">Define factions, pieces and actions</h2><p class="lead">Pick each faction's color. It stays the same in light and dark mode and appears in every step. The shape and symbol print with it, so players never rely on color alone.</p>
  <div class="row">${btn("suggest-factions", S.busy.factions ? "Asking Claude..." : "Suggest names, colors and roles", { dis: S.busy.factions || !S.sample })}</div>${S.msg.factions ? `<p class="err">${esc(S.msg.factions)}</p>` : ""}${prop}
  ${tabs()}${g.factions.map((f, i) => { if (g.factions.length >= 3 && f.id !== curTab()) return ""; const n = factionIssues(f), k = `fp-${f.id}`, warn = colorWarn(f.color); return `<details class="fp" data-k="${esc(k)}" ${isOpen(k, true) ? "open" : ""} style="${fvars(f.color)}">
    <summary class="fph">${fbadge(f, i)}<div class="grow"><div class="tt">${esc(f.name)}</div><div class="sub">${esc(f.role)}</div></div><span class="chip typ">${esc(f.type)}</span>${n ? `<span class="chip bad">${n} to fix</span>` : ""}<span class="cnts">${f.operations.length} Operations, ${f.specialActivities.length} Special Activities</span></summary>
    <div class="fpb"><div class="grid4">${fld("Name", inp(`factions/${i}/name`, f.name, { r: true }))}${fld("Symbol", inp(`factions/${i}/symbol`, f.symbol, { attrs: 'maxlength="3"', r: true }))}${fld("Color", inp(`factions/${i}/color`, f.color, { type: "color", r: true }), warn)}${fld("Type", sel(`factions/${i}/type`, f.type, ["state", "guerrilla", "nonviolent", "custom"], { r: true }))}</div>
    ${fld("Role", area(`factions/${i}/role`, f.role, { rows: 2 }))}${f.pieces.length ? "" : `<p class="note">No pieces yet. ${btn("fac-preset", `Use the ${esc(f.type)} preset pieces`, { cls: "link", data: `data-i="${i}"` })}</p>`}
    <table class="t"><thead><tr><th>Piece</th><th>States</th><th>Total supply</th><th>Base</th></tr></thead><tbody>${f.pieces.map((p, j) => `<tr><td>${inp(`factions/${i}/pieces/${j}/name`, p.name)}</td><td>${esc(p.states.join(", "))}</td><td>${inp(`factions/${i}/pieces/${j}/supply`, p.supply, { t: "n", type: "number", attrs: 'min="1"' })}</td><td>${p.isBase ? "yes" : "no"}</td></tr>`).join("")}</tbody></table>
    <div class="lanes">${lane(f, "operation")}${lane(f, "specialActivity")}</div></div></details>`; }).join("")}`;
}

async function suggestFactions() {
  const g = S.game;
  const r = await ask(`Suggest ${g.factions.length} factions for a COIN-style board game about this conflict. Return only JSON: [{"name":"","symbol":"1 to 3 characters","color":"#rrggbb","type":"state|guerrilla|nonviolent|custom","role":"one sentence"}]. Colors must be distinct and readable in print. Use the overview if it helps.\nConflict: ${g.meta.title}. ${g.brief.conflict}\nActors: ${g.brief.overview.actors.join("; ")}`);
  if (!Array.isArray(r) || r.length < g.factions.length) throw new Error("Claude returned too few factions. Try again.");
  S.proposal = { kind: "factions", data: r.slice(0, g.factions.length) };
}
function pushAction(act, quiet) {
  const f = S.game.factions.find((x) => x.id === act.faction);
  S.game.actions.push(act); (act.kind === "operation" ? f.operations : f.specialActivities).push(act.id); touch(); if (!quiet) render();
}
async function suggestActions(fid, kind) {
  const g = S.game, f = g.factions.find((x) => x.id === fid), have = g.actions.filter((a) => a.faction === fid).map((a) => a.name);
  const opts = templatesFor(g, fid).filter((x) => !x.reason && x.tpl.kind === kind).map((x) => `${x.tpl.id}: ${x.tpl.name}, ${x.tpl.blurb}`).join("\n");
  const word = kind === "specialActivity" ? "4 Special Activities" : "3 Operations";
  const r = await ask(`You help design a COIN-style board game about: ${g.meta.title}. ${g.brief.conflict}\nFaction: ${f.name}, type ${f.type}. Role: ${f.role}\nPieces: ${f.pieces.map((p) => `${p.name} (${p.states.join("/")}${p.isBase ? ", base" : ""})`).join("; ")}\nActions it already has: ${have.join(", ") || "none"}.\nSuggest ${word} that fit this faction and this conflict. Each must be built on one of these archetypes (use its id exactly):\n${opts}\nReturn only JSON: [{"name":"a conflict-specific name, 1 to 3 words","kind":"${kind}","templateId":"","why":"one short sentence tying it to the history"}]. Do not repeat existing names. Do not copy action names from published games.`);
  const ok = (Array.isArray(r) ? r : []).filter((x) => x && x.name && TEMPLATES.some((t) => t.id === x.templateId && t.kind === kind) && !have.includes(x.name));
  if (!ok.length) throw new Error("Claude returned no usable suggestions. Try again, or pick a template.");
  S.proposal = { kind: "actions", faction: fid, lane: kind, data: ok.slice(0, 6) };
}
function addAction(fid, kind) {
  const g = S.game, f = g.factions.find((x) => x.id === fid); const id = `${fid}.new-${g.actions.length + 1}`;
  g.actions.push({ id, faction: fid, kind, name: kind === "operation" ? "New Operation" : "New Special Activity", plain: "Describe what this does.", cost: { track: f.resourceTrack, amount: 1, per: kind === "operation" ? "space" : "use" }, ...(kind === "operation" ? { limitedAllowed: true } : { timing: "after" }), targets: true, steps: [{ op: "track", id: g.tracks[0].id, delta: 0 }] });
  (kind === "operation" ? f.operations : f.specialActivities).push(id); touch(); render();
}
function delAction(id) {
  const g = S.game; g.actions = g.actions.filter((a) => a.id !== id);
  for (const f of g.factions) { f.operations = f.operations.filter((x) => x !== id); f.specialActivities = f.specialActivities.filter((x) => x !== id); }
  touch(); check(); render();
}

// Which Operations a Special Activity may go with, and its space limit. Both print on the faction sheet.
function accompaniesField(a, f, base) {
  const any = a.accompanies === "any", list = Array.isArray(a.accompanies) ? a.accompanies : [];
  const box = (op, label, on) => `<label class="row"><input type="checkbox" data-a="acc-toggle" data-sa="${esc(a.id)}" data-op="${esc(op)}" ${on ? "checked" : ""}> ${esc(label)}</label>`;
  const ops = f.operations.map((id) => S.game.actions.find((x) => x.id === id)).filter(Boolean);
  return `<div class="grid2"><fieldset class="fld"><legend>Accompanies (Operations it may go with)</legend>${box("any", "Any Operation", any)}${ops.map((o) => box(o.id, o.name, !any && list.includes(o.id))).join("")}<small>None checked: not printed.</small></fieldset>${fld("Max spaces", inp(`${base}/maxSpaces`, a.maxSpaces ?? "", { t: "on", type: "number", attrs: 'min="1"' }), "Empty: no limit printed.")}</div>`;
}

export const factionActions = {
  "acc-toggle": (d) => {
    const a = S.game.actions.find((x) => x.id === d.sa); if (!a) return;
    if (d.op === "any") { if (a.accompanies === "any") delete a.accompanies; else a.accompanies = "any"; }
    else {
      const list = new Set(Array.isArray(a.accompanies) ? a.accompanies : []);
      if (list.has(d.op)) list.delete(d.op); else list.add(d.op);
      if (list.size) a.accompanies = [...list]; else delete a.accompanies;
    }
    touch(); render();
  },
  "fac-tab": (d) => { S.ftab = d.f; render(); },
  "fac-preset": (d) => { const f = S.game.factions[Number(d.i)]; f.pieces = presetPieces(f.id, f.type); for (const p of f.pieces) S.game.setup.pools[p.id] = { available: p.supply, outOfPlay: 0 }; touch(); render(); },
  "suggest-factions": () => guard("factions", suggestFactions),
  "accept-factions": () => { const g = S.game; S.proposal.data.forEach((p, i) => { const f = g.factions[i]; if (f) Object.assign(f, { name: p.name, symbol: String(p.symbol).slice(0, 3), color: /^#[0-9a-f]{6}$/i.test(p.color) ? p.color : f.color, type: ["state", "guerrilla", "nonviolent", "custom"].includes(p.type) ? p.type : f.type, role: p.role }); }); S.proposal = null; touch(); render(); },
  addtpl: (d) => {
    const sel = $(`#tpl-${d.f}-${d.kind}`), tgt = $(`#tgt-${d.f}-${d.kind}`)?.value;
    const act = sel && instantiate(S.game, d.f, sel.value, undefined, tgt);
    if (act) { delete S.msg[`tpl-${d.f}`]; pushAction(act); return; }
    const t = TEMPLATES.find((x) => x.id === sel?.value);
    S.msg[`tpl-${d.f}`] = t ? `${t.name} ${unmet(t, defaultRoles(S.game, d.f, tgt))} from that enemy. Choose another enemy or template.` : "Choose a template.";
    render();
  },
  "suggest-actions": (d) => guard(`act-${d.f}-${d.kind}`, () => suggestActions(d.f, d.kind)),
  "accept-action": (d) => { const x = S.proposal.data[d.i]; const act = instantiate(S.game, S.proposal.faction, x.templateId, x.name); if (act) { pushAction(act, true); S.proposal.data.splice(d.i, 1); render(); } },
};

defineList("actions", { add: (d) => addAction(d.f, d.kind), remove: (d) => delAction(d.id) });
