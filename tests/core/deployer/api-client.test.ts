import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PlayboxApiClient } from '../../../src/core/deployer/api-client';

const mockFetch = vi.fn();

beforeEach(() => {
  global.fetch = mockFetch;
});

afterEach(() => {
  vi.restoreAllMocks();
});

const client = new PlayboxApiClient({
  apiUrl: 'https://app.plbx.ai/api/cli',
  apiKey: 'test-api-key',
});

describe('PlayboxApiClient', () => {
  it('should send auth header on whoami', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        data: {
          userId: 'user-123',
          organizationId: null,
          scopes: null,
          organizations: [{ id: 'org-1', name: 'Test Org', slug: 'test-org' }],
        },
      }),
    });

    const result = await client.whoami();
    expect(result.userId).toBe('user-123');
    expect(result.organizations[0].name).toBe('Test Org');
    expect(mockFetch).toHaveBeenCalledWith(
      'https://app.plbx.ai/api/cli/whoami',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer test-api-key',
        }),
      }),
    );
  });

  it('should throw on auth failure', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 401 });
    await expect(client.whoami()).rejects.toThrow('Auth failed: 401');
  });

  it('should list projects', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        data: {
          organization: { id: 'org-1', name: 'Test Org', slug: 'test-org' },
          projects: [{ id: '1', name: 'My Project', slug: 'my-project', description: null, type: 'playable_ad', status: 'draft' }],
        },
      }),
    });

    const projects = await client.listProjects();
    expect(projects).toHaveLength(1);
    expect(projects[0].name).toBe('My Project');
  });

  it('should create deployment and get upload URLs', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        data: {
          deploymentId: 'dep-123',
          s3Path: 'uploads/dep-123',
          uploadUrls: [
            { path: 'index.html', uploadUrl: 'https://s3.amazonaws.com/presigned-url' },
          ],
        },
      }),
    });

    const result = await client.createDeployment({
      projectId: '1',
      name: 'test-deploy',
      visibility: 'public',
      entryFile: 'index.html',
      files: [{ path: 'index.html', size: 1000, mimeType: 'text/html' }],
    });

    expect(result.deploymentId).toBe('dep-123');
    expect(result.uploadUrls[0].uploadUrl).toBe('https://s3.amazonaws.com/presigned-url');
  });

  it('should complete deployment and get URL', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        data: {
          publicUrl: 'https://play.plbx.ai/org/project/dep-123',
          shareUrl: 'https://play.plbx.ai/share/dep-123',
        },
      }),
    });

    const result = await client.completeDeployment('dep-123', 5000);
    expect(result.publicUrl).toBe('https://play.plbx.ai/org/project/dep-123');
    expect(result.shareUrl).toBe('https://play.plbx.ai/share/dep-123');
  });

  it('should create a project', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        data: { id: 'proj-1', name: 'New Project', slug: 'new-project', description: null, type: 'playable_ad', status: 'draft' },
      }),
    });

    const result = await client.createProject('New Project');
    expect(result.id).toBe('proj-1');
    expect(result.name).toBe('New Project');
  });
});
