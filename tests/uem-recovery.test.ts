import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';
import { CommandSchema, SnapshotSchema } from '../shared/contracts';
import { buildApp } from '../server/app';
import { Store } from '../server/store';
import { ApiError, emptyCache, SyncEngine, type Cache, type DeviceApi } from '../src/core/sync';
import { inventory } from './fixtures';

it('recovers a committed but lost ACK across SQLite reopen and client cache reload', async () => {
  const database = join(tmpdir(), `pocketfleet-recovery-${randomUUID()}.sqlite`);
  const cacheFile = `${database}.cache.json`;
  const adminToken = 'c'.repeat(64);
  let store = new Store(database);
  let app = await buildApp(store, adminToken);
  try {
    const enrolled = store.enroll(store.code().code, 'Recovery lab', inventory);
    const session = { ...enrolled.session, url: 'http://localhost:4347' };
    const queued = store.enqueue(session.deviceId, { type: 'refresh_inventory', ttlSeconds: 300 });
    writeFileSync(cacheFile, JSON.stringify(emptyCache()));
    const collect = vi.fn(async () => inventory);
    let loseFirstReply = true;
    const api: DeviceApi = {
      checkIn: async (_session, collected) => {
        const response = await app.inject({
          method: 'POST',
          url: '/v1/device/check-in',
          headers: { authorization: `Bearer ${session.token}` },
          payload: collected,
        });
        if (response.statusCode !== 200)
          throw new ApiError(response.statusCode, 'Check-in rejected');
        return SnapshotSchema.parse(response.json());
      },
      result: vi.fn(async (_session, id, result) => {
        const response = await app.inject({
          method: 'POST',
          url: `/v1/device/commands/${id}/result`,
          headers: { authorization: `Bearer ${session.token}` },
          payload: result,
        });
        if (response.statusCode !== 200) throw new ApiError(response.statusCode, 'Result rejected');
        if (loseFirstReply) {
          loseFirstReply = false;
          // The HTTP handler committed to SQLite, but the client never saw its response.
          throw new Error('Simulated connection loss AFTER server commit');
        }
        return CommandSchema.parse(response.json());
      }),
    };
    const engine = () =>
      new SyncEngine({
        session,
        api,
        inventory: collect,
        load: () => JSON.parse(readFileSync(cacheFile, 'utf8')) as Cache,
        save: async (cache) => {
          writeFileSync(cacheFile, JSON.stringify(cache));
        },
      });
    await expect(engine().sync()).rejects.toThrow('AFTER server commit');
    const pending: Cache = JSON.parse(readFileSync(cacheFile, 'utf8'));
    expect(pending.outbox).toHaveLength(1);
    expect(pending.processed).toEqual([queued.id]);
    expect(readFileSync(cacheFile, 'utf8').includes(session.token)).toBe(false);
    const completed = store.commands(session.deviceId)[0];
    expect(completed.status).toBe('acknowledged');
    expect(completed.completedAt).not.toBeNull();

    // Fresh server/store/engine instances: neither an in-memory DB nor an in-memory cache survives.
    await app.close();
    store.close();
    store = new Store(database);
    app = await buildApp(store, adminToken);
    await engine().sync();
    const recovered: Cache = JSON.parse(readFileSync(cacheFile, 'utf8'));
    expect(recovered.outbox).toEqual([]);
    expect(recovered.processed).toEqual([queued.id]);
    expect(recovered.snapshot?.commands[0].status).toBe('acknowledged');
    expect(store.commands(session.deviceId)[0].completedAt).toBe(completed.completedAt);
    expect(api.result).toHaveBeenCalledTimes(2);
    // Two routine check-ins + one command execution, not two command executions.
    expect(collect).toHaveBeenCalledTimes(3);
  } finally {
    await app.close();
    store.close();
    for (const path of [database, `${database}-wal`, `${database}-shm`, cacheFile]) {
      try {
        unlinkSync(path);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
    }
  }
});
