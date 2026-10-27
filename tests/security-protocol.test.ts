import { describe, expect, it, vi } from 'vitest';
import { defaultPolicy } from '../shared/contracts';
import { ApiError, emptyCache, SyncEngine, type Cache, type DeviceApi } from '../src/core/sync';
import { command, inventory, session, snapshot } from './fixtures';

function lab(api: Partial<DeviceApi>, initial: Cache = emptyCache()) {
  let cache = initial;
  const result = vi.fn<DeviceApi['result']>(async (_session, id, value) =>
    command({ id, status: value.status }),
  );
  const engine = new SyncEngine({
    session,
    inventory: async () => inventory,
    load: () => cache,
    save: async (value) => {
      cache = value;
    },
    api: { checkIn: async () => snapshot([command()]), result, ...api },
  });
  return { engine, result, cache: () => cache };
}

describe('fail-closed UEM protocol validation', () => {
  const other = '00000000-0000-4000-8000-000000000003';
  it('rejects a snapshot for another enrolled device before persisting or executing it', async () => {
    const foreign = snapshot([command()]);
    foreign.device.id = other;
    const test = lab({ checkIn: async () => foreign });
    await expect(test.engine.sync()).rejects.toThrow('identity');
    expect(test.cache().snapshot).toBeNull();
    expect(test.cache().lastMessage).toBeNull();
    expect(test.result).not.toHaveBeenCalled();
  });
  it('rejects a foreign command mixed into an otherwise valid snapshot', async () => {
    const test = lab({ checkIn: async () => snapshot([command({ deviceId: other })]) });
    await expect(test.engine.sync()).rejects.toThrow('identity');
    expect(test.cache().lastMessage).toBeNull();
    expect(test.result).not.toHaveBeenCalled();
  });
  it('rejects duplicated command identities rather than executing ambiguous work', async () => {
    const test = lab({
      checkIn: async () => snapshot([command(), command({ message: 'Conflicting payload' })]),
    });
    await expect(test.engine.sync()).rejects.toThrow('Duplicate');
    expect(test.result).not.toHaveBeenCalled();
  });
  it('does not overwrite a newer cached policy with an older revision', async () => {
    const saved = {
      ...emptyCache(),
      snapshot: { ...snapshot(), policy: { ...defaultPolicy, revision: 3 } },
    };
    const test = lab({ checkIn: async () => snapshot() }, saved);
    await expect(test.engine.sync()).rejects.toThrow('revision');
    expect(test.cache()).toBe(saved);
  });
  it('rejects changed policy content under an unchanged revision', async () => {
    const saved = { ...emptyCache(), snapshot: snapshot() };
    const changed = snapshot();
    changed.policy = { ...changed.policy, minimumAndroidMajor: 7 };
    const test = lab({ checkIn: async () => changed }, saved);
    await expect(test.engine.sync()).rejects.toThrow('revision');
    expect(test.cache()).toBe(saved);
  });
  it('accepts a legitimate new policy revision', async () => {
    const newer = snapshot();
    newer.policy = { ...newer.policy, revision: 2, minimumAndroidMajor: 14 };
    const test = lab({ checkIn: async () => newer }, { ...emptyCache(), snapshot: snapshot() });
    await test.engine.sync();
    expect(test.cache().snapshot?.policy).toEqual(newer.policy);
  });
  it.each(['id', 'deviceId', 'status'] as const)(
    'retains the outbox if the result response has an inconsistent %s',
    async (field) => {
      const pending = { commandId: command().id, result: { status: 'acknowledged' as const } };
      const response = command({
        status: 'acknowledged',
        [field]: field === 'status' ? 'failed' : other,
      });
      const test = lab({ result: async () => response }, { ...emptyCache(), outbox: [pending] });
      await expect(test.engine.sync()).rejects.toThrow('acknowledgement');
      expect(test.cache().outbox).toEqual([pending]);
    },
  );
  it('keeps a retryable result when the server rejects access after revocation', async () => {
    const test = lab(
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
    await expect(test.engine.sync()).rejects.toThrow('Revoked');
    expect(test.cache().outbox).toHaveLength(1);
  });
});
