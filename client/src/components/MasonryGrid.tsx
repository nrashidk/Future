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
    const resizeObserver = new ResizeObserver(() => {
      resizeGridItems();
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
        item.style.gridRowEnd = `span ${rowSpan}`;
      });
    }

    // Observe all items
    const items = grid.querySelectorAll(".masonry-item");
    items.forEach((item) => resizeObserver.observe(item));

    // Initial resize
    resizeGridItems();

    // Cleanup
    return () => {
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
