import { QueryClient, useQuery } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';
import type { Connection } from '../../connections/storage';
import { deploymentFiles, parseDeployment, parseFileAccess, type FileAccess } from './config';
import { readBounded, type FileCredential } from './client';

// The meka runtime clears its query cache when changing credentials/connections.
// Deployment defaults belong to this page, independently of that lifecycle.
const deploymentQueries = new QueryClient();
export function useDeploymentConfig() {
  return useQuery({
    queryKey: ['mekadsh-deployment'], staleTime: Infinity, retry: false,
    queryFn: async ({ signal }) => {
      const url = new URL('mekadsh-config.json', document.baseURI);
      const response = await fetch(url, { signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]), cache: 'no-store', redirect: 'error', credentials: 'same-origin' });
      if (response.status === 404) return null;
      // Static SPA hosts commonly return index.html for missing configuration.
      if (response.ok && response.headers.get('Content-Type')?.includes('text/html')) return null;
      if (!response.ok) throw new Error(`Runtime configuration returned HTTP ${response.status}.`);
      const bytes = await readBounded(response, 64 * 1024);
      return parseDeployment(JSON.parse(new TextDecoder().decode(bytes)) as unknown, url.href);
    },
  }, deploymentQueries);
}

const listeners = new Set<() => void>();
const memory = new Map<string, string | null>();
const prefix = 'mekadsh:files:v1:';
const key = (c: Connection) => prefix + c.id + ':' + c.endpoint;
const emit = () => { for (const listener of listeners) listener(); };
function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener('storage', listener);
  return () => { listeners.delete(listener); window.removeEventListener('storage', listener); };
}
function read(k: string, session = false) {
  if (memory.has(k)) return memory.get(k)!;
  try { return (session ? sessionStorage : localStorage).getItem(k); } catch { return null; }
}
function write(k: string, value: string | null, session = false) {
  try {
    const storage = session ? sessionStorage : localStorage;
    if (value === null) storage.removeItem(k); else storage.setItem(k, value);
    memory.delete(k);
  } catch {
    memory.set(k, value);
    emit();
    throw new Error('Browser storage is unavailable. File settings work for this page only.');
  }
  emit();
}

export function saveFileAccess(connection: Connection, access: FileAccess | null) {
  write(key(connection), access === null ? null : JSON.stringify(access));
}
const credentialKey = (connection: Connection, access: FileAccess) => key(connection) + ':' + connection.authority + ':' + JSON.stringify(access);
export function saveFileCredential(connection: Connection, access: FileAccess, credential: FileCredential) {
  // The authority changes when a meka credential is replaced or forgotten.
  write(credentialKey(connection, access), credential.secret ? JSON.stringify(credential) : null, true);
}

export function useFileAccess(connection?: Connection) {
  const deployment = useDeploymentConfig();
  const raw = useSyncExternalStore(subscribe, () => connection ? read(key(connection)) : null);
  let access: FileAccess | undefined;
  let credential: FileCredential | undefined;
  let error = deployment.error?.message;
  try {
    access = raw !== null ? parseFileAccess(JSON.parse(raw) as unknown, document.baseURI)
      : connection ? deploymentFiles(deployment.data ?? undefined, connection.endpoint) : undefined;
    if (raw !== null) error = undefined;
  } catch (e) { error = e instanceof Error ? e.message : 'Invalid file access settings.'; }
  const secret = useSyncExternalStore(subscribe, () => connection && access ? read(credentialKey(connection, access), true) : null);
  try {
    if (secret) {
      const value = JSON.parse(secret) as FileCredential;
      if (typeof value.username === 'string' && typeof value.secret === 'string') credential = value;
    }
  } catch (e) { error = e instanceof Error ? e.message : 'Invalid file access settings.'; }
  return { access, credential, error, overridden: raw !== null, loading: deployment.isPending };
}
