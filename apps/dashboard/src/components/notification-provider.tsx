'use client';

import React, { createContext, useContext, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useWebSocket } from '@/lib/websocket';

interface NotificationContextType {
  // Context methods will be added as needed
}

const NotificationContext = createContext<NotificationContextType>({});

export function useNotifications() {
  return useContext(NotificationContext);
}

interface NotificationProviderProps {
  children: React.ReactNode;
}

export function NotificationProvider({ children }: NotificationProviderProps) {
  const { data: session } = useSession();
  const { connect, disconnect } = useWebSocket();

  useEffect(() => {
    if (session?.user?.id && session?.accessToken) {
      connect(session.user.id, session.accessToken);
    }

    return () => {
      disconnect();
    };
  }, [session, connect, disconnect]);

  return (
    <NotificationContext.Provider value={{}}>
      {children}
    </NotificationContext.Provider>
  );
}