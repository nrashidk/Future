import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";

/**
 * Renders report narrative markdown (headings, **bold**, - lists, emojis) that
 * the LLM now emits. Used by both the on-screen report (Results.tsx) and the
 * Puppeteer print report (ResultsPrint.tsx).
 *
 * Constraints baked in here so both paths stay consistent:
 * - Headings (#/##/###) are mapped to small emphasized text, NOT browser-default
 *   h1/h2 sizes — the cards are compact and a default h1 would blow the layout.
 * - Thematic breaks (`---`) render to nothing, so the stray fences the
 *   dreamGuidance block can echo do not become <hr> rules.
 * - No raw HTML is rendered (react-markdown default), so this is XSS-safe.
 * - Direction/text-align are left to inherit from the ancestor `<html dir>` so
 *   Arabic still flows RTL (screen + the [dir="rtl"] print CSS in ResultsPrint).
 *   Sized with em units so it tracks the wrapper's font-size (text-sm / text-xs).
 */
const components: Components = {
  // Headings → small styled text, never default heading sizes.
  h1: ({ children }) => <p className="font-bold text-[0.95em] mt-2 mb-1 first:mt-0">{children}</p>,
  h2: ({ children }) => <p className="font-semibold text-[0.9em] mt-2 mb-1 first:mt-0">{children}</p>,
  h3: ({ children }) => <p className="font-semibold text-[0.85em] mt-1.5 mb-0.5 first:mt-0">{children}</p>,
  h4: ({ children }) => <p className="font-semibold text-[0.85em] mt-1.5 mb-0.5 first:mt-0">{children}</p>,
  h5: ({ children }) => <p className="font-semibold text-[0.85em] mt-1.5 mb-0.5 first:mt-0">{children}</p>,
  h6: ({ children }) => <p className="font-semibold text-[0.85em] mt-1.5 mb-0.5 first:mt-0">{children}</p>,
  p: ({ children }) => <p className="mb-1.5 last:mb-0">{children}</p>,
  ul: ({ children }) => <ul className="list-disc ps-4 mb-1.5 last:mb-0 space-y-0.5">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal ps-4 mb-1.5 last:mb-0 space-y-0.5">{children}</ol>,
  li: ({ children }) => <li>{children}</li>,
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  em: ({ children }) => <em>{children}</em>,
  a: ({ children, href }) => <a href={href} className="underline">{children}</a>,
  // Strip thematic breaks (`---`) so echoed fences don't render as rules.
  hr: () => null,
};

interface ReportMarkdownProps {
  children: string | null | undefined;
  /** Optional extra classes on the wrapper (e.g. to preserve a call site's styling). */
  className?: string;
}

export default function ReportMarkdown({ children, className }: ReportMarkdownProps) {
  const text = typeof children === "string" ? children : "";
  return (
    <div className={className}>
      <ReactMarkdown components={components}>{text}</ReactMarkdown>
    </div>
  );
}
