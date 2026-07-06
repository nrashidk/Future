import { useEffect, useRef, ReactNode } from "react";

interface MasonryGridProps {
  children: ReactNode;
  className?: string;
}

export function MasonryGrid({ children, className = "" }: MasonryGridProps) {
  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!gridRef.current) return;

    const grid = gridRef.current;

    // Coalesce bursts of observer callbacks (many content nodes resizing in one
    // tick) into a single recompute, and defer the writes out of the observer
    // callback so they don't trigger a synchronous observe→write→observe loop.
    let rafId: number | null = null;
    const scheduleResize = () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        rafId = null;
        resizeGridItems();
      });
    };

    const resizeObserver = new ResizeObserver(() => {
      scheduleResize();
    });

    function resizeGridItems() {
      const items = grid.querySelectorAll<HTMLElement>(".masonry-item");
      const rowHeight = 16; // Base row height in pixels (grid-auto-rows)
      const rowGap = 24; // Gap between rows in pixels

      items.forEach((item) => {
        const content = item.querySelector<HTMLElement>(".masonry-content");
        if (!content) return;

        const contentHeight = content.getBoundingClientRect().height;
        const rowSpan = Math.ceil((contentHeight + rowGap) / (rowHeight + rowGap));
        const nextValue = `span ${rowSpan}`;
        // Diff-guard: only write when the span actually changes. This is what
        // breaks the observe→write→observe feedback once spans stabilize.
        if (item.style.gridRowEnd !== nextValue) {
          item.style.gridRowEnd = nextValue;
        }
      });
    }

    // Observe the CONTENT nodes, not the items: an item's box height is pinned
    // by its inline gridRowEnd span, so it never resizes when the inner content
    // grows (e.g. the async "Why This Career?" narrative). The content node is
    // the element that actually changes height after mount.
    grid
      .querySelectorAll<HTMLElement>(".masonry-content")
      .forEach((node) => resizeObserver.observe(node));

    // Initial resize
    resizeGridItems();

    // Cleanup
    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
    };
  }, [children]);

  return (
    <div
      ref={gridRef}
      className={`grid gap-6 ${className}`}
      style={{
        gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 400px), 1fr))",
        gridAutoRows: "16px",
      }}
    >
      {children}
    </div>
  );
}

interface MasonryItemProps {
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

export function MasonryItem({ children, className = "", style }: MasonryItemProps) {
  return (
    <div className={`masonry-item ${className}`} style={style}>
      <div className="masonry-content">{children}</div>
    </div>
  );
}
