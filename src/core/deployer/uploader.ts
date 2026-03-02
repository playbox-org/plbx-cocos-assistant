import { readFileSync } from 'fs';

interface UploadProgress {
  file: string;
  loaded: number;
  total: number;
  percentage: number;
}

export async function uploadFile(
  filePath: string,
  presignedUrl: string,
  contentType: string,
  onProgress?: (progress: UploadProgress) => void,
): Promise<void> {
  const content = readFileSync(filePath);
  const total = content.length;

  const res = await fetch(presignedUrl, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: content,
  });

  if (!res.ok) {
    throw new Error(`Upload failed for ${filePath}: ${res.status}`);
  }

  onProgress?.({
    file: filePath,
    loaded: total,
    total,
    percentage: 100,
  });
}

export async function uploadFiles(
  files: Array<{ path: string; presignedUrl: string; contentType: string }>,
  onProgress?: (progress: UploadProgress) => void,
): Promise<void> {
  for (const file of files) {
    await uploadFile(file.path, file.presignedUrl, file.contentType, onProgress);
  }
}
