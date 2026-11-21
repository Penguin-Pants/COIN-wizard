import { isStale } from "../../src/plain.mjs";
import { btn, chip } from "./fields.mjs";

// Plain rulebook text next to its effects: a button that drafts it from the steps, and a marker when it is stale.
export const draftButton = (path, field) => `<div class="row">${btn("draft-plain", "Draft text from effects", { cls: "link", data: `data-p="${path}" data-t="${field}"` })}</div>`;
export const staleChip = (holder) => (isStale(holder) ? ` ${chip("wait", "Effects changed after this text")}` : "");
