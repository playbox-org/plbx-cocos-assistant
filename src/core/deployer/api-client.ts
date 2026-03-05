import {
  PlayboxConfig,
  Project,
  CreateDeploymentRequest,
  CreateDeploymentResponse,
  CompleteDeploymentResponse,
  WhoAmIResponse,
  ListProjectsResponse,
  CreateProjectResponse,
} from './types';

export class PlayboxApiClient {
  private config: PlayboxConfig;

  constructor(config: PlayboxConfig) {
    this.config = config;
  }

  private get headers(): Record<string, string> {
    return {
      'Authorization': `Bearer ${this.config.apiKey}`,
      'Content-Type': 'application/json',
    };
  }

  private get baseUrl(): string {
    return this.config.apiUrl;
  }

  async whoami(): Promise<{ userId: string; organizations: Array<{ id: string; name: string; slug: string }> }> {
    const res = await fetch(`${this.baseUrl}/whoami`, { headers: this.headers });
    if (!res.ok) throw new Error(`Auth failed: ${res.status}`);
    const body: WhoAmIResponse = await res.json();
    if (!body.success || !body.data) throw new Error(body.error || 'Auth failed');
    return body.data;
  }

  async listProjects(): Promise<Project[]> {
    const res = await fetch(`${this.baseUrl}/projects`, { headers: this.headers });
    if (!res.ok) throw new Error(`Failed to list projects: ${res.status}`);
    const body: ListProjectsResponse = await res.json();
    if (!body.success || !body.data) throw new Error(body.error || 'Failed to list projects');
    return body.data.projects;
  }

  async createProject(name: string): Promise<Project> {
    const res = await fetch(`${this.baseUrl}/projects`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({ name, type: 'playable_ad' }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      let detail = '';
      try { detail = JSON.parse(text)?.error || text; } catch { detail = text; }
      throw new Error(detail || `Failed to create project: ${res.status}`);
    }
    const body: CreateProjectResponse = await res.json();
    if (!body.success || !body.data) throw new Error(body.error || 'Failed to create project');
    return body.data;
  }

  async createDeployment(request: CreateDeploymentRequest): Promise<{ deploymentId: string; uploadUrls: Array<{ path: string; uploadUrl: string }> }> {
    const res = await fetch(`${this.baseUrl}/deployments`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify(request),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      let detail = '';
      try { detail = JSON.parse(text)?.error || text; } catch { detail = text; }
      throw new Error(detail || `Failed to create deployment: ${res.status}`);
    }
    const body: CreateDeploymentResponse = await res.json();
    if (!body.success || !body.data) throw new Error(body.error || 'Failed to create deployment');
    return body.data;
  }

  async completeDeployment(deploymentId: string, bundleSizeBytes?: number): Promise<{ publicUrl: string; shareUrl: string }> {
    const res = await fetch(`${this.baseUrl}/deployments/${deploymentId}/complete`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({ bundleSizeBytes }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      let detail = '';
      try { detail = JSON.parse(text)?.error || text; } catch { detail = text; }
      throw new Error(detail || `Failed to complete deployment: ${res.status}`);
    }
    const body: CompleteDeploymentResponse = await res.json();
    if (!body.success || !body.data) throw new Error(body.error || 'Failed to complete deployment');
    return body.data;
  }
}
