import { imageBlockSchema } from "@milkdown/kit/component/image-block";

/**
 * Crepe's image-block stores the resize ratio in the markdown alt text and
 * crashes on images without a title (caption: null → schema RangeError, image
 * dropped). Keep alt/title as written; only use the ratio trick when the
 * alt was already numeric (i.e. written by Milkdown itself).
 */
export const imageBlockFix = imageBlockSchema.extendSchema((prev) => (ctx) => {
  const base = prev(ctx);
  return {
    ...base,
    attrs: { ...base.attrs, alt: { default: "", validate: "string" } },
    parseMarkdown: {
      ...base.parseMarkdown,
      runner: (state, node, type) => {
        const alt = typeof node.alt === "string" ? node.alt : "";
        const numeric = alt !== "" && !Number.isNaN(Number(alt)) && Number(alt) !== 0;
        state.addNode(type, {
          src: typeof node.url === "string" ? node.url : "",
          caption: typeof node.title === "string" ? node.title : "",
          ratio: numeric ? Number(alt) : 1,
          alt: numeric ? "" : alt,
        });
      },
    },
    toMarkdown: {
      ...base.toMarkdown,
      runner: (state, node) => {
        const { src, caption, ratio, alt } = node.attrs;
        state.openNode("paragraph");
        state.addNode("image", undefined, undefined, {
          url: src,
          title: caption || null,
          // resized in the editor and no real alt text: keep Milkdown's ratio encoding
          alt: alt || (Number(ratio) !== 1 ? Number(ratio).toFixed(2) : ""),
        });
        state.closeNode();
      },
    },
  };
});
