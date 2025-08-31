import { CLOSProject, CLOSMetrics } from '../types';

export function formatProjectStatus(project: CLOSProject): string {
  const stageEmojis = {
    idea: '💡',
    prototype: '🔧',
    mvp: '🚀',
    scale: '📈',
    sunset: '🌅'
  };

  const wipStatus = project.currentWIP >= project.wipLimit ? '🔴' : '🟢';
  const blockerStatus = project.blockers.length > 0 ? '🚫' : '✅';

  return `${stageEmojis[project.stage]} *${project.name}*
*Stage:* ${project.stage.toUpperCase()}
*Owner:* ${project.owner}
*Pod:* ${project.pod}
*WIP:* ${wipStatus} ${project.currentWIP}/${project.wipLimit}
*Blockers:* ${blockerStatus} ${project.blockers.length}
*Last Updated:* ${formatDate(project.lastUpdated)}`;
}

export function formatMetrics(metrics: CLOSMetrics): string {
  return `📊 *Metrics for ${metrics.podName}*

*WIP Utilization:* ${(metrics.wipUtilization * 100).toFixed(1)}%
*Throughput:* ${metrics.throughput} items/week
*Cycle Time:* ${metrics.cycleTime.toFixed(1)} days
*Active Blockers:* ${metrics.blockerCount}
*Ideas Submitted:* ${metrics.ideasSubmitted} this month
*Decisions Approved:* ${metrics.decisionsApproved} this month
*Demo Signups:* ${metrics.demosSigned} this week`;
}

export function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) {
    return `${minutes}m`;
  }
  
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  
  if (hours < 24) {
    return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
  }
  
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  
  return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`;
}

export function parseSlackUserId(text: string): string | null {
  const match = text.match(/<@([A-Z0-9]+)>/);
  return match ? match[1] : null;
}

export function parseSlackChannelId(text: string): string | null {
  const match = text.match(/<#([A-Z0-9]+)\|(.+)>/);
  return match ? match[1] : null;
}

export function sanitizeInput(input: string): string {
  return input
    .replace(/[<>&"']/g, (char) => {
      const entities: { [key: string]: string } = {
        '<': '&lt;',
        '>': '&gt;',
        '&': '&amp;',
        '"': '&quot;',
        "'": '&#x27;'
      };
      return entities[char];
    })
    .trim()
    .substring(0, 1000); // Limit length
}

export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

export function calculatePriority(impact: number, effort: number): 'low' | 'medium' | 'high' | 'critical' {
  const score = impact / effort;
  
  if (score >= 3) return 'critical';
  if (score >= 2) return 'high';
  if (score >= 1) return 'medium';
  return 'low';
}

export function formatSlackLink(url: string, text: string): string {
  return `<${url}|${text}>`;
}

export function createProgressBar(current: number, total: number, width: number = 10): string {
  const percentage = Math.max(0, Math.min(1, current / total));
  const filled = Math.round(width * percentage);
  const empty = width - filled;
  
  return '█'.repeat(filled) + '░'.repeat(empty);
}

export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
}

export function pluralize(count: number, singular: string, plural?: string): string {
  return count === 1 ? singular : (plural || singular + 's');
}