import { Components } from "react-markdown";

function isSafeMarkdownHref(href?: string): boolean {
  if (!href) return false;
  const trimmed = href.trim();
  if (trimmed.startsWith("#") || (trimmed.startsWith("/") && !trimmed.startsWith("//")) || trimmed.startsWith("./")) {
    return true;
  }

  try {
    const url = new URL(trimmed);
    return ["http:", "https:", "mailto:", "tel:"].includes(url.protocol);
  } catch {
    return false;
  }
}

export const markdownComponents: Components = {
  a: ({ node, href, children, ...props }) => {
    if (!href || !isSafeMarkdownHref(href)) {
      return <span className="text-muted-foreground line-through">{children}</span>;
    }
    const safeHref: string = href;

    return (
      <a
        {...props}
        href={safeHref}
        target={safeHref.startsWith("#") ? undefined : "_blank"}
        rel={safeHref.startsWith("#") ? undefined : "noopener noreferrer"}
        className="text-primary underline-offset-4 hover:underline"
      >
        {children}
      </a>
    );
  },
  pre: ({ node, ...props }) => (
    <div className="overflow-auto w-full my-2 bg-background p-2 rounded-lg customScrollbar2 transition-opacity duration-1000">
      <pre {...props} />
    </div>
  ),
  code: ({ node, ...props }) => (
    <code
      {...props}
      className="text-sm bg-black/20 p-1 rounded-lg transition-opacity duration-1000"
    />
  ),
  p: ({ node, ...props }) => (
    <p
      {...props}
      className="block whitespace-pre-wrap my-1 first:mt-0 text-sm last:mb-0 transition-opacity duration-1000"
    />
  ),
  br: ({ node, ...props }) => <br {...props} />,
  h3: ({ node, ...props }) => (
    <h3
      {...props}
      className="font-semibold my-6 text-[1em] leading-relaxed transition-opacity duration-1000"
    />
  ),
  strong: ({ node, ...props }) => (
    <strong
      {...props}
      className="font-semibold text-sm transition-opacity duration-1000"
    />
  ),
  ol: ({ node, ...props }) => (
    <ol
      {...props}
      className="list-decimal list-inside pl-5 my-2 space-y-1 text-sm leading-relaxed transition-opacity duration-1000"
    />
  ),
  ul: ({ node, ...props }) => (
    <ul
      {...props}
      className="list-disc list-inside pl-5 my-2 space-y-1 text-sm leading-relaxed transition-opacity duration-1000"
    />
  ),
  li: ({ node, ...props }) => (
    <li {...props} className="mb-1 transition-opacity duration-1000" />
  ),
  hr: ({ node, ...props }) => (
    <hr
      {...props}
      className="my-[0.6em] h-[1px] bg-gray-100 px-3 transition-opacity duration-1000"
    />
  ),
  table: ({ node, ...props }) => (
    <div className="overflow-auto my-3 rounded-lg customScrollbar2">
      <table {...props} className="w-full text-sm" />
    </div>
  ),
  thead: ({ node, ...props }) => (
    <thead {...props} className="bg-muted/50" />
  ),
  tbody: ({ node, ...props }) => (
    <tbody {...props} className="divide-y divide-border" />
  ),
  tr: ({ node, ...props }) => (
    <tr {...props} className="border-b border-border last:border-b-0" />
  ),
  th: ({ node, ...props }) => (
    <th
      {...props}
      className="px-3 py-2 text-left text-xs font-semibold text-foreground/80 border border-border"
    />
  ),
  td: ({ node, ...props }) => (
    <td {...props} className="px-3 py-2 text-sm text-foreground/90 border border-border" />
  ),
};
