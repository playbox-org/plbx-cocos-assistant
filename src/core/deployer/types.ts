export interface PlayboxConfig {
  apiUrl: string;
  apiKey: string;
  organizationId?: string;
}

export interface Project {
  id: string;
  name: string;
  slug: string;
}

export interface CreateDeploymentRequest {
  projectId?: string;
  projectSlug?: string;
  name: string;
  visibility: 'private' | 'public';
  entryFile?: string;
  orientationLock?: 'portrait' | 'landscape';
  files: DeploymentFile[];
}

export interface DeploymentFile {
  path: string;
  size: number;
  mimeType: string;
}

export interface CreateDeploymentResponse {
  success: boolean;
  data?: {
    deploymentId: string;
    s3Path: string;
    uploadUrls: Array<{
      path: string;
      uploadUrl: string;
    }>;
  };
  error?: string;
}

export interface CompleteDeploymentResponse {
  success: boolean;
  data?: {
    publicUrl: string;
    accessToken?: string;
    shareUrl: string;
    warnings?: string[];
  };
  error?: string;
}

export interface WhoAmIResponse {
  success: boolean;
  data?: {
    userId: string;
    organizationId: string | null;
    scopes: string[] | null;
    organizations: Array<{
      id: string;
      name: string;
      slug: string;
    }>;
  };
  error?: string;
}

export interface ListProjectsResponse {
  success: boolean;
  data?: {
    organization: {
      id: string;
      name: string;
      slug: string;
    };
    projects: Array<{
      id: string;
      name: string;
      slug: string;
      description: string | null;
      type: string;
      status: string;
    }>;
  };
  error?: string;
}

export interface CreateProjectResponse {
  success: boolean;
  data?: {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    type: string;
    status: string;
  };
  error?: string;
}
