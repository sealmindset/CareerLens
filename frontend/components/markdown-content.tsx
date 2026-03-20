"use client";

import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface MarkdownContentProps {
  content: string;
  className?: string;
}

export function MarkdownContent({ content, className = "" }: MarkdownContentProps) {
  return (
    <Markdown
      remarkPlugins={[remarkGfm]}
      className={`prose prose-sm dark:prose-invert max-w-none ${className}`}
      components={{
        table: ({ children }) => (
          <div className="overflow-x-auto my-2">
            <table
              className="min-w-full text-sm border-collapse border"
              style={{ borderColor: "var(--border)" }}
            >
              {children}
            </table>
          </div>
        ),
        th: ({ children }) => (
          <th
            className="border px-3 py-1.5 text-left font-semibold"
            style={{ borderColor: "var(--border)", backgroundColor: "var(--muted)" }}
          >
            {children}
          </th>
        ),
        td: ({ children }) => (
          <td className="border px-3 py-1.5" style={{ borderColor: "var(--border)" }}>
            {children}
          </td>
        ),
        code: ({ children, className: codeClassName }) => {
          const isInline = !codeClassName;
          if (isInline) {
            return (
              <code
                className="rounded px-1.5 py-0.5 text-xs font-mono"
                style={{ backgroundColor: "var(--muted)" }}
              >
                {children}
              </code>
            );
          }
          return <code className={codeClassName}>{children}</code>;
        },
        pre: ({ children }) => (
          <pre
            className="rounded-lg p-3 text-xs overflow-x-auto my-2"
            style={{ backgroundColor: "var(--muted)" }}
          >
            {children}
          </pre>
        ),
        a: ({ href, children }) => (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
            style={{ color: "var(--primary)" }}
          >
            {children}
          </a>
        ),
        ul: ({ children }) => (
          <ul className="list-disc pl-5 my-1 space-y-0.5">{children}</ul>
        ),
        ol: ({ children }) => (
          <ol className="list-decimal pl-5 my-1 space-y-0.5">{children}</ol>
        ),
        h1: ({ children }) => (
          <h1 className="text-lg font-bold mt-3 mb-1">{children}</h1>
        ),
        h2: ({ children }) => (
          <h2 className="text-base font-bold mt-3 mb-1">{children}</h2>
        ),
        h3: ({ children }) => (
          <h3 className="text-sm font-bold mt-2 mb-1">{children}</h3>
        ),
        blockquote: ({ children }) => (
          <blockquote
            className="border-l-4 pl-3 my-2 italic"
            style={{ borderColor: "var(--muted-foreground)" }}
          >
            {children}
          </blockquote>
        ),
        hr: () => <hr className="my-3" style={{ borderColor: "var(--border)" }} />,
      }}
    >
      {content}
    </Markdown>
  );
}
