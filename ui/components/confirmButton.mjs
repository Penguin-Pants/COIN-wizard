import { S, esc } from "../state.mjs";
import { btn } from "./fields.mjs";
import { render } from "../shell.mjs";

// Two-step confirm. confirm() is blocked in this view, so the button swaps to a Yes and Cancel pair.
// key names the pending question. action is the handler that does the work. data goes on the Yes button.
export function confirmButton(key, label, { action, data = "", confirmLabel = "Yes, delete it", cancelLabel = "Cancel" }) {
  if (S.confirm !== key) return btn("confirm-ask", label, { data: `data-key="${esc(key)}"` });
  return btn(action, confirmLabel, { cls: "danger", data }) + btn("confirm-cancel", cancelLabel);
}

export const confirmActions = {
  "confirm-ask": (d) => { S.confirm = d.key; render(); },
  "confirm-cancel": () => { S.confirm = null; render(); }
};
