import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';
import { uploadFile, uploadFiles } from '../../../src/core/deployer/uploader';
import { join } from 'path';
import { writeFileSync, mkdirSync, existsSync } from 'fs';

const FIXTURES = join(__dirname, '../../fixtures');
const TEST_FILE = join(FIXTURES, 'deploy-test.html');
const mockFetch = vi.fn();

beforeAll(() => {
  if (!existsSync(FIXTURES)) mkdirSync(FIXTURES, { recursive: true });
  writeFileSync(TEST_FILE, '<html><body>test</body></html>');
});

beforeEach(() => {
  global.fetch = mockFetch;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('uploadFile', () => {
  it('should PUT file content to presigned URL', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true });

    await uploadFile(TEST_FILE, 'https://s3.example.com/presigned', 'text/html');

    expect(mockFetch).toHaveBeenCalledWith(
      'https://s3.example.com/presigned',
      expect.objectContaining({
        method: 'PUT',
        headers: { 'Content-Type': 'text/html' },
      }),
    );
  });

  it('should throw on upload failure', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 403 });

    await expect(
      uploadFile(TEST_FILE, 'https://s3.example.com/presigned', 'text/html'),
    ).rejects.toThrow('Upload failed');
  });

  it('should call onProgress with 100% on success', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true });
    const onProgress = vi.fn();

    await uploadFile(TEST_FILE, 'https://s3.example.com/presigned', 'text/html', onProgress);

    expect(onProgress).toHaveBeenCalledWith(
      expect.objectContaining({ percentage: 100 }),
    );
  });
});

describe('uploadFiles', () => {
  it('should upload multiple files sequentially', async () => {
    mockFetch.mockResolvedValue({ ok: true });

    await uploadFiles([
      { path: TEST_FILE, presignedUrl: 'https://s3.example.com/1', contentType: 'text/html' },
      { path: TEST_FILE, presignedUrl: 'https://s3.example.com/2', contentType: 'text/html' },
    ]);

    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});
