'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import {
  LayoutDashboard,
  FolderKanban,
  Users,
  Lightbulb,
  FileText,
  AlertTriangle,
  TrendingUp,
  Settings,
  LogOut,
  Bell,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useWebSocket } from '@/lib/websocket';

const navigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Portfolio', href: '/portfolio', icon: FolderKanban },
  { name: 'Pods', href: '/pods', icon: Users },
  { name: 'Ideas', href: '/ideas', icon: Lightbulb },
  { name: 'Projects', href: '/projects', icon: FileText },
  { name: 'WIP Limits', href: '/wip', icon: AlertTriangle },
  { name: 'Decisions', href: '/decisions', icon: FileText },
  { name: 'Analytics', href: '/analytics', icon: TrendingUp },
  { name: 'Settings', href: '/settings', icon: Settings },
];

interface SidebarProps {
  className?: string;
}

export function Sidebar({ className }: SidebarProps) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const { notifications } = useWebSocket();

  const unreadNotifications = notifications.filter(n => !n.read).length;

  return (
    <div className={cn('flex flex-col h-full bg-white border-r border-gray-200', className)}>
      {/* Logo */}
      <div className="flex items-center px-6 py-4 border-b border-gray-200">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 bg-brand-600 rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-sm">CF</span>
          </div>
          <div>
            <h1 className="text-lg font-semibold text-gray-900">Candlefish OS</h1>
            <p className="text-xs text-gray-500">v2.0 Dashboard</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-4 py-6 space-y-1">
        {navigation.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                'nav-link group flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors',
                isActive
                  ? 'bg-brand-100 text-brand-900'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
              )}
            >
              <item.icon
                className={cn(
                  'mr-3 h-5 w-5',
                  isActive
                    ? 'text-brand-500'
                    : 'text-gray-400 group-hover:text-gray-500'
                )}
              />
              {item.name}
              {item.name === 'Notifications' && unreadNotifications > 0 && (
                <span className="ml-auto bg-red-500 text-white text-xs rounded-full px-2 py-0.5">
                  {unreadNotifications}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Notifications */}
      <div className="px-4 py-2">
        <Link
          href="/notifications"
          className={cn(
            'nav-link group flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors w-full',
            pathname === '/notifications'
              ? 'bg-brand-100 text-brand-900'
              : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
          )}
        >
          <Bell className="mr-3 h-5 w-5" />
          Notifications
          {unreadNotifications > 0 && (
            <span className="ml-auto bg-red-500 text-white text-xs rounded-full px-2 py-0.5 min-w-[20px] text-center">
              {unreadNotifications > 99 ? '99+' : unreadNotifications}
            </span>
          )}
        </Link>
      </div>

      {/* User */}
      <div className="px-4 py-4 border-t border-gray-200">
        <div className="flex items-center space-x-3 mb-3">
          <div className="w-8 h-8 bg-gray-300 rounded-full flex items-center justify-center">
            {session?.user?.avatar ? (
              <img
                src={session.user.avatar}
                alt={session.user.name || 'User'}
                className="w-8 h-8 rounded-full"
              />
            ) : (
              <span className="text-gray-600 font-medium text-sm">
                {session?.user?.name?.charAt(0) || 'U'}
              </span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">
              {session?.user?.name || 'User'}
            </p>
            <p className="text-xs text-gray-500 truncate">
              {session?.user?.role?.replace('_', ' ') || 'member'}
            </p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => signOut()}
          className="w-full justify-start text-gray-600 hover:text-gray-900"
        >
          <LogOut className="mr-2 h-4 w-4" />
          Sign Out
        </Button>
      </div>
    </div>
  );
}