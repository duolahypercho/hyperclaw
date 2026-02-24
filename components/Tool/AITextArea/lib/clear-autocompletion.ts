import { Element, Node, Path, Transforms } from "slate";
import { CustomEditor } from "../types";

export function clearAutocompletionsFromEditor(editor: CustomEditor) {
  // clear previous suggestion
  const paths: Path[] = [];
  for (const [node, path] of Node.nodes(editor)) {
    if (Element.isElement(node) && node.type === "suggestion") {
      paths.push(path);
    }
  }
  for (const path of paths) {
    try {
      Transforms.removeNodes(editor, { at: path });
    } catch (e) {
      console.error("CopilotTextarea.clearAutocompletionsFromEditor: error removing node", e);
    }
  }
}
