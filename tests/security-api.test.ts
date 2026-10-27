import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../server/app';
import { Store } from '../server/store';
import { inventory } from './fixtures';

describe('UEM security boundaries over HTTP', () => {
  let store: Store;
  let app: FastifyInstance;
  let clock: number;
  beforeEach(async () => {
    clock = Date.now();
    store = new Store(':memory:', () => clock);
    app = await buildApp(store, 'a'.repeat(64));
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    await app.close();
    store.close();
  });
  const enroll = (name = 'Lab phone') => store.enroll(store.code().code, name, inventory).session;

  it.each([
    ['GET', '/v1/admin/devices'],
    ['POST', '/v1/admin/codes'],
    ['PUT', '/v1/admin/policy'],
    ['DELETE', '/v1/admin/devices/DEVICE'],
    ['POST', '/v1/admin/devices/DEVICE/commands'],
  ] as const)('prevents device-to-admin escalation: %s %s', async (method, route) => {
    const one = enroll('One'),
      two = enroll('Two');
    const response = await app.inject({
      method,
      url: route.replace('DEVICE', two.deviceId),
      headers: { authorization: `Bearer ${one.token}` },
      ...(method === 'PUT'
        ? { payload: { ...store.policy(), name: 'Attacker policy' } }
        : method === 'POST' && route.endsWith('commands')
          ? { payload: { type: 'show_message', message: 'Injected' } }
          : {}),
    });
    expect(response.statusCode).toBe(401);
    expect(store.devices()).toHaveLength(2);
    expect(store.policy().revision).toBe(1);
    expect(store.commands(two.deviceId)).toHaveLength(0);
  });

  it('binds the check-in identity to the bearer, not a caller-supplied deviceId', async () => {
    const one = enroll('One'),
      two = enroll('Two');
    const before = store.device(two.deviceId);
    const response = await app.inject({
      method: 'POST',
      url: '/v1/device/check-in',
      headers: { authorization: `Bearer ${one.token}` },
      payload: { ...inventory, deviceId: two.deviceId, model: 'Forged model' },
    });
    expect(response.statusCode).toBe(400);
    expect(store.device(two.deviceId)).toEqual(before);
    expect(store.device(one.deviceId).inventory.model).toBe(inventory.model);
  });

  it('does not accept an invented compliant verdict from a device', async () => {
    const session = enroll();
    const response = await app.inject({
      method: 'POST',
      url: '/v1/device/check-in',
      headers: { authorization: `Bearer ${session.token}` },
      payload: { ...inventory, compliance: 'pass', policyRevision: 999 },
    });
    expect(response.statusCode).toBe(400);
    expect(store.device(session.deviceId).inventory).toEqual(inventory);
  });

  it('does not leak another device command through a BOLA attempt', async () => {
    const one = enroll('One'),
      two = enroll('Two');
    const foreign = store.enqueue(two.deviceId, {
      type: 'show_message',
      message: 'Private to Two',
      ttlSeconds: 300,
    });
    store.checkIn(two.deviceId, inventory);
    const before = store.commands(two.deviceId)[0];
    const response = await app.inject({
      method: 'POST',
      url: `/v1/device/commands/${foreign.id}/result`,
      headers: { authorization: `Bearer ${one.token}` },
      payload: { status: 'acknowledged' },
    });
    const absent = await app.inject({
      method: 'POST',
      url: '/v1/device/commands/00000000-0000-4000-8000-000000000099/result',
      headers: { authorization: `Bearer ${one.token}` },
      payload: { status: 'acknowledged' },
    });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual(absent.json());
    expect(response.body).not.toContain('Private to Two');
    expect(store.commands(two.deviceId)[0]).toEqual(before);
  });

  it('does not turn cookies or query-string credentials into ambient authentication', async () => {
    const session = enroll();
    for (const headers of [{ cookie: `session=${session.token}` }, {}]) {
      const response = await app.inject({
        method: 'POST',
        url: `/v1/device/check-in?token=${session.token}`,
        headers,
        payload: inventory,
      });
      expect(response.statusCode).toBe(401);
      expect(response.body.includes(session.token)).toBe(false);
    }
    expect(store.authenticate(session.token)).toBe(session.deviceId);
  });

  it.each(['https://attacker.example', 'http://localhost:8087.attacker.example', 'null'])(
    'rejects browser state changes from untrusted Origin %s even with a valid bearer',
    async (origin) => {
      const session = enroll();
      const before = store.device(session.deviceId);
      const response = await app.inject({
        method: 'DELETE',
        url: '/v1/device',
        headers: { authorization: `Bearer ${session.token}`, origin },
      });
      expect(response.statusCode).toBe(403);
      expect(store.device(session.deviceId)).toEqual(before);
      expect(store.authenticate(session.token)).toBe(session.deviceId);
    },
  );

  it('accepts an explicit bearer from the trusted preview and from an origin-less native client', async () => {
    const session = enroll();
    for (const origin of [undefined, 'http://localhost:8087']) {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/device/check-in',
        headers: { authorization: `Bearer ${session.token}`, ...(origin ? { origin } : {}) },
        payload: inventory,
      });
      expect(response.statusCode).toBe(200);
    }
  });

  it('returns credentials only in non-cacheable JSON responses with nosniff', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/enroll',
      payload: { code: store.code().code, name: 'Lab phone', inventory },
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['content-security-policy']).toBe(
      "default-src 'none'; frame-ancestors 'none'",
    );
    expect(response.headers['content-type']).toContain('application/json');
    expect(response.headers['set-cookie']).toBeUndefined();
  });

  it('enforces the 16 KiB body limit without echoing request contents', async () => {
    const session = enroll();
    const response = await app.inject({
      method: 'POST',
      url: '/v1/device/check-in',
      headers: { authorization: `Bearer ${session.token}` },
      payload: { ...inventory, model: 'x'.repeat(20000) },
    });
    expect(response.statusCode).toBe(413);
    expect(response.body.length).toBeLessThan(200);
    expect(response.body.includes(session.token)).toBe(false);
    expect(store.device(session.deviceId).inventory).toEqual(inventory);
  });

  it('treats a SQL-shaped nickname as data, not as an executable query', async () => {
    const name = "x'); DROP TABLE devices; --";
    enroll('Existing');
    const response = await app.inject({
      method: 'POST',
      url: '/v1/enroll',
      payload: { code: store.code().code, name, inventory },
    });
    expect(response.statusCode).toBe(200);
    expect(store.devices()).toHaveLength(2);
    expect(store.device(response.json().session.deviceId).name).toBe(name);
  });

  it('does not expose stack traces or credentials when an internal operation fails', async () => {
    const session = enroll();
    vi.spyOn(store, 'checkIn').mockImplementation(() => {
      throw new Error(`Secret context ${session.token}`);
    });
    const response = await app.inject({
      method: 'POST',
      url: '/v1/device/check-in',
      headers: { authorization: `Bearer ${session.token}` },
      payload: inventory,
    });
    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({ error: 'Internal server error.' });
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('ignores replayed acknowledgement inventory instead of rolling device data back', () => {
    const session = enroll();
    const command = store.enqueue(session.deviceId, { type: 'refresh_inventory', ttlSeconds: 300 });
    store.checkIn(session.deviceId, inventory);
    const current = { ...inventory, osVersion: '16' };
    store.complete(session.deviceId, command.id, { status: 'acknowledged', inventory: current });
    const doneAt = store.commands(session.deviceId)[0].completedAt;
    clock += 1000;
    store.complete(session.deviceId, command.id, {
      status: 'acknowledged',
      inventory: { ...inventory, osVersion: '10' },
    });
    expect(store.device(session.deviceId).inventory).toEqual(current);
    expect(store.commands(session.deviceId)[0].completedAt).toBe(doneAt);
  });

  it('does not let a revoked token acknowledge pending commands after re-enrollment', async () => {
    const old = enroll('Same phone');
    const command = store.enqueue(old.deviceId, { type: 'refresh_inventory', ttlSeconds: 300 });
    store.checkIn(old.deviceId, inventory);
    store.revoke(old.deviceId);
    const fresh = enroll('Same phone');
    const response = await app.inject({
      method: 'POST',
      url: `/v1/device/commands/${command.id}/result`,
      headers: { authorization: `Bearer ${old.token}` },
      payload: { status: 'acknowledged' },
    });
    expect(response.statusCode).toBe(401);
    expect(fresh.deviceId).not.toBe(old.deviceId);
    expect(store.commands(fresh.deviceId)).toHaveLength(0);
  });
});
