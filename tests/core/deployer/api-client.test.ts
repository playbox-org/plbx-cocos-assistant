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

    const { projects } = await client.listProjects();
    expect(projects).toHaveLength(1);
    expect(projects[0].name).toBe('My Project');
  });

  it('should ask for one page by default and report the org total', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        data: {
          organization: { id: 'org-1', name: 'Test Org', slug: 'test-org' },
          projects: [{ id: '1', name: 'My Project', slug: 'my-project', description: null, type: 'playable_ad', status: 'draft' }],
          total: 221,
        },
      }),
    });

    const result = await client.listProjects('org-1');
    expect(result.total).toBe(221);
    expect(mockFetch.mock.calls[0][0]).toContain('limit=50');
  });

  const page = (ids: string[], total?: number) => ({
    ok: true,
    json: async () => ({
      success: true,
      data: {
        organization: { id: 'org-1', name: 'Test Org', slug: 'test-org' },
        projects: ids.map((id) => ({ id, name: `Project ${id}`, slug: `p-${id}`, description: null, type: 'playable_ad', status: 'draft' })),
        ...(total === undefined ? {} : { total }),
      },
    }),
  });

  const idRange = (from: number, count: number) =>
    Array.from({ length: count }, (_, i) => String(from + i));

  it('should walk pages until one comes back short', async () => {
    mockFetch
      .mockResolvedValueOnce(page(idRange(1, 50)))
      .mockResolvedValueOnce(page(idRange(51, 50)))
      .mockResolvedValueOnce(page(idRange(101, 7)));

    const projects = await client.listAllProjects('org-1');
    expect(projects).toHaveLength(107);
    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(mockFetch.mock.calls[1][0]).toContain('offset=50');
    expect(mockFetch.mock.calls[2][0]).toContain('offset=100');
  });

  it('should stop paging when the server ignores offset', async () => {
    // The API build on `dev` drops limit/offset entirely — every page would come
    // back identical, and walking it would never end.
    mockFetch.mockResolvedValue(page(idRange(1, 50)));

    const projects = await client.listAllProjects('org-1');
    expect(projects).toHaveLength(50);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('should leave total absent when the API does not report it', async () => {
    mockFetch.mockResolvedValueOnce(page(['1']));
    const result = await client.listProjects('org-1');
    expect(result.total).toBeUndefined();
  });

  it('should retry a cut response body and surface the undici cause', async () => {
    // Node's fetch rejects with a bare `TypeError: terminated` when the body is
    // truncated; without the cause the panel can only log "terminated".
    const terminated = Object.assign(new TypeError('terminated'), {
      cause: new Error('other side closed'),
    });
    mockFetch.mockRejectedValueOnce(terminated).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        data: { organization: { id: 'org-1', name: 'Test Org', slug: 'test-org' }, projects: [], total: 0 },
      }),
    });

    await expect(client.listProjects()).resolves.toEqual({ projects: [], total: 0 });
    expect(mockFetch).toHaveBeenCalledTimes(2);

    mockFetch.mockRejectedValue(terminated);
    await expect(client.listProjects()).rejects.toThrow('terminated (other side closed)');
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
