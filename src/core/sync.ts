import type { Command, CommandResult, Inventory, Session, Snapshot } from '../../shared/contracts';

export type OutboxItem = { commandId: string; result: CommandResult };
export type Cache = {
  snapshot: Snapshot | null;
  processed: string[];
  outbox: OutboxItem[];
  lastMessage: string | null;
  syncedAt: string | null;
};
export const emptyCache = (): Cache => ({
  snapshot: null,
  processed: [],
  outbox: [],
  lastMessage: null,
  syncedAt: null,
});
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export interface DeviceApi {
  checkIn(session: Session, inventory: Inventory, signal?: AbortSignal): Promise<Snapshot>;
  result(
    session: Session,
    id: string,
    result: CommandResult,
    signal?: AbortSignal,
  ): Promise<Command>;
}
type Options = {
  session: Session;
  load: () => Cache;
  save: (cache: Cache) => Promise<void>;
  api: DeviceApi;
  inventory: () => Promise<Inventory>;
};

export class SyncEngine {
  private running: Promise<void> | null = null;
  constructor(private options: Options) {}
  sync(signal?: AbortSignal): Promise<void> {
    if (this.running) return this.running;
    this.running = this.run(signal).finally(() => {
      this.running = null;
    });
    return this.running;
  }
  private async run(signal?: AbortSignal) {
    const { session, api, save, inventory } = this.options;
    let cache = this.options.load();
    const assertActive = () => {
      if (signal?.aborted) throw new Error('Sync paused.');
    };
    const persist = async () => {
      assertActive();
      await save(cache);
    };
    const flush = async () => {
      while (cache.outbox.length) {
        assertActive();
        const pending = cache.outbox[0];
        try {
          const command = await api.result(session, pending.commandId, pending.result, signal);
          if (
            command.id !== pending.commandId ||
            command.deviceId !== session.deviceId ||
            command.status !== pending.result.status
          )
            throw new ApiError(502, 'Inconsistent command acknowledgement.');
          if (cache.snapshot)
            cache = {
              ...cache,
              snapshot: {
                ...cache.snapshot,
                commands: cache.snapshot.commands.map((item) =>
                  item.id === command.id ? command : item,
                ),
              },
            };
        } catch (error) {
          // Missing/expired commands cannot become valid by retrying. Keep all
          // network and auth failures in the outbox until the caller recovers.
          if (!(error instanceof ApiError) || ![404, 409].includes(error.status)) throw error;
        }
        cache = { ...cache, outbox: cache.outbox.slice(1) };
        await persist();
      }
    };
    await flush();
    assertActive();
    const collected = await inventory();
    const snapshot = await api.checkIn(session, collected, signal);
    if (
      snapshot.device.id !== session.deviceId ||
      snapshot.commands.some((command) => command.deviceId !== session.deviceId)
    )
      throw new ApiError(502, 'Snapshot device identity does not match the session.');
    if (new Set(snapshot.commands.map((command) => command.id)).size !== snapshot.commands.length)
      throw new ApiError(502, 'Duplicate command identity in snapshot.');
    const previous = cache.snapshot?.policy;
    if (previous) {
      const incoming = snapshot.policy;
      const unchanged = (Object.keys(previous) as (keyof typeof previous)[]).every(
        (key) => incoming[key] === previous[key],
      );
      if (
        incoming.revision < previous.revision ||
        (incoming.revision === previous.revision && !unchanged)
      )
        throw new ApiError(502, 'Policy revision must increase when its content changes.');
    }
    cache = { ...cache, snapshot };
    await persist();
    for (const command of snapshot.commands) {
      assertActive();
      if (command.status !== 'delivered' || cache.processed.includes(command.id)) continue;
      let result: CommandResult;
      if (Date.parse(command.expiresAt) <= Date.now()) continue;
      try {
        if (command.type === 'refresh_inventory')
          result = { status: 'acknowledged', inventory: await inventory() };
        else {
          cache = { ...cache, lastMessage: command.message ?? '' };
          result = { status: 'acknowledged' };
        }
      } catch {
        result = { status: 'failed' };
      }
      cache = {
        ...cache,
        processed: [...cache.processed.slice(-199), command.id],
        outbox: [...cache.outbox, { commandId: command.id, result }],
      };
      // Persist the result BEFORE transmitting it. A lost response is retried
      // without reapplying the app-level action. No destructive OS actions exist.
      await persist();
      await flush();
    }
    cache = { ...cache, syncedAt: new Date().toISOString() };
    await persist();
  }
}
