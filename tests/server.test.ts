import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { Store } from '../server/store';
import { buildApp } from '../server/app';
import { defaultPolicy } from '../shared/contracts';
import { inventory } from './fixtures';

describe('management API', () => {
  let store: Store, app: FastifyInstance, clock: number;
  const adminToken = 'a'.repeat(64),
    admin = { authorization: `Bearer ${adminToken}` };
  beforeEach(async () => {
    clock = Date.now();
    store = new Store(':memory:', () => clock);
    app = await buildApp(store, adminToken);
  });
  afterEach(async () => {
    await app.close();
    store.close();
  });
  const enroll = () => store.enroll(store.code().code, 'Phone', inventory).session;
  it('exposes only a non-sensitive health check', async () =>
    expect((await app.inject({ method: 'GET', url: '/health' })).json()).toEqual({
      name: 'PocketFleet lab API',
      version: '1.0.0',
    }));
  it('allows browser disconnection preflight from the local preview', async () => {
    const response = await app.inject({
      method: 'OPTIONS',
      url: '/v1/device',
      headers: {
        origin: 'http://localhost:8087',
        'access-control-request-method': 'DELETE',
        'access-control-request-headers': 'authorization',
      },
    });
    expect(response.statusCode).toBe(204);
    expect(response.headers['access-control-allow-methods']).toContain('DELETE');
  });
  it('does not enable CORS for an untrusted website', async () => {
    const response = await app.inject({
      method: 'OPTIONS',
      url: '/v1/device',
      headers: { origin: 'https://untrusted.example', 'access-control-request-method': 'DELETE' },
    });
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });
  it('requires administrator authentication', async () =>
    expect((await app.inject({ method: 'GET', url: '/v1/admin/devices' })).statusCode).toBe(401));
  it('does not accept a device token as an admin token', async () =>
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/v1/admin/devices',
          headers: { authorization: `Bearer ${enroll().token}` },
        })
      ).statusCode,
    ).toBe(401));
  it('creates a single-use enrollment code', async () => {
    const { code } = (
      await app.inject({ method: 'POST', url: '/v1/admin/codes', headers: admin })
    ).json();
    const input = {
      method: 'POST' as const,
      url: '/v1/enroll',
      payload: { code, name: 'Phone', inventory },
    };
    expect((await app.inject(input)).statusCode).toBe(200);
    expect((await app.inject(input)).statusCode).toBe(400);
  });
  it('expires enrollment codes after ten minutes', () => {
    const { code } = store.code();
    clock += 600000;
    expect(() => store.enroll(code, 'Phone', inventory)).toThrow('expired');
  });
  it('validates enrollment before consuming a code', async () => {
    const { code } = store.code();
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/v1/enroll',
          payload: { code, name: '', inventory },
        })
      ).statusCode,
    ).toBe(400);
    expect(store.enroll(code, 'Phone', inventory).session.token).toHaveLength(64);
  });
  it('rate-limits code guessing', async () => {
    let status = 0;
    for (let i = 0; i < 6; i++)
      status = (
        await app.inject({
          method: 'POST',
          url: '/v1/enroll',
          payload: { code: '00000000', name: 'Phone', inventory },
        })
      ).statusCode;
    expect(status).toBe(429);
  });
  it('stores token hashes, not the original bearer token', () => {
    const session = enroll();
    const row = store.db.prepare('SELECT token_hash FROM devices').get()!;
    expect(row.token_hash).not.toBe(session.token);
    expect(String(row.token_hash)).toHaveLength(64);
  });
  it('never returns token hashes in device listings', async () => {
    enroll();
    const response = await app.inject({ method: 'GET', url: '/v1/admin/devices', headers: admin });
    expect(response.body).not.toContain('token');
  });
  it('separates queued, delivered and acknowledged states', () => {
    const session = enroll();
    const command = store.enqueue(session.deviceId, { type: 'refresh_inventory', ttlSeconds: 300 });
    expect(command.status).toBe('queued');
    expect(store.checkIn(session.deviceId, inventory).commands[0].status).toBe('delivered');
    expect(
      store.complete(session.deviceId, command.id, { status: 'acknowledged', inventory }).status,
    ).toBe('acknowledged');
  });
  it('redelivers a command until its result is confirmed', () => {
    const session = enroll();
    store.enqueue(session.deviceId, { type: 'refresh_inventory', ttlSeconds: 300 });
    store.checkIn(session.deviceId, inventory);
    expect(store.checkIn(session.deviceId, inventory).commands[0].status).toBe('delivered');
  });
  it('accepts duplicate acknowledgements without modifying completion time', () => {
    const session = enroll();
    const command = store.enqueue(session.deviceId, { type: 'refresh_inventory', ttlSeconds: 300 });
    store.checkIn(session.deviceId, inventory);
    const first = store.complete(session.deviceId, command.id, { status: 'acknowledged' });
    clock += 1000;
    expect(
      store.complete(session.deviceId, command.id, { status: 'acknowledged' }).completedAt,
    ).toBe(first.completedAt);
  });
  it('rejects changing a terminal result', () => {
    const session = enroll();
    const command = store.enqueue(session.deviceId, { type: 'refresh_inventory', ttlSeconds: 300 });
    store.checkIn(session.deviceId, inventory);
    store.complete(session.deviceId, command.id, { status: 'acknowledged' });
    expect(() => store.complete(session.deviceId, command.id, { status: 'failed' })).toThrow(
      'terminal',
    );
  });
  it('does not accept results from another device', async () => {
    const one = enroll(),
      two = enroll();
    const command = store.enqueue(one.deviceId, { type: 'refresh_inventory', ttlSeconds: 300 });
    store.checkIn(one.deviceId, inventory);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/v1/device/commands/${command.id}/result`,
          headers: { authorization: `Bearer ${two.token}` },
          payload: { status: 'acknowledged' },
        })
      ).statusCode,
    ).toBe(404);
  });
  it('rejects an acknowledgement before delivery', () => {
    const session = enroll();
    const command = store.enqueue(session.deviceId, { type: 'refresh_inventory', ttlSeconds: 300 });
    expect(() => store.complete(session.deviceId, command.id, { status: 'acknowledged' })).toThrow(
      'delivered',
    );
  });
  it('does not deliver expired commands', () => {
    const session = enroll();
    store.enqueue(session.deviceId, { type: 'refresh_inventory', ttlSeconds: 30 });
    clock += 30000;
    expect(store.checkIn(session.deviceId, inventory).commands[0].status).toBe('expired');
  });
  it('bounds the pending queue', () => {
    const session = enroll();
    for (let i = 0; i < 20; i++)
      store.enqueue(session.deviceId, { type: 'refresh_inventory', ttlSeconds: 300 });
    expect(() =>
      store.enqueue(session.deviceId, { type: 'refresh_inventory', ttlSeconds: 300 }),
    ).toThrow('full');
  });
  it('retains pending work even behind more than 100 finished commands', () => {
    const session = enroll();
    const pending = store.enqueue(session.deviceId, { type: 'refresh_inventory', ttlSeconds: 300 });
    store.checkIn(session.deviceId, inventory);
    for (let i = 0; i < 105; i++) {
      const command = store.enqueue(session.deviceId, {
        type: 'refresh_inventory',
        ttlSeconds: 300,
      });
      store.checkIn(session.deviceId, inventory);
      store.complete(session.deviceId, command.id, { status: 'acknowledged' });
    }
    expect(
      store
        .checkIn(session.deviceId, inventory)
        .commands.some((command) => command.id === pending.id && command.status === 'delivered'),
    ).toBe(true);
  });
  it('rejects unsupported commands at the HTTP boundary', async () => {
    const session = enroll();
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/v1/admin/devices/${session.deviceId}/commands`,
          headers: admin,
          payload: { type: 'wipe' },
        })
      ).statusCode,
    ).toBe(400);
  });
  it('increments policy revisions', async () => {
    const { revision: _revision, ...input } = defaultPolicy;
    const response = await app.inject({
      method: 'PUT',
      url: '/v1/admin/policy',
      headers: admin,
      payload: { ...input, minimumAndroidMajor: 14 },
    });
    expect(response.json().revision).toBe(2);
  });
  it('revokes sessions and removes commands', async () => {
    const session = enroll();
    store.enqueue(session.deviceId, { type: 'refresh_inventory', ttlSeconds: 300 });
    await app.inject({
      method: 'DELETE',
      url: '/v1/device',
      headers: { authorization: `Bearer ${session.token}` },
    });
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/v1/device/check-in',
          headers: { authorization: `Bearer ${session.token}` },
          payload: inventory,
        })
      ).statusCode,
    ).toBe(401);
    expect(store.db.prepare('SELECT count(*) AS n FROM commands').get()?.n).toBe(0);
  });
});
