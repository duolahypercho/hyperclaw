import {
  RenderElementProps,
  useSelected,
  useFocused,
  useSlateStatic,
  ReactEditor,
} from "slate-react";
import { ToolBoxImageElement } from "../types";
import { Button } from "@/components/ui/button";
import { Transforms } from "slate";
import { Trash } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { getMediaUrl } from "../../../../utils";
import ClickableImage from "../../../UI/ClickableImage";

export type RenderElementFunction = (props: RenderElementProps) => JSX.Element;

export function makeRenderElementFunction(
  suggestionsStyle: React.CSSProperties
): RenderElementFunction {
  return (props: RenderElementProps) => {
    switch (props.element.type) {
      case "paragraph":
        return <DefaultElement {...props} />;
      case "suggestion":
        return (
          <SuggestionElement {...props} suggestionsStyle={suggestionsStyle} />
        );
      case "block_quote":
        return (
          <blockquote
            className="border-l-4 border-solid border-t-0 border-b-0 border-r-0 border-secondary-default pl-4 my-4 italic text-secondary-foreground"
            {...props.attributes}
          >
            {props.children}
          </blockquote>
        );
      case "ul_list":
        return (
          <ul className="list-disc ml-6" {...props.attributes}>
            {props.children}
          </ul>
        );
      case "heading_one":
        return (
          <h1 className="text-3xl font-semibold my-4" {...props.attributes}>
            {props.children}
          </h1>
        );
      case "heading_two":
        return (
          <h2 className="text-2xl font-semibold my-3" {...props.attributes}>
            {props.children}
          </h2>
        );
      case "heading_three":
        return (
          <h3 className="text-lg font-semibold my-2" {...props.attributes}>
            {props.children}
          </h3>
        );
      case "horizontal_rule":
        return (
          <div {...props.attributes} contentEditable={false}>
            <hr className="my-6 border-t-3 border-b-0 border-r-0 border-l-0 border-solid border-secondary-default" />
            <span style={{ display: "none" }}>{props.children}</span>
          </div>
        );
      case "list_item":
        return <li {...props.attributes}>{props.children}</li>;
      case "image":
        return <ImageElement {...props} element={props.element} />;
    }
  };
}

const DefaultElement = (props: RenderElementProps) => {
  return <div {...props.attributes}>{props.children}</div>;
};

const SuggestionElement = (
  props: RenderElementProps & {
    suggestionsStyle: React.CSSProperties;
  }
) => {
  return (
    <span
      {...props.attributes}
      style={{
        ...props.suggestionsStyle,
      }}
      contentEditable={false}
    >
      {props.children}
      {props.element.type === "suggestion" && props.element.content}
    </span>
  );
};

const ImageElement = (
  props: RenderElementProps & { element: ToolBoxImageElement }
) => {
  const selected = useSelected();
  const focused = useFocused();
  const editor = useSlateStatic();
  const path = ReactEditor.findPath(editor, props.element);

  return (
    <div {...props.attributes} contentEditable={false}>
      <div className="relative w-fit h-fit group/img bg-black/80">
        {props.element.loading ? (
          <Skeleton className="w-[20em] h-[20em]" />
        ) : (
          <>
            <ClickableImage
              src={getMediaUrl(props.element.src)}
              alt={props.element.alt}
              className={`max-w-full max-h-[20em] object-contain hover:cursor-pointer ${
                selected && focused
                  ? "outline outline-2 outline-accent"
                  : "outline-none"
              }`}
            />
            <Button
              onClick={() => Transforms.removeNodes(editor, { at: path })}
              className={`absolute top-2 right-2 p-2 bg-destructive hover:bg-destructive/70 border border-border opacity-0 group-hover/img:opacity-100 transition-opacity duration-150 rounded-lg h-fit active:scale-95 active:bg-destructive/90 ${
                selected && focused && "opacity-100 "
              }`}
            >
              <Trash size={16} className="text-destructive" />
            </Button>
          </>
        )}
      </div>
      {props.children}
    </div>
  );
};
