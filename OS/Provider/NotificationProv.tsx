import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  ReactNode,
  useEffect,
} from "react";
import { toast } from "@/components/ui/use-toast";
import { ToastAction } from "@/components/ui/toast";
import {
  Bell,
  CheckCircle,
  AlertCircle,
  Info,
  XCircle,
  Loader2,
  X,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

// Notification Types
export type NotificationType =
  | "success"
  | "error"
  | "warning"
  | "info"
  | "loading";

// Notification Priority Levels
export type NotificationPriority = "low" | "normal" | "high" | "urgent";

// Notification Categories for OS-specific notifications
export type NotificationCategory =
  | "system"
  | "app"
  | "ai"
  | "security"
  | "update"
  | "reminder"
  | "achievement";

// Notification Interface
export interface Notification {
  id: string;
  title: string;
  message?: string;
  type: NotificationType;
  priority: NotificationPriority;
  category: NotificationCategory;
  timestamp: Date;
  duration?: number; // Auto-dismiss duration in ms
  persistent?: boolean; // Won't auto-dismiss
  action?: {
    label: string;
    onClick: () => void;
  };
  dismissible?: boolean;
  icon?: ReactNode;
  metadata?: Record<string, any>;
}

// Notification Group Interface
export interface NotificationGroup {
  id: string;
  title: string;
  notifications: Notification[];
  unreadCount: number;
  timestamp: Date;
}

// Notification Settings Interface
export interface NotificationSettings {
  enabled: boolean;
  sound: boolean;
  desktop: boolean;
  categories: {
    [key in NotificationCategory]: boolean;
  };
  priority: {
    [key in NotificationPriority]: boolean;
  };
  autoDismiss: boolean;
  autoDismissDelay: number;
  maxNotifications: number;
  position:
    | "top-right"
    | "top-left"
    | "bottom-right"
    | "bottom-left"
    | "top-center"
    | "bottom-center";
}

// Context Interface
interface NotificationContextType {
  // State
  notifications: Notification[];
  notificationGroups: NotificationGroup[];
  settings: NotificationSettings;
  unreadCount: number;
  isOpen: boolean;

  // Actions
  addNotification: (
    notification: Omit<Notification, "id" | "timestamp">
  ) => string;
  removeNotification: (id: string) => void;
  clearNotifications: (category?: NotificationCategory) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;

  // UI Controls
  toggleNotificationPanel: () => void;
  openNotificationPanel: () => void;
  closeNotificationPanel: () => void;

  // Settings
  updateSettings: (settings: Partial<NotificationSettings>) => void;

  // Utility Methods
  getNotificationsByCategory: (
    category: NotificationCategory
  ) => Notification[];
  getNotificationsByPriority: (
    priority: NotificationPriority
  ) => Notification[];
  getUnreadCountByCategory: (category: NotificationCategory) => number;

  // Quick Notification Methods
  success: (
    title: string,
    message?: string,
    options?: Partial<Notification>
  ) => string;
  error: (
    title: string,
    message?: string,
    options?: Partial<Notification>
  ) => string;
  warning: (
    title: string,
    message?: string,
    options?: Partial<Notification>
  ) => string;
  info: (
    title: string,
    message?: string,
    options?: Partial<Notification>
  ) => string;
  loading: (
    title: string,
    message?: string,
    options?: Partial<Notification>
  ) => string;
}

// Default Settings
const defaultSettings: NotificationSettings = {
  enabled: true,
  sound: true,
  desktop: true,
  categories: {
    system: true,
    app: true,
    ai: true,
    security: true,
    update: true,
    reminder: true,
    achievement: true,
  },
  priority: {
    low: true,
    normal: true,
    high: true,
    urgent: true,
  },
  autoDismiss: true,
  autoDismissDelay: 5000,
  maxNotifications: 50,
  position: "top-right",
};

// Create Context
const NotificationContext = createContext<NotificationContextType | undefined>(
  undefined
);

// Hook to use notification context
export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error(
      "useNotifications must be used within a NotificationProvider"
    );
  }
  return context;
};

