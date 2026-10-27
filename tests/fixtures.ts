import {
  defaultPolicy,
  type Command,
  type Inventory,
  type Session,
  type Snapshot,
} from '../shared/contracts';
export const inventory: Inventory = {
  platform: 'android',
  model: 'Test phone',
  osVersion: '15',
  appVersion: '1.0.0',
  isPhysicalDevice: true,
  collectedAt: new Date().toISOString(),
};
export const session: Session = {
  url: 'http://localhost:4347',
  deviceId: '00000000-0000-4000-8000-000000000001',
  token: 'a'.repeat(64),
};
export function command(changes: Partial<Command> = {}): Command {
  return {
    id: '00000000-0000-4000-8000-000000000002',
    deviceId: session.deviceId,
    type: 'show_message',
    message: 'Test reminder',
    status: 'delivered',
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 300000).toISOString(),
    deliveredAt: new Date().toISOString(),
    completedAt: null,
    ...changes,
  };
}
export function snapshot(commands: Command[] = []): Snapshot {
  return {
    device: {
      id: session.deviceId,
      name: 'Test phone',
      inventory,
      lastSeen: new Date().toISOString(),
    },
    policy: defaultPolicy,
    commands,
  };
}
