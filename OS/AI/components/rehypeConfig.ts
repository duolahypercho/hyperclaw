/**
 * Shared rehype plugin configuration for all markdown renderers.
 *
 * Uses rehype-raw to parse inline HTML, then rehype-sanitize to strip
 * dangerous tags/attributes (script, iframe, contenteditable, onerror, etc.)
 * while keeping safe markdown HTML (tables, links, images, code blocks).
 */
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import type { Options as SanitizeOptions } from "rehype-sanitize";

// Extend the default GitHub-based schema to allow className on code/span
// (needed for syntax highlighting) and basic styling classes.
export const sanitizeSchema: SanitizeOptions = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    // Allow className on code (syntax highlighting language tags)
    code: [
      ...(defaultSchema.attributes?.code || []),
      ["className"],
    ],
    // Allow className on span (syntax highlighting tokens)
    span: [
      ...(defaultSchema.attributes?.span || []),
      ["className"],
    ],
    // Allow className on pre (code block wrappers)
    pre: [
      ...(defaultSchema.attributes?.pre || []),
      ["className"],
    ],
  },
};

/**
 * Rehype plugins array: parse raw HTML, then sanitize.
 * Use this as `rehypePlugins={rehypePlugins}` on ReactMarkdown.
 */
export const rehypePlugins = [rehypeRaw, [rehypeSanitize, sanitizeSchema]] as any[];
