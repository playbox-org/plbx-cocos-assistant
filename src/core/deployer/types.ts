export interface PlayboxConfig {
  apiUrl: string;      // default: 'https://app.plbx.ai/api/cli'
  apiKey: string;      // Bearer token
}

export interface Project {
  id: string;
  name: string;
  slug: string;
}

export interface CreateDeploymentRequest {
  projectId: string;
  name: string;
  entryPoint: string;  // e.g. 'index.html'
  orientation?: 'portrait' | 'landscape';
  files: DeploymentFile[];
}

export interface DeploymentFile {
  path: string;        // relative path in deployment
  size: number;
  contentType: string;
}

export interface CreateDeploymentResponse {
  deploymentId: string;
  uploadUrls: Record<string, string>; // path -> pre-signed S3 URL
}

export interface CompleteDeploymentResponse {
  deploymentId: string;
  url: string;
  shareUrl?: string;
}

export interface DeployResult {
  deploymentId: string;
  url: string;
  projectName: string;
  timestamp: number;
}

export interface UploadProgress {
  file: string;
  loaded: number;
  total: number;
  percentage: number;
}
