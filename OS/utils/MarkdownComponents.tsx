import { Components } from "react-markdown";

export const markdownComponents: Components = {
  pre: ({ node, ...props }) => (
    <div className="overflow-auto w-full my-2 bg-black/10 p-2 rounded-lg customScrollbar2 transition-opacity duration-1000">
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
};
