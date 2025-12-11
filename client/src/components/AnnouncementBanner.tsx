import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Info, CheckCircle, XCircle, X, Pin } from "lucide-react";
import { useState } from "react";

interface Announcement {
  id: string;
  title: string;
  content: string;
  type: "info" | "warning" | "error" | "success";
  targetAudience: "all" | "students" | "admins" | "schools";
  isPinned: boolean;
  backgroundColor: string | null;
  expiresAt: string | null;
  createdAt: string;
}

export function AnnouncementBanner() {
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(() => {
    const saved = sessionStorage.getItem("dismissed_announcements");
    return saved ? new Set(JSON.parse(saved)) : new Set();
  });

  const { data: announcements = [] } = useQuery<Announcement[]>({
    queryKey: ["/api/announcements"],
    refetchInterval: 5 * 60 * 1000,
  });

  const visibleAnnouncements = announcements.filter(a => !dismissedIds.has(a.id));

  const dismissAnnouncement = (id: string) => {
    const newDismissed = new Set(dismissedIds).add(id);
    setDismissedIds(newDismissed);
    sessionStorage.setItem("dismissed_announcements", JSON.stringify(Array.from(newDismissed)));
  };

  if (visibleAnnouncements.length === 0) return null;

  const getIcon = (type: string) => {
    switch (type) {
      case "warning":
        return <AlertTriangle className="w-5 h-5 flex-shrink-0 text-yellow-600" />;
      case "error":
        return <XCircle className="w-5 h-5 flex-shrink-0 text-red-600" />;
      case "success":
        return <CheckCircle className="w-5 h-5 flex-shrink-0 text-green-600" />;
      default:
        return <Info className="w-5 h-5 flex-shrink-0 text-blue-600" />;
    }
  };

  const getTextColor = (bgColor: string | null) => {
    if (!bgColor) return "text-gray-800";
    const hex = bgColor.replace('#', '');
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16);
    const b = parseInt(hex.substr(4, 2), 16);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.5 ? "text-gray-800" : "text-white";
  };

  return (
    <div className="space-y-2" data-testid="announcement-banner-container">
      {visibleAnnouncements.map((announcement) => {
        const bgColor = announcement.backgroundColor || "#ffffff";
        const textColorClass = getTextColor(bgColor);
        
        return (
          <div
            key={announcement.id}
            className={`relative p-4 shadow-md ${textColorClass}`}
            style={{
              backgroundColor: bgColor,
              borderRadius: "2px 2px 12px 2px",
              boxShadow: "2px 3px 8px rgba(0,0,0,0.15), inset 0 -2px 4px rgba(0,0,0,0.05)",
              transform: "rotate(-0.3deg)",
            }}
            data-testid={`announcement-${announcement.id}`}
          >
            {/* Tape effect at top */}
            <div 
              className="absolute -top-2 left-1/2 -translate-x-1/2 w-16 h-4 bg-amber-100/80 dark:bg-amber-200/60" 
              style={{
                transform: "translateX(-50%) rotate(1deg)",
                boxShadow: "0 1px 2px rgba(0,0,0,0.1)",
              }}
            />
            
            <div className="flex items-start gap-3 pt-1">
              {getIcon(announcement.type)}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h4 className="font-semibold text-sm" data-testid="announcement-title">
                    <span className="opacity-60">Announcement:</span> {announcement.title}
                  </h4>
                  {announcement.isPinned && (
                    <Pin className="w-3 h-3 opacity-60" />
                  )}
                </div>
                <p className="text-sm mt-1 opacity-80" data-testid="announcement-content">
                  {announcement.content}
                </p>
                <p className="text-xs mt-2 opacity-50" data-testid="announcement-date">
                  {new Date(announcement.createdAt).toLocaleDateString('en-US', { 
                    year: 'numeric', 
                    month: 'short', 
                    day: 'numeric' 
                  })}
                </p>
              </div>
              {!announcement.isPinned && (
                <button
                  onClick={() => dismissAnnouncement(announcement.id)}
                  className="p-1 hover:bg-black/10 rounded transition-colors"
                  aria-label="Dismiss announcement"
                  data-testid={`button-dismiss-announcement-${announcement.id}`}
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
