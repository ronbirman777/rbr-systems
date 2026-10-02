import type { ReactElement } from "react";

type AnyElement = { type: unknown; props: Record<string, unknown> };

function isElement(node: unknown): node is AnyElement {
  return typeof node === "object" && node !== null && "props" in node && "type" in node;
}

/** Every element in a (server-component) JSX tree, depth first. */
export function collectElements(node: unknown, out: AnyElement[] = []): AnyElement[] {
  if (Array.isArray(node)) {
    for (const child of node) collectElements(child, out);
  } else if (isElement(node)) {
    out.push(node);
    collectElements(node.props.children, out);
  }
  return out;
}

/** Elements whose type is exactly `type` (a mocked sentinel component or a host tag). */
export function findByType(tree: unknown, type: unknown): AnyElement[] {
  return collectElements(tree).filter((el) => el.type === type);
}

/** All string children in the tree, joined - for "does the page say X" checks. */
export function textOf(node: unknown): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (isElement(node)) return textOf(node.props.children);
  return "";
}

/** Renders one level of a function-component element (the registry's renderer wrapper). */
export function renderOnce(el: ReactElement): ReactElement {
  const fn = el.type as (props: unknown) => ReactElement;
  return fn(el.props);
}
