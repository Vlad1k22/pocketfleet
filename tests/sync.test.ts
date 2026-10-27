import { describe, expect, it, vi } from 'vitest';
import { ApiError, emptyCache, SyncEngine, type Cache, type DeviceApi } from '../src/core/sync';
import { command, inventory, session, snapshot } from './fixtures';

function setup(apiOverrides: Partial<DeviceApi> = {}, initial: Cache = emptyCache()) {
  let cache = initial;
  const writes: Cache[] = [];
  const api: DeviceApi = {
    checkIn: vi.fn(async () => snapshot([command()])),
    result: vi.fn(async (_session, id, result) =>
      command({ id, status: result.status, completedAt: new Date().toISOString() }),
    ),
    ...apiOverrides,
  };
  const collect = vi.fn(async () => inventory);
  const engine = new SyncEngine({
    session,
    api,
    load: () => cache,
    save: async (value) => {
      cache = value;
      writes.push(value);
    },
    inventory: collect,
  });
  return { api, collect, engine, writes, cache: () => cache };
}
describe('durable synchronization', () => {
  it('persists an outbox result before sending it', async () => {
    const lab = setup({
      result: vi.fn(async (_session, id, result) => {
        expect(lab.cache().outbox[0].commandId).toBe(id);
        return command({ id, status: result.status });
      }),
    });
    await lab.engine.sync();
    expect(lab.cache().lastMessage).toBe('Test reminder');
    expect(lab.cache().outbox).toHaveLength(0);
    expect(lab.cache().snapshot?.commands[0].status).toBe('acknowledged');
  });
  it('keeps a result after a failed acknowledgement and retries it first', async () => {
    const result = vi
      .fn()
      .mockRejectedValueOnce(new Error('Network lost'))
      .mockImplementation(async (_session, id, data) => command({ id, status: data.status }));
    const lab = setup({ result });
    await expect(lab.engine.sync()).rejects.toThrow('Network lost');
    expect(lab.cache().outbox).toHaveLength(1);
    await lab.engine.sync();
    expect(lab.cache().outbox).toHaveLength(0);
    expect(result).toHaveBeenCalledTimes(2);
  });
  it('does not apply an already processed command again', async () => {
    const lab = setup(
      {},
      { ...emptyCache(), processed: [command().id], lastMessage: 'Existing message' },
    );
    await lab.engine.sync();
    expect(lab.cache().lastMessage).toBe('Existing message');
    expect(lab.api.result).not.toHaveBeenCalled();
  });
  it('coalesces overlapping sync calls', async () => {
    const lab = setup();
    const first = lab.engine.sync();
    expect(lab.engine.sync()).toBe(first);
    await first;
    expect(lab.api.checkIn).toHaveBeenCalledTimes(1);
  });
  it('preserves cached data when offline', async () => {
    const saved = { ...emptyCache(), snapshot: snapshot(), syncedAt: new Date().toISOString() };
    const lab = setup(
      {
        checkIn: async () => {
          throw new Error('Offline');
        },
      },
      saved,
    );
    await expect(lab.engine.sync()).rejects.toThrow('Offline');
    expect(lab.cache()).toBe(saved);
  });
  it('does not execute expired commands', async () => {
    const lab = setup({
      checkIn: async () =>
        snapshot([command({ expiresAt: new Date(Date.now() - 1).toISOString() })]),
    });
    await lab.engine.sync();
    expect(lab.api.result).not.toHaveBeenCalled();
  });
  it('stops before making requests if already cancelled', async () => {
    const lab = setup();
    const abort = new AbortController();
    abort.abort();
    await expect(lab.engine.sync(abort.signal)).rejects.toThrow('paused');
    expect(lab.api.checkIn).not.toHaveBeenCalled();
  });
  it('never discards an outbox item on an authentication failure', async () => {
    const lab = setup(
      {
        result: async () => {
          throw new ApiError(401, 'Revoked');
        },
      },
      {
        ...emptyCache(),
        outbox: [{ commandId: command().id, result: { status: 'acknowledged' } }],
      },
    );
    await expect(lab.engine.sync()).rejects.toThrow('Revoked');
    expect(lab.cache().outbox).toHaveLength(1);
  });
  it('drops an expired acknowledgement instead of retrying forever', async () => {
    const lab = setup(
      {
        result: async () => {
          throw new ApiError(409, 'Expired');
        },
        checkIn: async () => snapshot(),
      },
      {
        ...emptyCache(),
        outbox: [{ commandId: command().id, result: { status: 'acknowledged' } }],
      },
    );
    await lab.engine.sync();
    expect(lab.cache().outbox).toHaveLength(0);
  });
  it('re-collects inventory for an inventory command', async () => {
    const lab = setup({
      checkIn: async () => snapshot([command({ type: 'refresh_inventory', message: undefined })]),
    });
    await lab.engine.sync();
    expect(lab.collect).toHaveBeenCalledTimes(2);
    expect(lab.api.result).toHaveBeenCalledWith(
      session,
      command().id,
      { status: 'acknowledged', inventory },
      undefined,
    );
  });
  it('does not transmit a result when durable storage fails', async () => {
    const api: DeviceApi = { checkIn: async () => snapshot([command()]), result: vi.fn() };
    const engine = new SyncEngine({
      session,
      api,
      inventory: async () => inventory,
      load: emptyCache,
      save: async () => {
        throw new Error('Storage full');
      },
    });
    await expect(engine.sync()).rejects.toThrow('Storage full');
    expect(api.result).not.toHaveBeenCalled();
  });
});
