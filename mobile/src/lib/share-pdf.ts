import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { API_URL, getAccessToken } from '@/lib/api';

/** Downloads an authenticated PDF to the cache directory and opens the share sheet. */
export async function sharePdf(path: string, fileName: string): Promise<void> {
  const headers: Record<string, string> = {};
  const token = getAccessToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`${API_URL}${path}`, { headers });
  if (!response.ok) {
    throw new Error(`Could not download the PDF (${response.status})`);
  }

  const bytes = new Uint8Array(await response.arrayBuffer());

  const file = new File(Paths.cache, fileName);
  if (file.exists) file.delete();
  file.create({ intermediates: true });
  file.write(bytes);

  await Sharing.shareAsync(file.uri, {
    mimeType: 'application/pdf',
    dialogTitle: fileName,
    UTI: 'com.adobe.pdf',
  });
}
