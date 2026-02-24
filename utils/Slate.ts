import { Descendant, Node } from "slate";
import {
  CustomText,
  ToolBoxElement,
  ToolBoxImageElement,
  ToolBoxListElement,
  ToolBoxListItemElement,
} from "../components/Tool/AITextArea/types";

export const convertMarkdownToSlate = (markdown: string) => {
  const descendants = markdownToSlateDescendants(markdown);
  return descendants;
};

export const convertSlateToMarkdown = (descendants: Descendant[]): string => {
  const markdown = serializeToMarkdown(descendants);
  return markdown;
};

function markdownToSlateDescendants(markdown: string): Descendant[] {
  const lines = markdown.split("\n"); // Split Markdown into individual lines
  const descendants: Descendant[] = [];
  const parseInlineStyles = (text: string): Descendant[] => {
    const inlineRegex =
      /(\*\*\*|___)([\s\S]*?)\1|(\*\*|__)([\s\S]*?)\3|(\*|_)([\s\S]*?)\5|(`)([\s\S]*?)\7|~~~([\s\S]*?)~~~|~~([\s\S]*?)~~|~([\s\S]*?)~/g;

    const result: Descendant[] = [];
    let lastIndex = 0;

    text.replace(
      inlineRegex,
      (
        match,
        strongEm, // *** or ___
        strongEmText,
        strong, // ** or __
        strongText,
        em, // * or _
        emText,
        code, // `
        codeText,
        underlineStrikethroughText,
        strikethroughText,
        underlineText,
        offset
      ) => {
        // Push preceding plain text
        if (lastIndex < offset) {
          result.push({ text: text.slice(lastIndex, offset) });
        }

        const styleProps: Record<string, boolean> = {};
        let styledText = "";

        if (strongEm) {
          styleProps.bold = true;
          styleProps.italic = true;
          styledText = strongEmText;
        } else if (strong) {
          styleProps.bold = true;
          styledText = strongText;
        } else if (em) {
          styleProps.italic = true;
          styledText = emText;
        } else if (code) {
          styleProps.code = true;
          styledText = codeText;
        } else if (underlineStrikethroughText) {
          styleProps.underline = true;
          styleProps.strikethrough = true;
          styledText = underlineStrikethroughText;
        } else if (underlineText) {
          styleProps.underline = true;
          styledText = underlineText;
        } else if (strikethroughText) {
          styleProps.strikethrough = true;
          styledText = strikethroughText;
        }

        // Recursively parse nested inline styles
        const nestedStyles = parseInlineStyles(styledText);
        nestedStyles.forEach((node) => {
          if ("text" in node) {
            result.push({ ...node, ...styleProps });
          }
        });

        lastIndex = offset + match.length;
        return match;
      }
    );

    // Push remaining plain text
    if (lastIndex < text.length) {
      result.push({ text: text.slice(lastIndex) });
    }

    if (result.length === 0) {
      result.push({ text });
    }

    return result;
  };

  const parseListItems = (
    startIndex: number,
    parentIndent: number = 0
  ): { items: Descendant[]; endIndex: number } => {
    const items: Descendant[] = [];
    let i = startIndex;
    while (i < lines.length) {
      const line = lines[i];
      if (line === "-" || line === "*" || line === "+") {
        items.push({
          type: "list_item",
          children: [{ text: "" }],
        });
        i++;
        continue;
      }

      const match = line.match(/^(\s*)([-*]|[0-9]+\.)\s(.*)$/);

      if (line.length === 0) {
        break;
      }

      if (line.trim() === "") {
        // Regular list item
        items.push({
          type: "paragraph",
          children: [{ text: line }],
        });
        i++;
      }

      if (!match) break;

      const [_, indent, , content] = match;
      const currentIndent = indent.length;
      if (currentIndent > parentIndent) {
        // Start a sublist

        const sublist = parseListItems(i, currentIndent);
        items.push({
          type: "ul_list",
          children: sublist.items,
        });
        i = sublist.endIndex;
      } else if (currentIndent < parentIndent) {
        // End of the current list
        break;
      } else {
        // Regular list item
        items.push({
          type: "list_item",
          children: parseInlineStyles(content) as CustomText[],
        });
        i++;
      }
    }

    return { items, endIndex: i };
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmedLine = line.trim();
    if (trimmedLine === "") {
      // Empty lines become blank paragraphs
      descendants.push({ type: "paragraph", children: [{ text: line }] });
      i++;
    } else if (trimmedLine.startsWith("# ")) {
      // Heading level 1
      descendants.push({
        type: "heading_one",
        children: parseInlineStyles(
          trimmedLine.slice(2).trim()
        ) as CustomText[],
      });
      i++;
    } else if (trimmedLine.startsWith("## ")) {
      // Heading level 2
      descendants.push({
        type: "heading_two",
        children: parseInlineStyles(
          trimmedLine.slice(3).trim()
        ) as CustomText[],
      });
      i++;
    } else if (trimmedLine.startsWith("### ")) {
      // Heading level 3
      descendants.push({
        type: "heading_three",
        children: parseInlineStyles(
          trimmedLine.slice(4).trim()
        ) as CustomText[],
      });
      i++;
    } else if (trimmedLine === "---") {
      // Horizontal rule
      descendants.push({ type: "horizontal_rule", children: [{ text: "" }] });
      i++;
    } else if (trimmedLine.startsWith("> ")) {
      // Block quote
      descendants.push({
        type: "block_quote",
        children: parseInlineStyles(
          trimmedLine.slice(1).trim()
        ) as CustomText[],
      });
      i++;
    } else if (trimmedLine.match(/^(\s*)([-*])\s/)) {
      // Multi-level list
      const { items, endIndex } = parseListItems(i);
      descendants.push({
        type: "ul_list",
        children: items,
      });
      i = endIndex;
    } else if (trimmedLine.match(/^!\[.*\]\((.*)\)$/)) {
      // Image
      descendants.push({
        type: "image",
        src: trimmedLine.match(/^!\[.*\]\((.*)\)$/)?.[1] ?? "",
        alt: trimmedLine.match(/^!\[.*\]\((.*)\)$/)?.[2] ?? "",
        loading: false,
        children: [{ text: "" }],
      });
      i++;
    } else {
      // Default case: Regular paragraph
      descendants.push({
        type: "paragraph",
        children: parseInlineStyles(trimmedLine) as CustomText[],
      });
      i++;
    }
  }

  return descendants;
}

