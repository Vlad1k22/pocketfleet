import { afterEach, describe, expect, it, vi } from 'vitest';
import { deviceApi, request } from '../src/mobile/api';
import { inventory, session, snapshot } from './fixtures';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
describe('fetch boundary', () => {
  it('sends the device token as a header, never in a URL', async () => {
    const fetch = vi.fn(
      async (_url: string, _init: RequestInit) =>
        new Response(JSON.stringify(snapshot()), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetch);
    await deviceApi.checkIn(session, inventory);
    expect(fetch.mock.calls[0][0]).not.toContain(session.token);
    expect(fetch.mock.calls[0][1]).toMatchObject({
      method: 'POST',
      headers: { Authorization: `Bearer ${session.token}` },
    });
  });
  it('validates server snapshots instead of persisting arbitrary JSON', async () => {
    vi.stubGlobal(
      'fetch',
      async () => new Response(JSON.stringify({ device: 'invalid' }), { status: 200 }),
    );
    await expect(deviceApi.checkIn(session, inventory)).rejects.toThrow();
  });
  it('does not advertise an empty JSON body when disconnecting', async () => {
    const fetch = vi.fn(
      async (_url: string, _init: RequestInit) => new Response('{"revoked":true}', { status: 200 }),
    );
    vi.stubGlobal('fetch', fetch);
    await request(session, '/v1/device', undefined, undefined, 'DELETE');
    expect(fetch.mock.calls[0][1].headers).not.toHaveProperty('Content-Type');
  });
  it('retains the status code of an authorization error', async () => {
    vi.stubGlobal(
      'fetch',
      async () => new Response(JSON.stringify({ error: 'Session revoked' }), { status: 401 }),
    );
    await expect(request(session, '/v1/device/check-in', inventory)).rejects.toMatchObject({
      status: 401,
    });
  });
  it('forwards cancellation to the actual fetch signal', async () => {
    let actual: AbortSignal | undefined;
    vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
      actual = init.signal as AbortSignal;
      return new Promise((_resolve, reject) =>
        actual!.addEventListener('abort', () => reject(new Error('aborted')), { once: true }),
      );
    });
    const abort = new AbortController();
    const pending = request(session, '/v1/device/check-in', inventory, abort.signal);
    abort.abort();
    await expect(pending).rejects.toThrow('aborted');
    expect(actual?.aborted).toBe(true);
  });
});
