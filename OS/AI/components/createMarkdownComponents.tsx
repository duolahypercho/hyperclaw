import React from "react";
import ReactMarkdown, { Options, Components } from "react-markdown";

// Enhanced markdown components with consistent styling - memoized to prevent recreation
const createMarkdownComponents = (isUser?: boolean): Components => {
  // Memoize the components object to prevent recreation on every render
  const components: Components = {
    a({ children, ...props }) {
      return (
        <a
          className={`${isUser
              ? "text-primary-foreground hover:text-primary-foreground/80"
              : "text-primary hover:text-primary/80"
            } underline transition-colors duration-200`}
          {...props}
          target="_blank"
          rel="noopener noreferrer"
        >
          {children}
        </a>
      );
    },
    // @ts-expect-error -- inline
    code({ children, className, inline, ...props }) {
      if (Array.isArray(children) && children.length) {
        if (children[0] == "▍") {
          return (
            <span
              style={{
                animation: "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
                marginTop: "0.25rem",
              }}
            >
              ▍
            </span>
          );
        }

        children[0] = (children?.[0] as string).replace("`▍`", "▍");
      }

      const match = /language-(\w+)/.exec(className || "");
      const content = String(children);
      const hasNewlines = content.includes("\n");
      const isInline = !match && !hasNewlines;

      if (isInline) {
        return (
          <code
            className={`text-sm ${isUser
                ? "bg-primary-foreground/20 text-primary-foreground"
                : "bg-primary/10 text-foreground"
              } px-1.5 py-0.5 rounded-md`}
            {...props}
          >
            {children}
          </code>
        );
      }

      return (
        <div
          className={`overflow-auto w-full my-2 ${isUser ? "bg-primary-foreground/10" : "bg-muted/20"
            } p-3 rounded-lg customScrollbar2 select-text`}
        >
          <pre
            className={`text-sm ${isUser ? "text-primary-foreground" : "text-foreground"
              } whitespace-pre-wrap`}
          >
            <code {...props}>{children}</code>
          </pre>
        </div>
      );
    },
    h1: ({ children, ...props }) => (
      <h1
        className={`text-xl font-medium my-4 select-text ${isUser ? "text-primary-foreground" : "text-foreground"
          }`}
        {...props}
      >
        {children}
      </h1>
    ),
    h2: ({ children, ...props }) => (
      <h2
        className={`text-lg font-medium my-2 select-text ${isUser ? "text-primary-foreground" : "text-foreground"
          }`}
        {...props}
      >
        {children}
      </h2>
    ),
    h3: ({ children, ...props }) => (
      <h3
        className={`text-md font-medium my-2 select-text ${isUser ? "text-primary-foreground" : "text-foreground"
          }`}
        {...props}
      >
        {children}
      </h3>
    ),
    h4: ({ children, ...props }) => (
      <h4
        className={`text-sm font-medium my-2 select-text ${isUser ? "text-primary-foreground" : "text-foreground"
          }`}
        {...props}
      >
        {children}
      </h4>
    ),
    h5: ({ children, ...props }) => (
      <h5
        className={`text-xs font-medium my-2 select-text ${isUser ? "text-primary-foreground" : "text-foreground"
          }`}
        {...props}
      >
        {children}
      </h5>
    ),
    h6: ({ children, ...props }) => (
      <h6
        className={`text-xs font-medium my-2 select-text ${isUser ? "text-primary-foreground" : "text-foreground"
          }`}
        {...props}
      >
        {children}
      </h6>
    ),
    p: ({ children, ...props }) => (
      <p
        className={`my-2 first:mt-0 text-sm last:mb-0 select-text break-words ${isUser ? "text-primary-foreground" : "text-foreground"
          }`}
        {...props}
      >
        {children}
      </p>
    ),
    pre: ({ children, ...props }) => (
      <pre
        className={`overflow-auto w-full my-2 select-txt ${isUser ? "bg-primary-foreground/10" : "bg-muted/20"
          } p-3 rounded-lg customScrollbar2`}
        {...props}
      >
        {children}
      </pre>
    ),
    blockquote: ({ children, ...props }) => (
      <blockquote
        className={`border-l-4 ${isUser ? "border-primary-foreground/30" : "border-primary/30"
          } pl-4 my-2 italic ${isUser ? "text-primary-foreground/80" : "text-muted-foreground"
          }`}
        {...props}
      >
        {children}
      </blockquote>
    ),
    ul: ({ children, ...props }) => (
      <ul
        className={`list-disc list-outside pl-6 my-2 space-y-1 text-sm leading-relaxed break-words [&_ul]:ml-0 [&_ul]:mt-1 [&_ul]:list-[circle] [&_ul]:pl-5 [&_ol]:ml-0 [&_ol]:mt-1 [&_ol]:pl-5 ${isUser ? "text-primary-foreground" : "text-foreground"
          }`}
        {...props}
      >
        {children}
      </ul>
    ),
    ol: ({ children, ...props }) => (
      <ol
        className={`list-decimal list-outside pl-6 my-2 space-y-1 text-sm leading-relaxed break-words [&_ul]:ml-0 [&_ul]:mt-1 [&_ul]:pl-5 [&_ol]:ml-0 [&_ol]:mt-1 [&_ol]:pl-5 ${isUser ? "text-primary-foreground" : "text-foreground"
          }`}
        {...props}
      >
        {children}
      </ol>
    ),
    li: ({ children, ...props }) => (
      <li
        className={`my-1 pl-0.5 break-words [&>p]:inline [&>ul]:mt-1 [&>ol]:mt-1 [&>p:not(:first-child)]:block [&>p:not(:first-child)]:pl-5 [&>p:not(:first-child)]:relative [&>p:not(:first-child)]:before:content-['•'] [&>p:not(:first-child)]:before:absolute [&>p:not(:first-child)]:before:left-0 ${isUser ? "text-primary-foreground" : "text-foreground"
          }`}
        {...props}
      >
        {children}
      </li>
    ),
    strong: ({ children, ...props }) => (
      <strong
        className={`font-semibold text-sm break-words overflow-wrap-anywhere ${isUser ? "text-primary-foreground" : "text-foreground"
          }`}
        {...props}
      >
        {children}
      </strong>
    ),
    hr: ({ ...props }) => (
      <hr
        className={`my-4 h-[1px] ${isUser ? "bg-primary-foreground/30" : "bg-border"
          }`}
        {...props}
      />
    ),
  };

  return components;
};

export default createMarkdownComponents;
