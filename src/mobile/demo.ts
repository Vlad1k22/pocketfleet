import { defaultPolicy, type Command, type Session, type Snapshot } from '../../shared/contracts';
import type { DeviceApi } from '../core/sync';
const copy = (value: Snapshot): Snapshot => JSON.parse(JSON.stringify(value));

export const demoSession: Session = {
  url: 'https://demo.invalid',
  deviceId: '00000000-0000-4000-8000-000000000001',
  token: '0'.repeat(64),
};
export function makeDemoSnapshot(): Snapshot {
  const now = new Date().toISOString();
  return {
    device: {
      id: demoSession.deviceId,
      name: 'Studio phone',
      lastSeen: now,
      inventory: {
        platform: 'android',
        model: 'Sample Pixel 8',
        osVersion: '15',
        appVersion: '1.0.0',
        isPhysicalDevice: true,
        collectedAt: now,
      },
    },
    policy: { ...defaultPolicy, name: 'Studio baseline' },
    commands: [],
  };
}
export function makeDemoApi(snapshot: Snapshot, offline: () => boolean) {
  let counter = 0;
  const ensureOnline = () => {
    if (offline()) throw new Error('Demo network is offline. Cached data is available.');
  };
  const api: DeviceApi = {
    async checkIn() {
      ensureOnline();
      snapshot = {
        ...snapshot,
        device: { ...snapshot.device, lastSeen: new Date().toISOString() },
        commands: snapshot.commands.map((command) =>
          command.status === 'queued'
            ? { ...command, status: 'delivered', deliveredAt: new Date().toISOString() }
            : command,
        ),
      };
      return copy(snapshot);
    },
    async result(_session, id, result) {
      ensureOnline();
      const command = snapshot.commands.find((item) => item.id === id);
      if (!command) throw new Error('Unknown demo command.');
      command.status = result.status;
      command.completedAt = new Date().toISOString();
      return { ...command };
    },
  };
  return {
    api,
    queue(type: Command['type']) {
      counter++;
      const command: Command = {
        id: `00000000-0000-4000-8000-${String(counter + 10).padStart(12, '0')}`,
        deviceId: demoSession.deviceId,
        type,
        ...(type === 'show_message'
          ? { message: 'Lab reminder: your device check-in is up to date.' }
          : {}),
        status: 'queued',
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 300_000).toISOString(),
        deliveredAt: null,
        completedAt: null,
      };
      snapshot.commands = [command, ...snapshot.commands].slice(0, 100);
      return copy(snapshot);
    },
  };
}