// Provider Props
interface NotificationProviderProps {
  children: ReactNode;
  initialSettings?: Partial<NotificationSettings>;
}

// Generate unique ID
const generateId = () =>
  `notification_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

// Get notification icon based on type
const getNotificationIcon = (type: NotificationType, className?: string) => {
  const iconClass = className || "w-5 h-5";

  switch (type) {
    case "success":
      return <CheckCircle className={`${iconClass} text-green-500`} />;
    case "error":
      return <XCircle className={`${iconClass} text-red-500`} />;
    case "warning":
      return <AlertCircle className={`${iconClass} text-yellow-500`} />;
    case "info":
      return <Info className={`${iconClass} text-blue-500`} />;
    case "loading":
      return <Loader2 className={`${iconClass} text-blue-500 animate-spin`} />;
    default:
      return <Bell className={`${iconClass} text-gray-500`} />;
  }
};

// Get notification variant for toast
const getToastVariant = (type: NotificationType) => {
  switch (type) {
    case "success":
      return "default";
    case "error":
      return "destructive";
    case "warning":
      return "default";
    case "info":
      return "default";
    case "loading":
      return "loading";
    default:
      return "default";
  }
};

// Main Provider Component
export const NotificationProvider: React.FC<NotificationProviderProps> = ({
  children,
  initialSettings = {},
}) => {
  // State
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [settings, setSettings] = useState<NotificationSettings>({
    ...defaultSettings,
    ...initialSettings,
  });
  const [isOpen, setIsOpen] = useState(false);

  // Memoized values
  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.metadata?.read).length,
    [notifications]
  );

  const notificationGroups = useMemo(() => {
    const groups: Record<string, NotificationGroup> = {};

    notifications.forEach((notification) => {
      const groupId = notification.category;
      if (!groups[groupId]) {
        groups[groupId] = {
          id: groupId,
          title: groupId.charAt(0).toUpperCase() + groupId.slice(1),
          notifications: [],
          unreadCount: 0,
          timestamp: new Date(),
        };
      }

      groups[groupId].notifications.push(notification);
      if (!notification.metadata?.read) {
        groups[groupId].unreadCount++;
      }
    });

    return Object.values(groups).sort(
      (a, b) => b.timestamp.getTime() - a.timestamp.getTime()
    );
  }, [notifications]);

  // Add notification
  const addNotification = useCallback(
    (notification: Omit<Notification, "id" | "timestamp">): string => {
      if (!settings.enabled) return "";

      const id = generateId();
      const newNotification: Notification = {
        ...notification,
        id,
        timestamp: new Date(),
        duration: notification.duration ?? settings.autoDismissDelay,
        dismissible: notification.dismissible ?? true,
        icon: notification.icon ?? getNotificationIcon(notification.type),
        metadata: {
          read: false,
          ...notification.metadata,
        },
      };

      setNotifications((prev) => {
        const updated = [newNotification, ...prev];
        // Limit notifications based on settings
        return updated.slice(0, settings.maxNotifications);
      });

      // Show toast notification if enabled
      if (settings.desktop) {
        toast({
          title: newNotification.title,
          description: newNotification.message,
          variant: getToastVariant(newNotification.type),
          className: "text-xs font-medium",
          duration: newNotification.persistent
            ? undefined
            : newNotification.duration,
          action: newNotification.action ? (
            <ToastAction
              onClick={newNotification.action.onClick}
              altText={newNotification.action.label}
            >
              {newNotification.action.label}
            </ToastAction>
          ) : undefined,
        });
      }

      // Auto-dismiss if not persistent
      if (!newNotification.persistent && newNotification.duration) {
        setTimeout(() => {
          removeNotification(id);
        }, newNotification.duration);
      }

      return id;
    },
    [settings]
  );

  // Remove notification
  const removeNotification = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  // Clear notifications
  const clearNotifications = useCallback((category?: NotificationCategory) => {
    setNotifications((prev) =>
      category ? prev.filter((n) => n.category !== category) : []
    );
  }, []);

  // Mark as read
  const markAsRead = useCallback((id: string) => {
    setNotifications((prev) =>
      prev.map((n) =>
        n.id === id ? { ...n, metadata: { ...n.metadata, read: true } } : n
      )
    );
  }, []);

  // Mark all as read
  const markAllAsRead = useCallback(() => {
    setNotifications((prev) =>
      prev.map((n) => ({
        ...n,
        metadata: { ...n.metadata, read: true },
      }))
    );
  }, []);

  // UI Controls
  const toggleNotificationPanel = useCallback(() => {
    setIsOpen((prev) => !prev);
  }, []);

  const openNotificationPanel = useCallback(() => {
    setIsOpen(true);
  }, []);

  const closeNotificationPanel = useCallback(() => {
    setIsOpen(false);
  }, []);

  // Update settings
  const updateSettings = useCallback(
    (newSettings: Partial<NotificationSettings>) => {
      setSettings((prev) => ({ ...prev, ...newSettings }));
    },
    []
  );

  // Utility methods
  const getNotificationsByCategory = useCallback(
    (category: NotificationCategory) => {
      return notifications.filter((n) => n.category === category);
    },
    [notifications]
  );

  const getNotificationsByPriority = useCallback(
    (priority: NotificationPriority) => {
      return notifications.filter((n) => n.priority === priority);
    },
    [notifications]
  );

  const getUnreadCountByCategory = useCallback(
    (category: NotificationCategory) => {
      return notifications.filter(
        (n) => n.category === category && !n.metadata?.read
      ).length;
    },
    [notifications]
  );

  // Quick notification methods
  const success = useCallback(
    (title: string, message?: string, options?: Partial<Notification>) => {
      return addNotification({
        title,
        message,
        type: "success",
        priority: "normal",
        category: "app",
        ...options,
      });
    },
    [addNotification]
  );

  const error = useCallback(
    (title: string, message?: string, options?: Partial<Notification>) => {
      return addNotification({
        title,
        message,
        type: "error",
        priority: "high",
        category: "system",
        ...options,
      });
    },
    [addNotification]
  );

  const warning = useCallback(
    (title: string, message?: string, options?: Partial<Notification>) => {
      return addNotification({
        title,
        message,
        type: "warning",
        priority: "normal",
        category: "app",
        ...options,
      });
    },
    [addNotification]
  );

  const info = useCallback(
    (title: string, message?: string, options?: Partial<Notification>) => {
      return addNotification({
        title,
        message,
        type: "info",
        priority: "low",
        category: "app",
        ...options,
      });
    },
    [addNotification]
  );

  const loading = useCallback(
    (title: string, message?: string, options?: Partial<Notification>) => {
      return addNotification({
        title,
        message,
        type: "loading",
        priority: "normal",
        category: "app",
        persistent: true,
        ...options,
      });
    },
    [addNotification]
  );

  // Context value
  const contextValue = useMemo(
    () => ({
      notifications,
      notificationGroups,
      settings,
      unreadCount,
      isOpen,
      addNotification,
      removeNotification,
      clearNotifications,
      markAsRead,
      markAllAsRead,
      toggleNotificationPanel,
      openNotificationPanel,
      closeNotificationPanel,
      updateSettings,
      getNotificationsByCategory,
      getNotificationsByPriority,
      getUnreadCountByCategory,
      success,
      error,
      warning,
      info,
      loading,
    }),
    [
      notifications,
      notificationGroups,
      settings,
      unreadCount,
      isOpen,
      addNotification,
      removeNotification,
      clearNotifications,
      markAsRead,
      markAllAsRead,
      toggleNotificationPanel,
      openNotificationPanel,
      closeNotificationPanel,
      updateSettings,
      getNotificationsByCategory,
      getNotificationsByPriority,
      getUnreadCountByCategory,
      success,
      error,
      warning,
      info,
      loading,
    ]
  );

  return (
    <NotificationContext.Provider value={contextValue}>
      {children}
    </NotificationContext.Provider>
  );
};

// Notification Panel Component
export const NotificationPanel: React.FC = () => {
  const {
    notifications,
    notificationGroups,
    unreadCount,
    isOpen,
    closeNotificationPanel,
    markAsRead,
    markAllAsRead,
    removeNotification,
    clearNotifications,
  } = useNotifications();

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        transition={{ duration: 0.2 }}
        className="fixed top-16 right-4 z-50 w-96 max-h-[80vh] bg-card border border-border rounded-lg shadow-lg overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border bg-muted/50">
          <div className="flex items-center gap-2">
            <Bell className="w-5 h-5" />
            <h3 className="font-semibold">Notifications</h3>
            {unreadCount > 0 && (
              <span className="px-2 py-1 text-xs bg-primary text-primary-foreground rounded-full">
                {unreadCount}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={markAllAsRead}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Mark all read
            </button>
            <button
              onClick={closeNotificationPanel}
              className="p-1 hover:bg-muted rounded transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="max-h-[calc(80vh-80px)] overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <Bell className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No notifications</p>
            </div>
          ) : (
            <div className="p-2">
              {notifications.map((notification) => (
                <motion.div
                  key={notification.id}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className={`p-3 rounded-lg mb-2 transition-all cursor-pointer hover:bg-muted/50 ${
                    notification.metadata?.read ? "opacity-60" : "bg-muted/30"
                  }`}
                  onClick={() => markAsRead(notification.id)}
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 mt-0.5">
                      {notification.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between">
                        <h4 className="text-sm font-medium text-foreground">
                          {notification.title}
                        </h4>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            removeNotification(notification.id);
                          }}
                          className="flex-shrink-0 p-1 hover:bg-muted rounded transition-colors"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                      {notification.message && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {notification.message}
                        </p>
                      )}
                      <div className="flex items-center justify-between mt-2">
                        <span className="text-xs text-muted-foreground">
                          {notification.timestamp.toLocaleTimeString()}
                        </span>
                        <div className="flex items-center gap-1">
                          <span
                            className={`px-2 py-1 text-xs rounded-full ${
                              notification.priority === "urgent"
                                ? "bg-red-100 text-red-800"
                                : notification.priority === "high"
                                ? "bg-orange-100 text-orange-800"
                                : notification.priority === "normal"
                                ? "bg-blue-100 text-blue-800"
                                : "bg-gray-100 text-gray-800"
                            }`}
                          >
                            {notification.priority}
                          </span>
                          <span className="px-2 py-1 text-xs bg-muted rounded-full">
                            {notification.category}
                          </span>
                        </div>
                      </div>
                      {notification.action && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            notification.action?.onClick();
                          }}
                          className="mt-2 text-xs text-primary hover:underline"
                        >
                          {notification.action.label}
                        </button>
                      )}
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        {notifications.length > 0 && (
          <div className="p-3 border-t border-border bg-muted/30">
            <button
              onClick={() => clearNotifications()}
              className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Clear all notifications
            </button>
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
};

// Notification Bell Component
export const NotificationBell: React.FC = () => {
  const { unreadCount, toggleNotificationPanel } = useNotifications();

  return (
    <button
      onClick={toggleNotificationPanel}
      className="relative p-2 hover:bg-muted rounded-lg transition-colors"
    >
      <Bell className="w-5 h-5" />
      {unreadCount > 0 && (
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center"
        >
          {unreadCount > 99 ? "99+" : unreadCount}
        </motion.div>
      )}
    </button>
  );
};

export default NotificationProvider;
