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
      json: async () => ({ email: 'test@plbx.ai', name: 'Test User' }),
    });

    const result = await client.whoami();
    expect(result.email).toBe('test@plbx.ai');
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
      json: async () => [{ id: '1', name: 'My Project', slug: 'my-project' }],
    });

    const projects = await client.listProjects();
    expect(projects).toHaveLength(1);
    expect(projects[0].name).toBe('My Project');
  });

  it('should create deployment and get upload URLs', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        deploymentId: 'dep-123',
        uploadUrls: { 'index.html': 'https://s3.amazonaws.com/presigned-url' },
      }),
    });

    const result = await client.createDeployment({
      projectId: '1',
      name: 'test-deploy',
      entryPoint: 'index.html',
      files: [{ path: 'index.html', size: 1000, contentType: 'text/html' }],
    });

    expect(result.deploymentId).toBe('dep-123');
    expect(result.uploadUrls['index.html']).toBeDefined();
  });

  it('should complete deployment and get URL', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        deploymentId: 'dep-123',
        url: 'https://play.plbx.ai/dep-123',
      }),
    });

    const result = await client.completeDeployment('dep-123');
    expect(result.url).toBe('https://play.plbx.ai/dep-123');
  });
});
