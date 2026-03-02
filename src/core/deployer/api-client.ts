import {
  PlayboxConfig,
  Project,
  CreateDeploymentRequest,
  CreateDeploymentResponse,
  CompleteDeploymentResponse,
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

  async whoami(): Promise<{ email: string; name: string }> {
    const res = await fetch(`${this.baseUrl}/whoami`, { headers: this.headers });
    if (!res.ok) throw new Error(`Auth failed: ${res.status}`);
    return res.json();
  }

  async listProjects(): Promise<Project[]> {
    const res = await fetch(`${this.baseUrl}/projects`, { headers: this.headers });
    if (!res.ok) throw new Error(`Failed to list projects: ${res.status}`);
    return res.json();
  }

  async createDeployment(request: CreateDeploymentRequest): Promise<CreateDeploymentResponse> {
    const res = await fetch(`${this.baseUrl}/deployments`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify(request),
    });
    if (!res.ok) throw new Error(`Failed to create deployment: ${res.status}`);
    return res.json();
  }

  async completeDeployment(deploymentId: string): Promise<CompleteDeploymentResponse> {
    const res = await fetch(`${this.baseUrl}/deployments/${deploymentId}/complete`, {
      method: 'POST',
      headers: this.headers,
    });
    if (!res.ok) throw new Error(`Failed to complete deployment: ${res.status}`);
    return res.json();
  }
}
