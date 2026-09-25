// Detects GitHub Flavored Markdown extensions (beyond CommonMark) in a document.

interface MdNode {
  type: string;
  checked?: boolean | null;
  children?: MdNode[];
  position?: { start: { offset?: number } };
}

export interface Parser {
  parse(md: string): unknown;
}

const LABELS: Record<string, string> = {
  table: "tables",
  delete: "strikethrough",
  task: "task lists",
  footnote: "footnotes",
  autolink: "autolinks",
};

/** Returns human labels of GFM features used, in a stable order. */
export function detectGfm(parser: Parser, md: string): string[] {
  const found = new Set<string>();
  let tree: MdNode;
  try {
    tree = parser.parse(md) as MdNode;
  } catch {
    return [];
  }
  const walk = (n: MdNode) => {
    if (n.type === "table") found.add("table");
    else if (n.type === "delete") found.add("delete");
    else if (n.type === "footnoteReference" || n.type === "footnoteDefinition") found.add("footnote");
    else if (n.type === "listItem" && typeof n.checked === "boolean") found.add("task");
    else if (n.type === "link") {
      // GFM autolink literal: a bare URL, not [text](url) or <url>
      const at = n.position?.start.offset;
      if (at != null && md[at] !== "[" && md[at] !== "<") found.add("autolink");
    }
    n.children?.forEach(walk);
  };
  walk(tree);
  return Object.keys(LABELS).filter((k) => found.has(k)).map((k) => LABELS[k]);
}
