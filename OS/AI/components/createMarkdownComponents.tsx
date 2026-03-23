import React, { useState, useCallback } from "react";
import ReactMarkdown, { Options, Components } from "react-markdown";

const LANGUAGE_DISPLAY_NAMES: Record<string, string> = {
  js: "JavaScript",
  jsx: "JSX",
  ts: "TypeScript",
  tsx: "TSX",
  py: "Python",
  python: "Python",
  rb: "Ruby",
  ruby: "Ruby",
  go: "Go",
  rust: "Rust",
  rs: "Rust",
  java: "Java",
  kt: "Kotlin",
  kotlin: "Kotlin",
  swift: "Swift",
  cs: "C#",
  csharp: "C#",
  cpp: "C++",
  c: "C",
  html: "HTML",
  css: "CSS",
  scss: "SCSS",
  sass: "Sass",
  less: "Less",
  json: "JSON",
  yaml: "YAML",
  yml: "YAML",
  xml: "XML",
  sql: "SQL",
  sh: "Shell",
  bash: "Bash",
  zsh: "Zsh",
  powershell: "PowerShell",
  ps1: "PowerShell",
  dockerfile: "Dockerfile",
  docker: "Docker",
  graphql: "GraphQL",
  gql: "GraphQL",
  md: "Markdown",
  markdown: "Markdown",
  php: "PHP",
  r: "R",
  scala: "Scala",
  lua: "Lua",
  perl: "Perl",
  dart: "Dart",
  elixir: "Elixir",
  ex: "Elixir",
  erl: "Erlang",
  erlang: "Erlang",
  haskell: "Haskell",
  hs: "Haskell",
  toml: "TOML",
  ini: "INI",
  env: "ENV",
  txt: "Text",
  text: "Text",
  diff: "Diff",
  prisma: "Prisma",
  proto: "Protobuf",
  protobuf: "Protobuf",
  terraform: "Terraform",
  tf: "Terraform",
  vue: "Vue",
  svelte: "Svelte",
};

function copyToClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
  }
  return fallbackCopy(text);
}

function fallbackCopy(text: string): Promise<void> {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  document.body.removeChild(textarea);
  return Promise.resolve();
}

function CopyButton({ content, isUser }: { content: string; isUser?: boolean }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    copyToClipboard(content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [content]);

  return (
    <button
      onClick={(e) => { e.stopPropagation(); handleCopy(); }}
      className={`text-xs px-2 py-1 rounded transition-colors duration-200 ${
        copied
          ? "text-green-400"
          : isUser
            ? "text-primary-foreground/60 hover:text-primary-foreground"
            : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {copied ? "Copied!" : "Copy"}
    </button>
  );
}

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

      const language = match?.[1] || "";
      const displayLang = LANGUAGE_DISPLAY_NAMES[language.toLowerCase()] || language.toUpperCase();

      return (
        <div
          className={`overflow-hidden w-full my-2 ${isUser ? "bg-primary-foreground/10" : "bg-muted/20"
            } rounded-lg select-text`}
        >
          <div
            className={`flex items-center justify-between px-3 py-1.5 border-b ${
              isUser
                ? "border-primary-foreground/10 bg-primary-foreground/5"
                : "border-border/50 bg-muted/30"
            }`}
          >
            <span
              className={`text-xs font-medium ${
                isUser ? "text-primary-foreground/60" : "text-muted-foreground"
              }`}
            >
              {displayLang || "Code"}
            </span>
            <CopyButton content={content} isUser={isUser} />
          </div>
          <div className="overflow-auto p-3 customScrollbar2">
            <pre
              className={`text-sm ${isUser ? "text-primary-foreground" : "text-foreground"
                } whitespace-pre-wrap`}
            >
              <code {...props}>{children}</code>
            </pre>
          </div>
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
    pre: ({ children }) => (
      <>{children}</>
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
    table: ({ children, ...props }) => (
      <div className="overflow-auto my-3 rounded-lg border border-border border-solid customScrollbar2">
        <table
          className={`w-full text-sm ${
            isUser ? "text-primary-foreground" : "text-foreground"
          }`}
          {...props}
        >
          {children}
        </table>
      </div>
    ),
    thead: ({ children, ...props }) => (
      <thead
        className={isUser ? "bg-primary-foreground/10" : "bg-muted/50"}
        {...props}
      >
        {children}
      </thead>
    ),
    tbody: ({ children, ...props }) => (
      <tbody className="divide-y divide-border" {...props}>
        {children}
      </tbody>
    ),
    tr: ({ children, ...props }) => (
      <tr className="border-b border-border border-solid border-l-0 border-r-0 border-t-0 last:border-b-0" {...props}>
        {children}
      </tr>
    ),
    th: ({ children, ...props }) => (
      <th
        className={`px-3 py-2 text-left text-xs font-semibold border border-border first:border-l-0 last:border-r-0 ${
          isUser ? "text-primary-foreground/80" : "text-foreground/80"
        }`}
        {...props}
      >
        {children}
      </th>
    ),
    td: ({ children, ...props }) => (
      <td
        className={`px-3 py-2 text-sm border border-border border-solid first:border-l-0 last:border-r-0 ${
          isUser ? "text-primary-foreground/90" : "text-foreground/90"
        }`}
        {...props}
      >
        {children}
      </td>
    ),
  };

  return components;
};

export default createMarkdownComponents;
