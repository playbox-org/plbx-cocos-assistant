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

  private authHeaders(): Record<string, string> {
    const h: Record<string, string> = {
      'Authorization': `Bearer ${this.config.apiKey}`,
    };
    if (this.config.organizationId) {
      h['X-Org-Id'] = this.config.organizationId;
    }
    return h;
  }

  private jsonHeaders(): Record<string, string> {
    return {
      ...this.authHeaders(),
      'Content-Type': 'application/json',
    };
  }

  private get baseUrl(): string {
    return this.config.apiUrl;
  }

  async whoami(): Promise<{ userId: string; organizationId?: string | null; organizations: Array<{ id: string; name: string; slug: string }> }> {
    const res = await fetch(`${this.baseUrl}/whoami`, { headers: this.authHeaders() });
    if (!res.ok) throw new Error(`Auth failed: ${res.status}`);
    const body: WhoAmIResponse = await res.json();
    if (!body.success || !body.data) throw new Error(body.error || 'Auth failed');
    return body.data;
  }

  async listProjects(organizationId?: string): Promise<Project[]> {
    const orgId = organizationId || this.config.organizationId;
    const qs = new URLSearchParams();
    if (orgId) qs.set('organizationId', orgId);
    qs.set('limit', '200');
    const res = await fetch(`${this.baseUrl}/projects?${qs}`, { headers: this.authHeaders() });
    if (!res.ok) throw new Error(`Failed to list projects: ${res.status}`);
    const body: ListProjectsResponse = await res.json();
    if (!body.success || !body.data) throw new Error(body.error || 'Failed to list projects');
    return body.data.projects;
  }

  async createProject(name: string): Promise<Project> {
    const res = await fetch(`${this.baseUrl}/projects`, {
      method: 'POST',
      headers: this.jsonHeaders(),
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

  async listDeployments(projectSlug: string): Promise<Array<{ slug: string; status: string; publicUrl: string | null; bundleSizeBytes: number | null; deployedAt: string }>> {
    const qs = new URLSearchParams();
    qs.set('projectSlug', projectSlug);
    if (this.config.organizationId) qs.set('organizationId', this.config.organizationId);
    qs.set('limit', '50');
    const res = await fetch(`${this.baseUrl}/deployments?${qs}`, { headers: this.authHeaders() });
    if (!res.ok) return [];
    const body = await res.json();
    return body?.data ?? [];
  }

  async createDeployment(request: CreateDeploymentRequest): Promise<{ deploymentId: string; uploadUrls: Array<{ path: string; uploadUrl: string }> }> {
    const res = await fetch(`${this.baseUrl}/deployments`, {
      method: 'POST',
      headers: this.jsonHeaders(),
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

  async checkDeploymentExists(projectSlug: string, deploymentSlug: string): Promise<{ exists: boolean; deployment?: { id: string; slug: string; status: string | null; publicUrl: string | null } }> {
    const res = await fetch(
      `${this.baseUrl}/deployments/by-slug?projectSlug=${encodeURIComponent(projectSlug)}&deploymentSlug=${encodeURIComponent(deploymentSlug)}`,
      { headers: this.authHeaders() },
    );
    if (!res.ok) return { exists: false };
    const body = await res.json() as { success?: boolean; data?: { exists: boolean; deployment?: any } };
    return body.data ?? { exists: false };
  }

  async deleteDeploymentBySlug(projectSlug: string, deploymentSlug: string): Promise<void> {
    const res = await fetch(
      `${this.baseUrl}/deployments/by-slug?projectSlug=${encodeURIComponent(projectSlug)}&deploymentSlug=${encodeURIComponent(deploymentSlug)}`,
      { method: 'DELETE', headers: this.authHeaders() },
    );
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      let detail = '';
      try { detail = JSON.parse(text)?.error || text; } catch { detail = text; }
      throw new Error(detail || `Failed to delete deployment: ${res.status}`);
    }
  }

  async completeDeployment(deploymentId: string, bundleSizeBytes?: number): Promise<{ publicUrl: string; shareUrl: string }> {
    const res = await fetch(`${this.baseUrl}/deployments/${deploymentId}/complete`, {
      method: 'POST',
      headers: this.jsonHeaders(),
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
