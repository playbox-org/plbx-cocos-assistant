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

/** How many projects the first screen asks for. The org's whole catalogue is
 *  ~75 KB of uncompressed JSON — big enough that a flaky link cuts the body
 *  mid-stream and Node's fetch rejects with a bare `TypeError: terminated`.
 *  50 rows is ~19 KB; the panel pulls the rest only when a search misses. */
export const PROJECTS_PAGE_SIZE = 50;

/** Ceiling on the page walk, so a server that ignores `offset` cannot spin
 *  forever. 20 pages of 50 covers far more than any org holds today. */
export const PROJECTS_MAX_PAGES = 20;

/** GET with one retry, and the undici `cause` folded into the message.
 *  A cut body is usually transient, so a second attempt costs little. The cause
 *  ("other side closed", "incorrect header check") is what tells a broken link
 *  apart from a broken proxy, and it does not survive Cocos IPC serialization —
 *  without this the panel only ever logs "terminated".
 *  ponytail: GET only. Retrying a POST could deploy twice. */
async function getWithRetry(url: string, init: RequestInit): Promise<Response> {
  let lastError: any;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await fetch(url, init);
    } catch (e: any) {
      lastError = e;
    }
  }
  const cause = lastError?.cause?.message || lastError?.cause?.code;
  const message = String(lastError?.message ?? lastError);
  throw new Error(cause ? `${message} (${cause})` : message);
}

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
    const res = await getWithRetry(`${this.baseUrl}/whoami`, { headers: this.authHeaders() });
    if (!res.ok) throw new Error(`Auth failed: ${res.status}`);
    const body: WhoAmIResponse = await res.json();
    if (!body.success || !body.data) throw new Error(body.error || 'Auth failed');
    return body.data;
  }

  /** One page. `total` is what the org holds, and it is optional: the API build
   *  on the `dev` branch drops it (and ignores `limit`/`offset` outright), so
   *  nothing here may depend on it being present. */
  async listProjects(
    organizationId?: string,
    limit = PROJECTS_PAGE_SIZE,
    offset = 0,
  ): Promise<{ projects: Project[]; total?: number }> {
    const orgId = organizationId || this.config.organizationId;
    const qs = new URLSearchParams();
    if (orgId) qs.set('organizationId', orgId);
    qs.set('limit', String(limit));
    if (offset) qs.set('offset', String(offset));
    const res = await getWithRetry(`${this.baseUrl}/projects?${qs}`, { headers: this.authHeaders() });
    if (!res.ok) throw new Error(`Failed to list projects: ${res.status}`);
    const body: ListProjectsResponse = await res.json();
    if (!body.success || !body.data) throw new Error(body.error || 'Failed to list projects');
    return { projects: body.data.projects, total: body.data.total };
  }

  /** Walk pages until one comes back short. Keeps every response body small —
   *  the whole catalogue in one shot is the ~75 KB that gets cut mid-stream on
   *  a bad link, which is the bug this all exists to avoid.
   *  Stops if a page repeats the previous page's first id: that means the server
   *  ignored `offset`, and paging it would never end. */
  async listAllProjects(organizationId?: string): Promise<Project[]> {
    const all: Project[] = [];
    let previousFirstId: string | undefined;
    for (let page = 0; page < PROJECTS_MAX_PAGES; page++) {
      const { projects } = await this.listProjects(
        organizationId,
        PROJECTS_PAGE_SIZE,
        page * PROJECTS_PAGE_SIZE,
      );
      if (!projects.length) break;
      if (projects[0]?.id === previousFirstId) break;
      previousFirstId = projects[0]?.id;
      all.push(...projects);
      if (projects.length < PROJECTS_PAGE_SIZE) break;
    }
    return all;
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
    const res = await getWithRetry(`${this.baseUrl}/deployments?${qs}`, { headers: this.authHeaders() });
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
