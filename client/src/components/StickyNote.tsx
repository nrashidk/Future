import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";

interface StickyNoteProps {
  children: React.ReactNode;
  color?: "yellow" | "pink" | "blue" | "green" | "purple";
  rotation?: "-2" | "-1" | "0" | "1" | "2";
  className?: string;
  icon?: LucideIcon;
  onClick?: () => void;
  selected?: boolean;
}

const colorClasses = {
  yellow: "bg-sticky-yellow",
  pink: "bg-sticky-pink",
  blue: "bg-sticky-blue",
  green: "bg-sticky-green",
  purple: "bg-sticky-purple",
};

const rotationClasses = {
  "-2": "rotate-[-2deg]",
  "-1": "rotate-[-1deg]",
  "0": "",
  "1": "rotate-[1deg]",
  "2": "rotate-[2deg]",
};

export function StickyNote({
  children,
  color = "yellow",
  rotation = "0",
  className,
  icon: Icon,
  onClick,
  selected = false,
}: StickyNoteProps) {
  return (
    <div
      className={cn(
        "relative p-6 rounded-lg shadow-lg transition-all duration-200",
        colorClasses[color],
        rotationClasses[rotation],
        onClick && "cursor-pointer hover-elevate active-elevate-2 hover:-translate-y-1",
        selected && "ring-2 ring-primary ring-offset-2",
        className
      )}
      onClick={onClick}
      data-testid={onClick ? `sticky-note-${color}` : undefined}
    >
      {Icon && (
        <div className="mb-4">
          <Icon className="w-8 h-8 text-foreground/70" />
        </div>
      )}
      
      <div className="relative z-10 text-foreground">
        {children}
      </div>
    </div>
  );
}
