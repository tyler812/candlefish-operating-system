import axios, { AxiosResponse } from 'axios';
import config from '../utils/config';
import logger from '../utils/logger';
import { CLOSProject, CLOSIdea, CLOSDecision, CLOSMetrics, CLOSUser } from '../types';

class CLOSApiClient {
  private baseURL: string;
  private apiKey: string;

  constructor() {
    this.baseURL = config.CLOS_API_URL;
    this.apiKey = config.CLOS_API_KEY;
  }

  private async makeRequest<T>(endpoint: string, method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET', data?: any): Promise<T> {
    try {
      const response: AxiosResponse<T> = await axios({
        method,
        url: `${this.baseURL}${endpoint}`,
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        data,
        timeout: 10000,
      });

      return response.data;
    } catch (error: any) {
      logger.error(`CLOS API error for ${endpoint}:`, error.response?.data || error.message);
      throw new Error(`CLOS API request failed: ${error.response?.data?.message || error.message}`);
    }
  }

  // User Management
  async getUser(slackUserId: string): Promise<CLOSUser | null> {
    try {
      return await this.makeRequest<CLOSUser>(`/users/slack/${slackUserId}`);
    } catch (error) {
      return null;
    }
  }

  async createUser(userData: Partial<CLOSUser>): Promise<CLOSUser> {
    return await this.makeRequest<CLOSUser>('/users', 'POST', userData);
  }

  async updateUser(userId: string, userData: Partial<CLOSUser>): Promise<CLOSUser> {
    return await this.makeRequest<CLOSUser>(`/users/${userId}`, 'PUT', userData);
  }

  // Project Management
  async getProjects(userId?: string, pod?: string): Promise<CLOSProject[]> {
    const params = new URLSearchParams();
    if (userId) params.append('userId', userId);
    if (pod) params.append('pod', pod);
    
    const query = params.toString() ? `?${params.toString()}` : '';
    return await this.makeRequest<CLOSProject[]>(`/projects${query}`);
  }

  async getProject(projectId: string): Promise<CLOSProject> {
    return await this.makeRequest<CLOSProject>(`/projects/${projectId}`);
  }

  async updateProjectStage(projectId: string, stage: CLOSProject['stage']): Promise<CLOSProject> {
    return await this.makeRequest<CLOSProject>(`/projects/${projectId}/stage`, 'PUT', { stage });
  }

  async addBlocker(projectId: string, blocker: string): Promise<CLOSProject> {
    return await this.makeRequest<CLOSProject>(`/projects/${projectId}/blockers`, 'POST', { blocker });
  }

  async removeBlocker(projectId: string, blockerId: string): Promise<CLOSProject> {
    return await this.makeRequest<CLOSProject>(`/projects/${projectId}/blockers/${blockerId}`, 'DELETE');
  }

  async getWipStatus(pod?: string): Promise<{ projects: CLOSProject[], totalWip: number, wipLimit: number }> {
    const query = pod ? `?pod=${pod}` : '';
    return await this.makeRequest(`/wip/status${query}`);
  }

  // Ideas Management
  async getIdeas(status?: string, userId?: string): Promise<CLOSIdea[]> {
    const params = new URLSearchParams();
    if (status) params.append('status', status);
    if (userId) params.append('userId', userId);
    
    const query = params.toString() ? `?${params.toString()}` : '';
    return await this.makeRequest<CLOSIdea[]>(`/ideas${query}`);
  }

  async submitIdea(ideaData: Omit<CLOSIdea, 'id' | 'createdAt'>): Promise<CLOSIdea> {
    return await this.makeRequest<CLOSIdea>('/ideas', 'POST', ideaData);
  }

  async updateIdeaStatus(ideaId: string, status: CLOSIdea['status']): Promise<CLOSIdea> {
    return await this.makeRequest<CLOSIdea>(`/ideas/${ideaId}/status`, 'PUT', { status });
  }

  // Decision Management
  async getDecisions(status?: string, userId?: string): Promise<CLOSDecision[]> {
    const params = new URLSearchParams();
    if (status) params.append('status', status);
    if (userId) params.append('userId', userId);
    
    const query = params.toString() ? `?${params.toString()}` : '';
    return await this.makeRequest<CLOSDecision[]>(`/decisions${query}`);
  }

  async createDecision(decisionData: Omit<CLOSDecision, 'id' | 'createdAt'>): Promise<CLOSDecision> {
    return await this.makeRequest<CLOSDecision>('/decisions', 'POST', decisionData);
  }

  async updateDecisionStatus(decisionId: string, status: CLOSDecision['status']): Promise<CLOSDecision> {
    return await this.makeRequest<CLOSDecision>(`/decisions/${decisionId}/status`, 'PUT', { status });
  }

  // Demo Management
  async getDemoSlots(): Promise<{ date: string, slots: string[], signups: { [slot: string]: string[] } }[]> {
    return await this.makeRequest('/demos/slots');
  }

  async signUpForDemo(userId: string, date: string, slot: string, projectId: string): Promise<void> {
    await this.makeRequest('/demos/signup', 'POST', { userId, date, slot, projectId });
  }

  async cancelDemoSignup(userId: string, date: string, slot: string): Promise<void> {
    await this.makeRequest('/demos/cancel', 'POST', { userId, date, slot });
  }

  // Metrics
  async getPodMetrics(pod: string): Promise<CLOSMetrics> {
    return await this.makeRequest<CLOSMetrics>(`/metrics/pod/${pod}`);
  }

  async getOverallMetrics(): Promise<CLOSMetrics> {
    return await this.makeRequest<CLOSMetrics>('/metrics/overall');
  }

  // Activities and Notifications
  async logActivity(activity: {
    userId: string;
    action: string;
    target: string;
    metadata?: any;
  }): Promise<void> {
    await this.makeRequest('/activities', 'POST', activity);
  }

  async getRecentActivities(limit: number = 10): Promise<any[]> {
    return await this.makeRequest(`/activities/recent?limit=${limit}`);
  }

  // Stage Gates
  async checkStageGateRequirements(projectId: string, targetStage: CLOSProject['stage']): Promise<{
    canAdvance: boolean;
    requirements: { name: string; met: boolean; description: string }[];
  }> {
    return await this.makeRequest(`/projects/${projectId}/stage-gate/${targetStage}`);
  }

  async requestStageGateAdvancement(projectId: string, targetStage: CLOSProject['stage'], justification: string): Promise<void> {
    await this.makeRequest(`/projects/${projectId}/stage-gate/request`, 'POST', { targetStage, justification });
  }
}

const closApi = new CLOSApiClient();
export default closApi;