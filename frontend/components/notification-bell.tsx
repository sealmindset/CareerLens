"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Bell,
  BellOff,
  CheckCheck,
  ExternalLink,
  GitPullRequest,
  AlertTriangle,
  Info,
  Zap,
  BookOpen,
  Settings,
} from "lucide-react";
import { apiGet, apiPatch } from "@/lib/api";
import { useRouter } from "next/navigation";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

interface NotificationItem {
  id: string;
  recipient_type: string;
  recipient_id: string | null;
  notification_type: string;
  title: string;
  message: string | null;
  related_entity_type: string | null;
  related_entity_id: string | null;
  sent_by: string | null;
  sent_at: string;
  read_at: string | null;
  status: string;
  created_at: string;
}

interface NotificationListResponse {
  notifications: NotificationItem[];
  unread_count: number;
  total: number;
}

interface NotificationCountResponse {
  unread_count: number;
}

/* ------------------------------------------------------------------ */
/* Notification type config (N06)                                      */
/* ------------------------------------------------------------------ */

interface TypeConfig {
  borderColor: string;
  bgColor: string;
  textColor: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}

const typeConfigMap: Record<string, TypeConfig> = {
  PIPELINE_COMPLETE: {
    borderColor: "border-l-emerald-500",
    bgColor: "bg-emerald-50 dark:bg-emerald-950/30",
    textColor: "text-emerald-700 dark:text-emerald-400",
    icon: Zap,
    label: "Pipeline",
  },
  STORY_READY: {
    borderColor: "border-l-purple-500",
    bgColor: "bg-purple-50 dark:bg-purple-950/30",
    textColor: "text-purple-700 dark:text-purple-400",
    icon: BookOpen,
    label: "Story",
  },
  STATUS_CHANGE: {
    borderColor: "border-l-blue-500",
    bgColor: "bg-blue-50 dark:bg-blue-950/30",
    textColor: "text-blue-700 dark:text-blue-400",
    icon: GitPullRequest,
    label: "Status",
  },
  ASSIGNMENT: {
    borderColor: "border-l-orange-500",
    bgColor: "bg-orange-50 dark:bg-orange-950/30",
    textColor: "text-orange-700 dark:text-orange-400",
    icon: AlertTriangle,
    label: "Action",
  },
  SYSTEM: {
    borderColor: "border-l-gray-400",
    bgColor: "bg-gray-50 dark:bg-gray-900/30",
    textColor: "text-gray-600 dark:text-gray-400",
    icon: Settings,
    label: "System",
  },
};

const defaultTypeConfig: TypeConfig = {
  borderColor: "border-l-gray-300",
  bgColor: "bg-gray-50 dark:bg-gray-900/30",
  textColor: "text-gray-500 dark:text-gray-400",
  icon: Info,
  label: "Info",
};

function getTypeConfig(notificationType: string): TypeConfig {
  return typeConfigMap[notificationType] || defaultTypeConfig;
}

/* ------------------------------------------------------------------ */
/* Entity-to-route mapping (N05)                                       */
/* ------------------------------------------------------------------ */

function getEntityRoute(
  entityType: string | null,
  entityId: string | null
): string | null {
  if (!entityType || !entityId) return null;
  const routes: Record<string, string> = {
    application: `/applications/${entityId}`,
    job: `/jobs`,
    story: `/stories`,
    profile: `/profile`,
    variant: `/resumes`,
  };
  return routes[entityType] || null;
}

