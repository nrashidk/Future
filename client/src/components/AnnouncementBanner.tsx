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

  const getTypeStyles = (type: string) => {
    switch (type) {
      case "warning":
        return "bg-yellow-50 dark:bg-yellow-900/20 border-yellow-300 dark:border-yellow-700 text-yellow-800 dark:text-yellow-200";
      case "error":
        return "bg-red-50 dark:bg-red-900/20 border-red-300 dark:border-red-700 text-red-800 dark:text-red-200";
      case "success":
        return "bg-green-50 dark:bg-green-900/20 border-green-300 dark:border-green-700 text-green-800 dark:text-green-200";
      default:
        return "bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-700 text-blue-800 dark:text-blue-200";
    }
  };

  const getIcon = (type: string) => {
    switch (type) {
      case "warning":
        return <AlertTriangle className="w-5 h-5 flex-shrink-0" />;
      case "error":
        return <XCircle className="w-5 h-5 flex-shrink-0" />;
      case "success":
        return <CheckCircle className="w-5 h-5 flex-shrink-0" />;
      default:
        return <Info className="w-5 h-5 flex-shrink-0" />;
    }
  };

  return (
    <div className="space-y-2" data-testid="announcement-banner-container">
      {visibleAnnouncements.map((announcement) => (
        <div
          key={announcement.id}
          className={`border rounded-lg p-3 ${getTypeStyles(announcement.type)}`}
          data-testid={`announcement-${announcement.id}`}
        >
          <div className="flex items-start gap-3">
            {getIcon(announcement.type)}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h4 className="font-semibold text-sm" data-testid="announcement-title">
                  <span className="opacity-70">Announcement:</span> {announcement.title}
                </h4>
                {announcement.isPinned && (
                  <Pin className="w-3 h-3 opacity-60" />
                )}
              </div>
              <p className="text-sm mt-1 opacity-90" data-testid="announcement-content">
                {announcement.content}
              </p>
            </div>
            {!announcement.isPinned && (
              <button
                onClick={() => dismissAnnouncement(announcement.id)}
                className="p-1 hover:bg-black/10 dark:hover:bg-white/10 rounded transition-colors"
                aria-label="Dismiss announcement"
                data-testid={`button-dismiss-announcement-${announcement.id}`}
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
