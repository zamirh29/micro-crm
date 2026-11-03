import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { API_URL, ApiError, getAccessToken } from '@/lib/api';

export interface DownloadedFile {
  uri: string;
  fileName: string;
  mimeType: string;
}

function filenameFromHeaders(res: Response, fallback: string): string {
  const disposition = res.headers.get('content-disposition') ?? '';
  const quoted = /filename="([^"]+)"/i.exec(disposition);
  if (quoted?.[1]) return quoted[1];
  const plain = /filename=([^;]+)/i.exec(disposition);
  if (plain?.[1]) return plain[1].trim();
  return fallback;
}

/**
 * Downloads an authenticated response into the app cache and returns the file.
 * `Content-Disposition` is honoured so the shared file keeps the server's name.
 */
export async function downloadFile(
  path: string,
  fallbackName: string
): Promise<DownloadedFile> {
  const headers: Record<string, string> = {};
  const token = getAccessToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_URL}${path}`, { headers });
  if (!res.ok) {
    let message = `Could not download the file (${res.status})`;
    try {
      const data = await res.json();
      if (typeof data?.error === 'string') message = data.error;
    } catch {
      // keep default message
    }
    throw new ApiError(res.status, message);
  }

  const bytes = new Uint8Array(await res.arrayBuffer());
  const fileName = filenameFromHeaders(res, fallbackName);
  const mimeType = res.headers.get('content-type') ?? 'application/octet-stream';

  const file = new File(Paths.cache, fileName);
  if (file.exists) file.delete();
  file.create({ intermediates: true });
  file.write(bytes);

  return { uri: file.uri, fileName, mimeType };
}

/** Opens the platform share sheet for an already-downloaded file. */
export async function shareFile(file: DownloadedFile): Promise<void> {
  const available = await Sharing.isAvailableAsync();
  if (!available) {
    throw new Error('Sharing is not available on this device');
  }

  const isCsv = file.fileName.toLowerCase().endsWith('.csv');
  await Sharing.shareAsync(file.uri, {
    mimeType: file.mimeType,
    dialogTitle: file.fileName,
    UTI: isCsv ? 'public.comma-separated-values-text' : undefined,
  });
}
