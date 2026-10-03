import { describe, expect, it } from 'vitest';
import { absolutePath, deploymentFiles, fileUrl, parseDeployment, parseFileAccess } from './config';

const base = 'https://chat.example/mekadsh-config.json';
const access = parseFileAccess({ mounts: [
  { pathPrefix: '/', urlPrefix: '/files/root/' },
  { pathPrefix: '/workspace', urlPrefix: 'https://files.example/project/' },
] }, base);

describe('file path mappings', () => {
  it('uses the longest whole-directory prefix', () => {
    expect(fileUrl(access, '/workspace/src/main.ts')).toBe('https://files.example/project/src/main.ts');
    expect(fileUrl(access, '/workspace-other/main.ts')).toBe('https://chat.example/files/root/workspace-other/main.ts');
  });
  it('encodes literal filenames exactly once without creating queries or fragments', () => {
    expect(fileUrl(access, '/workspace/a b#?%2f雪.txt')).toBe('https://files.example/project/a%20b%23%3F%252f%E9%9B%AA.txt');
    expect(fileUrl(access, '/workspace/%2e%2e/secrets')).toBe('https://files.example/project/%252e%252e/secrets');
  });
  it('resolves relative paths only with a known working directory', () => {
    expect(fileUrl(access, './src/../report.pdf', '/workspace')).toBe('https://files.example/project/report.pdf');
    expect(() => fileUrl(access, 'report.pdf')).toThrow('working directory');
  });
  it('normalizes dot segments before choosing an export', () => {
    const limited = parseFileAccess({ mounts: [{ pathPrefix: '/workspace', urlPrefix: '/files/' }] }, base);
    expect(() => fileUrl(limited, '/workspace/../etc/passwd')).toThrow('outside');
    expect(absolutePath('/a//b/./../c')).toBe('/a/c');
  });
  it.each(['a\u0000b', '/a\nb', '/a\\b'])('rejects ambiguous path %j', path => {
    expect(() => absolutePath(path, '/workspace')).toThrow();
  });
});

describe('runtime defaults', () => {
  it('binds defaults to the exact normalized API endpoint', () => {
    const config = parseDeployment({ version: 1, connections: [{ apiBaseUrl: '/api', files: access }] }, base);
    expect(deploymentFiles(config, 'https://chat.example/api')).toEqual(access);
    expect(deploymentFiles(config, 'https://chat.example/another-api/')).toBeUndefined();
    expect(deploymentFiles(config, 'https://other.example/api/')).toBeUndefined();
  });
  it('resolves prefixes against the config location', () => {
    const config = parseDeployment({ version: 1, connections: [{ apiBaseUrl: './api', files: { mounts: [{ pathPrefix: '/', urlPrefix: './files' }] } }] }, 'https://host.example/app/mekadsh-config.json');
    expect(config.connections[0]?.apiBaseUrl).toBe('https://host.example/app/api/');
    expect(config.connections[0]?.files?.mounts[0]?.urlPrefix).toBe('https://host.example/app/files/');
  });
  it('accepts explicit disabled access', () => {
    expect(parseFileAccess({ mounts: [] }, base).mounts).toEqual([]);
  });
  it.each(['javascript:alert(1)', 'https://user:password@files.example/', '/files/?token=secret', '/files/#fragment', 'http://files.example/'])('rejects unsafe prefix %s', urlPrefix => {
    expect(() => parseFileAccess({ mounts: [{ pathPrefix: '/', urlPrefix }] }, base)).toThrow();
  });
  it('rejects duplicate normalized mappings and endpoints', () => {
    expect(() => parseFileAccess({ mounts: [{ pathPrefix: '/x', urlPrefix: '/a' }, { pathPrefix: '/x/', urlPrefix: '/b' }] }, base)).toThrow('unique');
    expect(() => parseDeployment({ version: 1, connections: [{ apiBaseUrl: '/api' }, { apiBaseUrl: '/api/' }] }, base)).toThrow('unique');
  });
  it('rejects unsupported versions and malformed config', () => {
    expect(() => parseDeployment({ version: 2, connections: [] }, base)).toThrow();
    expect(() => parseDeployment('<html>SPA fallback</html>', base)).toThrow();
    expect(() => parseFileAccess({ mounts: [{ pathPrefix: 'relative', urlPrefix: '/files' }] }, base)).toThrow();
  });
});
