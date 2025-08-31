'use client';

import { io, Socket } from 'socket.io-client';
import { create } from 'zustand';
import { WebSocketEvent, ActivityItem, Notification, SystemStatus } from '@/types';

interface WebSocketState {
  socket: Socket | null;
  connected: boolean;
  activities: ActivityItem[];
  notifications: Notification[];
  systemStatus: SystemStatus | null;
  connect: (userId: string, token: string) => void;
  disconnect: () => void;
  addActivity: (activity: ActivityItem) => void;
  addNotification: (notification: Notification) => void;
  markNotificationRead: (id: string) => void;
  updateSystemStatus: (status: SystemStatus) => void;
}

export const useWebSocket = create<WebSocketState>((set, get) => ({
  socket: null,
  connected: false,
  activities: [],
  notifications: [],
  systemStatus: null,

  connect: (userId: string, token: string) => {
    const socket = io(process.env.NEXT_PUBLIC_WEBSOCKET_URL || 'ws://localhost:4000', {
      auth: {
        token,
        userId,
      },
      transports: ['websocket'],
      upgrade: true,
    });

    socket.on('connect', () => {
      console.log('WebSocket connected');
      set({ connected: true });
    });

    socket.on('disconnect', () => {
      console.log('WebSocket disconnected');
      set({ connected: false });
    });

    socket.on('activity', (activity: ActivityItem) => {
      get().addActivity(activity);
    });

    socket.on('notification', (notification: Notification) => {
      get().addNotification(notification);
    });

    socket.on('system_status', (status: SystemStatus) => {
      get().updateSystemStatus(status);
    });

    socket.on('project_update', (data: any) => {
      // Handle real-time project updates
      const activity: ActivityItem = {
        id: `project_update_${Date.now()}`,
        type: 'project_updated',
        title: `Project ${data.name} updated`,
        description: data.change_description || 'Project status changed',
        user: data.updated_by,
        entityId: data.id,
        entityType: 'project',
        timestamp: new Date(),
        metadata: data,
      };
      get().addActivity(activity);
    });

    socket.on('wip_violation', (data: any) => {
      const notification: Notification = {
        id: `wip_violation_${Date.now()}`,
        type: 'wip_violation',
        title: 'WIP Limit Exceeded',
        message: `Pod ${data.pod_name} has exceeded WIP limit for ${data.stage}`,
        severity: 'warning',
        read: false,
        userId: userId,
        createdAt: new Date(),
      };
      get().addNotification(notification);
    });

    socket.on('pod_health_alert', (data: any) => {
      const notification: Notification = {
        id: `pod_health_${Date.now()}`,
        type: 'pod_health_alert',
        title: 'Pod Health Alert',
        message: `Pod ${data.pod_name} health score is ${data.health_score}`,
        severity: data.health_score < 30 ? 'error' : 'warning',
        read: false,
        userId: userId,
        createdAt: new Date(),
      };
      get().addNotification(notification);
    });

    socket.on('decision_required', (data: any) => {
      const notification: Notification = {
        id: `decision_${Date.now()}`,
        type: 'decision_required',
        title: 'Decision Required',
        message: `Decision memo "${data.title}" requires your approval`,
        severity: 'info',
        read: false,
        actionUrl: `/decisions/${data.id}`,
        actionLabel: 'Review',
        userId: userId,
        createdAt: new Date(),
      };
      get().addNotification(notification);
    });

    set({ socket });
  },

  disconnect: () => {
    const { socket } = get();
    if (socket) {
      socket.disconnect();
    }
    set({ socket: null, connected: false });
  },

  addActivity: (activity: ActivityItem) => {
    set((state) => ({
      activities: [activity, ...state.activities.slice(0, 99)], // Keep last 100 activities
    }));
  },

  addNotification: (notification: Notification) => {
    set((state) => ({
      notifications: [notification, ...state.notifications],
    }));

    // Show browser notification if permission granted
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
      new Notification(notification.title, {
        body: notification.message,
        icon: '/icon-192x192.png',
        badge: '/icon-192x192.png',
      });
    }
  },

  markNotificationRead: (id: string) => {
    set((state) => ({
      notifications: state.notifications.map((notification) =>
        notification.id === id ? { ...notification, read: true } : notification
      ),
    }));
  },

  updateSystemStatus: (status: SystemStatus) => {
    set({ systemStatus: status });
  },
}));

// WebSocket event emitters
export const emitEvent = (eventType: string, payload: any) => {
  const { socket } = useWebSocket.getState();
  if (socket && socket.connected) {
    socket.emit(eventType, payload);
  }
};

export const joinRoom = (roomId: string) => {
  emitEvent('join_room', { roomId });
};

export const leaveRoom = (roomId: string) => {
  emitEvent('leave_room', { roomId });
};

// Request notification permission on first load
if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
  Notification.requestPermission();
}