import { afterEach, expect, it, vi } from 'vitest';
import { checkFileResponse, fetchFile, fileRequest, readBounded } from './client';

afterEach(() => vi.unstubAllGlobals());

it('sends only explicitly selected file credentials and refuses redirects', () => {
  const request = fileRequest('basic', { username: 'alice', secret: 'files-only' });
  expect(new Headers(request.headers).get('Authorization')).toBe('Basic ' + btoa('alice:files-only'));
  expect(request.credentials).toBe('omit');
  expect(request.redirect).toBe('error');
  expect(new Headers(fileRequest('none').headers).has('Authorization')).toBe(false);
  expect(fileRequest('none').credentials).toBe('omit');
  expect(fileRequest('browser').credentials).toBe('include');
  expect(() => fileRequest('bearer')).toThrow('credentials');
});

it('cancels an oversized stream even if Content-Length is missing', async () => {
  const cancel = vi.fn();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) { controller.enqueue(new Uint8Array(8)); controller.enqueue(new Uint8Array(8)); }, cancel,
  });
  await expect(readBounded(new Response(stream), 10)).rejects.toThrow('exceeds');
  expect(cancel).toHaveBeenCalled();
});

it('rejects a declared oversized file without consuming the stream', async () => {
  const cancel = vi.fn();
  const response = new Response(new ReadableStream({ cancel }), { headers: { 'Content-Length': '200' } });
  await expect(readBounded(response, 100)).rejects.toThrow('exceeds');
  expect(cancel).toHaveBeenCalled();
});

it('preserves exact binary bytes', async () => {
  const bytes = new Uint8Array([0, 255, 10, 13, 128]);
  expect(await readBounded(new Response(bytes), 10)).toEqual(bytes);
});

it.each([[401, 'authentication'], [403, 'denied'], [404, 'not found']])('explains HTTP %s', (status, message) => {
  expect(() => checkFileResponse(new Response(null, { status }))).toThrow(String(message));
});

it('passes abort signals and never uses the meka client', async () => {
  const fetch = vi.fn().mockResolvedValue(new Response('current', { headers: { 'Content-Type': 'text/plain', 'Last-Modified': 'today' } }));
  vi.stubGlobal('fetch', fetch);
  const signal = new AbortController().signal;
  const file = await fetchFile('https://files.example/a', 'bearer', { username: '', secret: 'file-token' }, signal);
  const options = fetch.mock.calls[0]?.[1] as RequestInit;
  expect(new Headers(options.headers).get('Authorization')).toBe('Bearer file-token');
  expect(options.signal).toBe(signal);
  expect(new TextDecoder().decode(file.bytes)).toBe('current');
});
