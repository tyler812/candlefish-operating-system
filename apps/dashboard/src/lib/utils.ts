import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatNumber(num: number, precision = 0): string {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(precision) + 'M';
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(precision) + 'K';
  }
  return num.toFixed(precision);
}

export function formatCurrency(amount: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(amount);
}

export function formatPercent(value: number, precision = 0): string {
  return `${(value * 100).toFixed(precision)}%`;
}

export function formatDate(date: Date | string, options?: Intl.DateTimeFormatOptions): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-US', options);
}

export function formatDateTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatRelativeTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - d.getTime()) / 1000);

  if (diffInSeconds < 60) {
    return 'just now';
  }

  const diffInMinutes = Math.floor(diffInSeconds / 60);
  if (diffInMinutes < 60) {
    return `${diffInMinutes}m ago`;
  }

  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) {
    return `${diffInHours}h ago`;
  }

  const diffInDays = Math.floor(diffInHours / 24);
  if (diffInDays < 7) {
    return `${diffInDays}d ago`;
  }

  const diffInWeeks = Math.floor(diffInDays / 7);
  if (diffInWeeks < 4) {
    return `${diffInWeeks}w ago`;
  }

  const diffInMonths = Math.floor(diffInDays / 30);
  if (diffInMonths < 12) {
    return `${diffInMonths}mo ago`;
  }

  const diffInYears = Math.floor(diffInDays / 365);
  return `${diffInYears}y ago`;
}

export function getStatusColor(status: string): string {
  const statusColors: Record<string, string> = {
    // Project statuses
    active: 'text-green-600 bg-green-50 border-green-200',
    completed: 'text-blue-600 bg-blue-50 border-blue-200',
    on_hold: 'text-yellow-600 bg-yellow-50 border-yellow-200',
    cancelled: 'text-red-600 bg-red-50 border-red-200',
    blocked: 'text-red-600 bg-red-50 border-red-200',
    
    // Pod health statuses
    healthy: 'text-green-600 bg-green-50',
    warning: 'text-yellow-600 bg-yellow-50',
    critical: 'text-red-600 bg-red-50',
    offline: 'text-gray-600 bg-gray-50',
    
    // Stage gate stages
    ideation: 'text-purple-600 bg-purple-50',
    validation: 'text-cyan-600 bg-cyan-50',
    development: 'text-green-600 bg-green-50',
    testing: 'text-yellow-600 bg-yellow-50',
    deployment: 'text-red-600 bg-red-50',
    
    // Priority levels
    low: 'text-gray-600 bg-gray-50',
    medium: 'text-blue-600 bg-blue-50',
    high: 'text-orange-600 bg-orange-50',
    urgent: 'text-red-600 bg-red-50',
  };

  return statusColors[status.toLowerCase()] || 'text-gray-600 bg-gray-50';
}

export function getPriorityIcon(priority: string): string {
  const icons: Record<string, string> = {
    low: '↓',
    medium: '→',
    high: '↑',
    urgent: '⚡',
  };
  return icons[priority.toLowerCase()] || '→';
}

export function calculateHealthScore(metrics: {
  throughput?: number;
  cycleTime?: number;
  qualityScore?: number;
  satisfactionScore?: number;
}): number {
  const weights = {
    throughput: 0.25,
    cycleTime: 0.25,
    qualityScore: 0.3,
    satisfactionScore: 0.2,
  };

  let score = 0;
  let totalWeight = 0;

  Object.entries(metrics).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      const weight = weights[key as keyof typeof weights];
      if (weight) {
        // Normalize different metrics to 0-100 scale
        let normalizedValue = value;
        if (key === 'cycleTime') {
          // Lower cycle time is better, so invert
          normalizedValue = Math.max(0, 100 - value);
        }
        score += normalizedValue * weight;
        totalWeight += weight;
      }
    }
  });

  return totalWeight > 0 ? score / totalWeight : 0;
}

export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout;
  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle: boolean;
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

export function generateId(): string {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}