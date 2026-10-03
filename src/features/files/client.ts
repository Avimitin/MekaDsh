import type { FileAuth } from './config';

export interface FileCredential { username: string; secret: string }
export const PREVIEW_LIMIT = 8 * 1024 * 1024;
export const DOWNLOAD_LIMIT = 64 * 1024 * 1024;

export function fileRequest(auth: FileAuth, credential?: FileCredential): RequestInit {
  const headers = new Headers();
  if (auth === 'basic' || auth === 'bearer') {
    if (!credential?.secret) throw new Error('Add file server credentials in Settings → File access.');
    if (auth === 'basic') {
      if (credential.username.includes(':')) throw new Error('A Basic authentication username cannot contain a colon.');
      const bytes = new TextEncoder().encode(`${credential.username}:${credential.secret}`);
      headers.set('Authorization', 'Basic ' + btoa(Array.from(bytes, b => String.fromCharCode(b)).join('')));
    } else headers.set('Authorization', 'Bearer ' + credential.secret);
  }
  return {
    headers, credentials: auth === 'browser' ? 'include' : 'omit',
    redirect: 'error', cache: 'no-store', referrerPolicy: 'no-referrer',
  };
}

export function checkFileResponse(response: Response) {
  if (response.status === 401) throw new Error('File server authentication required. Check File access in Settings.');
  if (response.status === 403) throw new Error('The file server denied access to this path.');
  if (response.status === 404) throw new Error('This file was not found on the file server.');
  if (!response.ok) throw new Error(`File server returned HTTP ${response.status}.`);
}

/** Enforce the limit while streaming, even without a trustworthy Content-Length. */
export async function readBounded(response: Response, limit: number): Promise<Uint8Array<ArrayBuffer>> {
  if (Number(response.headers.get('Content-Length')) > limit) {
    await response.body?.cancel();
    throw new Error(`This file exceeds the ${Math.round(limit / 1024 / 1024)} MiB limit for this action.`);
  }
  if (!response.body) throw new Error('The file server returned no response body.');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) throw new Error(`This file exceeds the ${Math.round(limit / 1024 / 1024)} MiB limit for this action.`);
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}

export async function fetchFile(url: string, auth: FileAuth, credential: FileCredential | undefined, signal: AbortSignal, limit = PREVIEW_LIMIT) {
  const response = await fetch(url, { ...fileRequest(auth, credential), signal });
  checkFileResponse(response);
  const bytes = await readBounded(response, limit);
  return {
    bytes,
    type: response.headers.get('Content-Type')?.split(';')[0]?.trim().toLowerCase() ?? '',
    modified: response.headers.get('Last-Modified'),
  };
}
