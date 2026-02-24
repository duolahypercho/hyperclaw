import React, { ReactNode, Ref, PropsWithChildren } from "react";
import ReactDOM from "react-dom";
import { cx, css } from "@emotion/css";
import {
  Bold,
  Italic,
  Underline,
  Code,
  Heading1,
  Heading2,
  Quote,
  List,
  ListOrdered,
  Heading3,
  GitCommitHorizontal,
  Link,
  Image,
  Brackets,
  Strikethrough,
} from "lucide-react";
import { useToolbar } from "./ToolbarProvider";
import { cn } from "../../../../../utils";
interface BaseProps {
  className: string;
  [key: string]: unknown;
}

export const Button = React.forwardRef<
  HTMLButtonElement,
  PropsWithChildren<{
    active: boolean;
    reversed?: boolean;
    className?: string;
    [key: string]: unknown;
  }>
>(({ className, active, reversed, children, ...props }, ref) => (
  <button
    {...props}
    ref={ref}
    type="button"
    className={cn(
      "p-1 rounded-md transition-colors duration-200 hover:bg-accent/70 hover:text-accent-foreground/70 active:bg-accent/50 active:text-accent-foreground/50",
      active && "bg-accent text-accent-foreground",
      reversed && "hover:bg-gray-700",
      className,
      css`
        color: ${reversed
          ? active
            ? "white"
            : "#9ba1ae"
          : active
          ? "#f6f6fa"
          : "#6b7280"};
      `
    )}
  >
    {children}
  </button>
));

export const EditorValue = React.forwardRef<
  HTMLDivElement,
  PropsWithChildren<{
    value: any;
    className: string;
    [key: string]: unknown;
  }>
>(({ className, value, ...props }, ref) => {
  const textLines = value.document.nodes
    .map((node: any) => node.text)
    .toArray()
    .join("\n");
  return (
    <div
      ref={ref}
      {...props}
      className={cx(
        className,
        css`
          margin: 30px -20px 0;
        `
      )}
    >
      <div
        className={css`
          font-size: 14px;
          padding: 5px 20px;
          color: #404040;
          border-top: 2px solid #eeeeee;
          background: #f8f8f8;
        `}
      >
        Slate's value as text
      </div>
      <div
        className={css`
          color: #404040;
          font: 12px monospace;
          white-space: pre-wrap;
          padding: 10px 20px;
          div {
            margin: 0 0 0.5em;
          }
        `}
      >
        {textLines}
      </div>
    </div>
  );
});

export const Icon = React.forwardRef<
  HTMLSpanElement,
  PropsWithChildren<BaseProps>
>(({ className, ...props }, ref) => (
  <span
    {...props}
    ref={ref}
    className={cx(
      "material-icons",
      className,
      css`
        font-size: 18px;
        vertical-align: text-bottom;
      `
    )}
  />
));

export const Instruction = React.forwardRef<
  HTMLDivElement,
  PropsWithChildren<BaseProps>
>(({ className, ...props }, ref) => (
  <div
    {...props}
    ref={ref}
    className={cx(
      className,
      css`
        white-space: pre-wrap;
        margin: 0 -20px 10px;
        padding: 10px 20px;
        font-size: 14px;
        background: #f8f8e8;
      `
    )}
  />
));

export const Menu = React.forwardRef<
  HTMLDivElement,
  PropsWithChildren<BaseProps>
>(({ className, ...props }, ref) => (
  <div
    {...props}
    data-test-id="menu"
    ref={ref}
    className={cx(
      className,
      css`
        & > * {
          display: inline-block;
        }

        & > * + * {
          margin-left: 15px;
        }
      `
    )}
  />
));

export const Portal = ({ children }: { children?: ReactNode }) => {
  return typeof document === "object"
    ? ReactDOM.createPortal(children, document.body)
    : null;
};

const ToolbarMenu = React.forwardRef<
  HTMLDivElement,
  PropsWithChildren<BaseProps>
>(({ className, ...props }, ref) => (
  <Menu
    {...props}
    ref={ref}
    className={cn(
      "px-2 py-2 flex flex-row bg-transparent border-primary/30 border-solid border-[0.5px] border-t-0 border-l-0 border-r-0 shadow-[0_4px_6px_-1px_rgba(0,0,0,0.1)] overflow-x-auto customScrollbar2 h-fit",
      className
    )}
  />
));

export const Toolbar = () => {
  const { MarkButton, BlockButton } = useToolbar();

  return (
    <ToolbarMenu>
      <MarkButton format="bold" icon={<Bold size={18} />} tooltip="Bold" />
      <MarkButton
        format="italic"
        icon={<Italic size={18} />}
        tooltip="Italic"
      />
      <MarkButton
        format="underline"
        icon={<Underline size={18} />}
        tooltip="Underline"
      />
      <MarkButton format="code" icon={<Brackets size={18} />} tooltip="Code" />
      <MarkButton
        format="strikethrough"
        icon={<Strikethrough size={18} />}
        tooltip="Strike through"
      />
      <BlockButton
        format="heading_one"
        icon={<Heading1 size={18} />}
        tooltip="Heading 1"
      />
      <BlockButton
        format="heading_two"
        icon={<Heading2 size={18} />}
        tooltip="Heading 2"
      />
      <BlockButton
        format="heading_three"
        icon={<Heading3 size={18} />}
        tooltip="Heading 3"
      />
      <BlockButton
        format="block_quote"
        icon={<Quote size={18} />}
        tooltip="Block Quote"
      />
      <BlockButton format="ul_list" icon={<List size={18} />} tooltip="List" />
      <BlockButton
        format="horizontal_rule"
        icon={<GitCommitHorizontal size={18} />}
        tooltip="Horizontal Rule"
      />
      <BlockButton format="image" icon={<Image size={18} />} tooltip="Image" />
    </ToolbarMenu>
  );
};
