import { normalizeEndpoint } from '../../api/client';

export interface FileMount { pathPrefix: string; urlPrefix: string }
export type FileAuth = 'browser' | 'none' | 'basic' | 'bearer';
export interface FileAccess { mounts: FileMount[]; auth: FileAuth }
export interface DeploymentConfig {
  version: 1;
  connections: { apiBaseUrl: string; files?: FileAccess }[];
}
const object = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

/** Paths are POSIX paths in meka's filesystem, not URL-encoded strings. */
export function absolutePath(path: string, cwd?: string | null): string {
  if (!path || /[\u0000-\u001f\u007f\\]/u.test(path)) throw new Error('Enter a POSIX file path without control characters or backslashes.');
  if (!path.startsWith('/')) {
    if (!cwd?.startsWith('/')) throw new Error('This relative path needs a known session working directory.');
    path = `${absolutePath(cwd)}/${path}`;
  }
  const parts: string[] = [];
  for (const part of path.split('/')) {
    if (part === '..') parts.pop();
    else if (part && part !== '.') parts.push(part);
  }
  return '/' + parts.join('/');
}

function httpBase(value: string, base: string): string {
  const url = new URL(value, base);
  if (new URL(base).protocol === 'https:' && url.protocol !== 'https:')
    throw new Error('An HTTPS frontend requires an HTTPS file server and API.');
  return normalizeEndpoint(url.href);
}

export function parseFileAccess(value: unknown, base: string): FileAccess {
  if (!object(value) || !Array.isArray(value.mounts) || value.mounts.length > 32)
    throw new Error('File access requires a mounts array with at most 32 entries.');
  const auth = value.auth ?? 'browser';
  if (auth !== 'browser' && auth !== 'none' && auth !== 'basic' && auth !== 'bearer')
    throw new Error('Unsupported file authentication method.');
  const mounts = value.mounts.map((mount): FileMount => {
    if (!object(mount) || typeof mount.pathPrefix !== 'string' || !mount.pathPrefix.startsWith('/')
      || typeof mount.urlPrefix !== 'string' || !mount.urlPrefix.trim())
      throw new Error('Each mount needs an absolute filesystem prefix and an HTTP URL prefix.');
    const pathPrefix = absolutePath(mount.pathPrefix).replace(/\/$/, '') + '/';
    return { pathPrefix, urlPrefix: httpBase(mount.urlPrefix, base) };
  });
  if (new Set(mounts.map(m => m.pathPrefix)).size !== mounts.length)
    throw new Error('Filesystem prefixes must be unique.');
  return { mounts, auth };
}

export function parseDeployment(value: unknown, base: string): DeploymentConfig {
  if (!object(value) || value.version !== 1 || !Array.isArray(value.connections) || value.connections.length > 40)
    throw new Error('Unsupported mekadsh runtime configuration.');
  const connections = value.connections.map(entry => {
    if (!object(entry) || typeof entry.apiBaseUrl !== 'string') throw new Error('Each connection needs an API base URL.');
    return {
      apiBaseUrl: httpBase(entry.apiBaseUrl, base),
      ...(entry.files === undefined ? {} : { files: parseFileAccess(entry.files, base) }),
    };
  });
  if (new Set(connections.map(c => c.apiBaseUrl)).size !== connections.length)
    throw new Error('API base URLs must be unique.');
  return { version: 1, connections };
}

export function deploymentFiles(config: DeploymentConfig | undefined, endpoint: string): FileAccess | undefined {
  return config?.connections.find(c => c.apiBaseUrl === normalizeEndpoint(endpoint))?.files;
}

export function fileUrl(access: FileAccess, path: string, cwd?: string | null): string {
  const absolute = absolutePath(path, cwd);
  const mount = [...access.mounts].sort((a, b) => b.pathPrefix.length - a.pathPrefix.length)
    .find(m => absolute.startsWith(m.pathPrefix));
  if (!mount) throw new Error('This file is outside the configured filesystem prefixes.');
  const relative = absolute.slice(mount.pathPrefix.length);
  // Encode literal %, #, ?, spaces, and Unicode exactly once, segment by segment.
  return mount.urlPrefix + relative.split('/').map(encodeURIComponent).join('/');
}