/* ------------------------------------------------------------------ */
/* Relative time helper                                                */
/* ------------------------------------------------------------------ */

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = Math.max(0, now - then);
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export function NotificationBell() {
  const router = useRouter();
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [open, setOpen] = useState(false);
  const [detailItem, setDetailItem] = useState<NotificationItem | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Poll unread count every 30s (N04)
  const fetchCount = useCallback(async () => {
    try {
      const data = await apiGet<NotificationCountResponse>(
        "/notifications/count"
      );
      setUnreadCount(data.unread_count);
    } catch {
      // Silently ignore — auth might not be ready yet
    }
  }, []);

  useEffect(() => {
    fetchCount();
    const interval = setInterval(fetchCount, 30_000);
    return () => clearInterval(interval);
  }, [fetchCount]);

  // Fetch full list when dropdown opens
  const fetchList = useCallback(async () => {
    try {
      const data = await apiGet<NotificationListResponse>(
        "/notifications?limit=20"
      );
      setNotifications(data.notifications);
      setUnreadCount(data.unread_count);
    } catch {
      // ignore
    }
  }, []);

  const handleToggle = useCallback(() => {
    if (!open) {
      fetchList();
    }
    setOpen((prev) => !prev);
    setDetailItem(null);
  }, [open, fetchList]);

  // Close dropdown on outside click
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
        setDetailItem(null);
      }
    }
    if (open) {
      document.addEventListener("mousedown", onClickOutside);
      return () => document.removeEventListener("mousedown", onClickOutside);
    }
  }, [open]);

  // Mark all read
  const handleMarkAllRead = useCallback(async () => {
    try {
      await apiPatch("/notifications", { mark_all_read: true });
      setUnreadCount(0);
      setNotifications((prev) =>
        prev.map((n) => ({
          ...n,
          read_at: n.read_at || new Date().toISOString(),
          status: "READ",
        }))
      );
    } catch {
      // ignore
    }
  }, []);

  // Click a notification item
  const handleItemClick = useCallback(
    async (item: NotificationItem) => {
      // Mark as read if unread
      if (!item.read_at) {
        try {
          await apiPatch("/notifications", { ids: [item.id] });
          setNotifications((prev) =>
            prev.map((n) =>
              n.id === item.id
                ? { ...n, read_at: new Date().toISOString(), status: "READ" }
                : n
            )
          );
          setUnreadCount((prev) => Math.max(0, prev - 1));
        } catch {
          // ignore
        }
      }
      setDetailItem(item);
    },
    []
  );

  // Navigate to related entity
  const handleGoTo = useCallback(
    (item: NotificationItem) => {
      const route = getEntityRoute(
        item.related_entity_type,
        item.related_entity_id
      );
      if (route) {
        setOpen(false);
        setDetailItem(null);
        router.push(route);
      }
    },
    [router]
  );

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell button */}
      <button
        onClick={handleToggle}
        className="relative rounded-md p-2 transition-colors hover:bg-accent"
        aria-label="Notifications"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div
          className="absolute right-0 z-50 mt-2 w-96 overflow-hidden rounded-lg border shadow-lg"
          style={{
            backgroundColor: "var(--background)",
            borderColor: "var(--border)",
          }}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between border-b px-4 py-3"
            style={{ borderColor: "var(--border)" }}
          >
            <span className="text-sm font-semibold">Notifications</span>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                Mark all read
              </button>
            )}
          </div>

          {/* Detail view */}
          {detailItem ? (
            <div className="p-4">
              <button
                onClick={() => setDetailItem(null)}
                className="mb-3 text-xs text-muted-foreground hover:text-foreground"
              >
                &larr; Back to list
              </button>
              <div className="space-y-3">
                <div className="flex items-start gap-2">
                  {(() => {
                    const cfg = getTypeConfig(detailItem.notification_type);
                    const Icon = cfg.icon;
                    return (
                      <span className={cfg.textColor}>
                        <Icon className="mt-0.5 h-4 w-4" />
                      </span>
                    );
                  })()}
                  <div>
                    <h4 className="text-sm font-medium">{detailItem.title}</h4>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {relativeTime(detailItem.sent_at)}
                      {detailItem.sent_by && (
                        <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px]">
                          {detailItem.sent_by}
                        </span>
                      )}
                    </p>
                  </div>
                </div>
                {detailItem.message && (
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {detailItem.message}
                  </p>
                )}
                {getEntityRoute(
                  detailItem.related_entity_type,
                  detailItem.related_entity_id
                ) && (
                  <button
                    onClick={() => handleGoTo(detailItem)}
                    className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Go to{" "}
                    {detailItem.related_entity_type
                      ? detailItem.related_entity_type.charAt(0).toUpperCase() +
                        detailItem.related_entity_type.slice(1)
                      : "item"}
                  </button>
                )}
              </div>
            </div>
          ) : (
            /* List view */
            <div className="max-h-96 overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <BellOff className="mb-2 h-8 w-8 opacity-40" />
                  <span className="text-sm">No notifications</span>
                </div>
              ) : (
                notifications.map((n) => {
                  const cfg = getTypeConfig(n.notification_type);
                  const Icon = cfg.icon;
                  const isUnread = !n.read_at;
                  return (
                    <button
                      key={n.id}
                      onClick={() => handleItemClick(n)}
                      className={`flex w-full items-start gap-3 border-l-4 px-4 py-3 text-left transition-colors hover:bg-accent/50 ${cfg.borderColor}`}
                    >
                      <span className={`mt-0.5 ${cfg.textColor}`}>
                        <Icon className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <span
                            className={`text-sm leading-tight ${isUnread ? "font-semibold" : "font-normal text-muted-foreground"}`}
                          >
                            {n.title.length > 60
                              ? n.title.slice(0, 60) + "..."
                              : n.title}
                          </span>
                          {isUnread && (
                            <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-blue-500" />
                          )}
                        </div>
                        <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                          <span>{relativeTime(n.sent_at)}</span>
                          {n.sent_by && (
                            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px]">
                              {n.sent_by}
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
