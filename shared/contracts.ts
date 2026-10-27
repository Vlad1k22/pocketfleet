import { z } from 'zod';

export const InventorySchema = z
  .object({
    platform: z.enum(['android', 'ios', 'web']),
    model: z.string().min(1).max(100),
    osVersion: z.string().min(1).max(50),
    appVersion: z.string().min(1).max(30),
    isPhysicalDevice: z.boolean(),
    collectedAt: z.string().datetime(),
  })
  .strict();
export type Inventory = z.infer<typeof InventorySchema>;

export const PolicySchema = z
  .object({
    revision: z.number().int().positive(),
    name: z.string().min(1).max(80),
    minimumAndroidMajor: z.number().int().min(7).max(50),
    minimumIosMajor: z.number().int().min(12).max(50),
    requirePhysicalDevice: z.boolean(),
    syncIntervalSeconds: z.number().int().min(15).max(300),
  })
  .strict();
export type Policy = z.infer<typeof PolicySchema>;
export const defaultPolicy: Policy = {
  revision: 1,
  name: 'Personal lab',
  minimumAndroidMajor: 12,
  minimumIosMajor: 16,
  requirePhysicalDevice: false,
  syncIntervalSeconds: 30,
};

export const CommandRequestSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('refresh_inventory'),
      ttlSeconds: z.number().int().min(30).max(3600).default(300),
    })
    .strict(),
  z
    .object({
      type: z.literal('show_message'),
      message: z.string().trim().min(1).max(240),
      ttlSeconds: z.number().int().min(30).max(3600).default(300),
    })
    .strict(),
]);
export type CommandRequest = z.infer<typeof CommandRequestSchema>;
export const CommandSchema = z.object({
  id: z.string().uuid(),
  deviceId: z.string().uuid(),
  type: z.enum(['refresh_inventory', 'show_message']),
  message: z.string().max(240).optional(),
  status: z.enum(['queued', 'delivered', 'acknowledged', 'failed', 'expired']),
  createdAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  deliveredAt: z.string().datetime().nullable(),
  completedAt: z.string().datetime().nullable(),
});
export type Command = z.infer<typeof CommandSchema>;
export const ResultSchema = z
  .object({
    status: z.enum(['acknowledged', 'failed']),
    inventory: InventorySchema.optional(),
  })
  .strict();
export type CommandResult = z.infer<typeof ResultSchema>;
export const DeviceSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(60),
  inventory: InventorySchema,
  lastSeen: z.string().datetime(),
});
export type ManagedDevice = z.infer<typeof DeviceSchema>;
export const SnapshotSchema = z.object({
  device: DeviceSchema,
  policy: PolicySchema,
  commands: z.array(CommandSchema),
});
export type Snapshot = z.infer<typeof SnapshotSchema>;
export const EnrollmentSchema = z
  .object({
    code: z.string().regex(/^[A-Fa-f0-9]{8}$/),
    name: z.string().trim().min(1).max(60),
    inventory: InventorySchema,
  })
  .strict();
export const SessionSchema = z
  .object({
    url: z.string().url(),
    deviceId: z.string().uuid(),
    token: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
export type Session = z.infer<typeof SessionSchema>;
export const EnrollmentResponseSchema = z.object({
  session: z.object({ deviceId: z.string().uuid(), token: z.string() }),
  snapshot: SnapshotSchema,
});

export type Rule = {
  id: string;
  title: string;
  detail: string;
  status: 'pass' | 'fail' | 'unknown';
};
export function assessPolicy(inventory: Inventory, policy: Policy): Rule[] {
  const major = /^(\d+)(?:\.|$)/.exec(inventory.osVersion)?.[1];
  const isMobile = inventory.platform !== 'web';
  const minimum =
    inventory.platform === 'android' ? policy.minimumAndroidMajor : policy.minimumIosMajor;
  return [
    {
      id: 'os',
      title: 'Operating system',
      detail: isMobile
        ? `${inventory.platform === 'ios' ? 'iOS' : 'Android'} ${minimum}+ required; reported ${inventory.osVersion}`
        : 'Browser preview cannot assess a mobile OS',
      status: !isMobile || !major ? 'unknown' : Number(major) >= minimum ? 'pass' : 'fail',
    },
    {
      id: 'physical',
      title: 'Physical device',
      detail: policy.requirePhysicalDevice
        ? 'A physical phone is required by this policy'
        : 'Simulators and physical phones are accepted',
      status: !isMobile
        ? 'unknown'
        : !policy.requirePhysicalDevice || inventory.isPhysicalDevice
          ? 'pass'
          : 'fail',
    },
  ];
}

export function validateServerUrl(input: string): string {
  const url = new URL(input.trim());
  if (url.username || url.password || url.search || url.hash || !['', '/'].includes(url.pathname))
    throw new Error('Use a server origin without a path or credentials.');
  const host = url.hostname;
  const privateV4 =
    /^(?:127|10)\.\d+\.\d+\.\d+$/.test(host) ||
    /^192\.168\.\d+\.\d+$/.test(host) ||
    /^172\.(?:1[6-9]|2\d|3[01])\.\d+\.\d+$/.test(host);
  const local = host === 'localhost' || host === '[::1]' || privateV4;
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local))
    throw new Error('HTTPS is required outside a private development network.');
  return url.origin;
}
