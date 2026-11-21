import { esc } from "../state.mjs";
import { btn } from "./fields.mjs";

// Lists with add, remove and move buttons. A step module registers each list with defineList.
// Handlers mutate the game and call touch and render themselves. They get the button's dataset.
const lists = {};
export const defineList = (id, handlers) => { lists[id] = handlers; };

export const addButton = (list, label, { cls = "", data = "", dis = false } = {}) => btn("list-add", label, { cls, dis, data: `data-list="${list}" ${data}` });
export const removeButton = (list, { i, id, label = "Delete", cls = "link", data = "" } = {}) =>
  btn("list-del", label, { cls, data: `data-list="${list}"${i != null ? ` data-i="${i}"` : ""}${id != null ? ` data-id="${esc(id)}"` : ""} ${data}` });
export const moveButton = (list, dir, i, { label = dir === "up" ? "Up" : "Down", data = "" } = {}) => btn(`list-${dir}`, label, { cls: "link", data: `data-list="${list}" data-i="${i}" ${data}` });

export const listActions = {
  "list-add": (d) => lists[d.list]?.add?.(d),
  "list-del": (d) => lists[d.list]?.remove?.(d),
  "list-up": (d) => lists[d.list]?.up?.(d),
  "list-down": (d) => lists[d.list]?.down?.(d)
};