function serializeToMarkdown(nodes: Descendant[]): string {
  return nodes.map((node) => serializeNode(node, 0)).join("\n");
}

function serializeNode(node: Descendant, depth: number): string {
  let result = ``;
  if ("text" in node) {
    return serializeText(node);
  }

  switch (node.type) {
    case "paragraph":
      result += serializeParagraph(node, depth);
      break;
    case "block_quote":
      result += serializeBlockQuote(node, depth);
      break;
    case "heading_one":
      result += serializeHeadingOne(node, depth);
      break;
    case "heading_two":
      result += serializeHeadingTwo(node, depth);
      break;
    case "heading_three":
      result += serializeHeadingThree(node, depth);
      break;
    case "ul_list":
      result += serializeList(node, depth, "ul");
      break;
    case "horizontal_rule":
      result += serializeHorizontalRule(node, depth);
      break;
    case "image":
      result += serializeImage(node, depth);
      break;
    default:
      break;
  }
  return `${result}`;
}

function serializeText(node: CustomText): string {
  let text = node.text;

  // Apply styles in a specific order to handle nesting properly
  if (node.strikethrough) {
    text = `~~${text}~~`;
  }
  if (node.underline) {
    // Note: Underline is not standard Markdown
    // Consider using HTML if underline is required: <u>text</u>
    text = `~${text}~`;
  }
  if (node.italic) {
    text = `*${text}*`;
  }
  if (node.bold) {
    text = `**${text}**`;
  }
  if (node.code) {
    // Code should be applied last as it's typically not combined with other styles
    text = `\`${text}\``;
  }
  return text;
}

function serializeParagraph(node: ToolBoxElement, depth: number): string {
  const children = node.children
    .map((child) => serializeNode(child, depth))
    .join("");
  return children;
}

function serializeBlockQuote(node: ToolBoxElement, depth: number): string {
  const children = node.children
    .map((child) => serializeNode(child, depth))
    .join("\n");
  const lines = children
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");
  return lines;
}

function serializeHeadingOne(node: ToolBoxElement, depth: number): string {
  const children = node.children
    .map((child) => serializeNode(child, depth))
    .join("");
  return `# ${children}`;
}

function serializeHeadingTwo(node: ToolBoxElement, depth: number): string {
  const children = node.children
    .map((child) => serializeNode(child, depth))
    .join("");
  return `## ${children}`;
}

function serializeHeadingThree(node: ToolBoxElement, depth: number): string {
  const children = node.children
    .map((child) => serializeNode(child, depth))
    .join("");
  return `### ${children}`;
}

function serializeHorizontalRule(node: ToolBoxElement, depth: number): string {
  return "---";
}

function serializeList(
  node: ToolBoxListElement,
  depth: number,
  listType: "ul"
): string {
  const indent = "   ".repeat(depth);
  let currentIndex = 1;
  let marker = listType === "ul" ? "-" : `${currentIndex}.`;
  let prefix = `${indent}${marker}`;
  let result = "";

  for (const child of node.children) {
    if ("type" in child && child.type === "list_item") {
      result += `${serializeListItem(child, depth, prefix)}`;
    } else {
      if ("type" in child && child.type === "ul_list") {
        result += serializeNode(child, depth + 1);
      } else {
        const childrenIndent = "   ".repeat(depth + 1);
        result += `${childrenIndent}${serializeNode(child, depth + 1)}\n`;
      }
    }
  }
  //remove the last \n
  result = result.trimEnd();
  return result;
}

function serializeListItem(
  node: ToolBoxListItemElement,
  depth: number,
  prefix: string
): string {
  if (!node.children) return "";

  let result = `${prefix} `;

  for (const child of node.children) {
    result += serializeNode(child, depth + 1);
  }

  return `${result}\n`;
}

function serializeImage(node: ToolBoxImageElement, depth: number): string {
  return `![${node.alt}](${node.src})`;
}

export function slateValueToPlainText(value: Descendant[]): string {
  if (!value || value.length === 0) return "";
  if (value.every((node) => Node.string(node).trim() === "")) return "";
  return value.map((node) => Node.string(node)).join("\n");
}
