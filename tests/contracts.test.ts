import { describe, expect, it } from 'vitest';
import {
  assessPolicy,
  CommandRequestSchema,
  defaultPolicy,
  InventorySchema,
  validateServerUrl,
} from '../shared/contracts';
import { inventory } from './fixtures';

describe('policy assessment', () => {
  it('accepts the boundary version', () =>
    expect(assessPolicy({ ...inventory, osVersion: '12' }, defaultPolicy)[0].status).toBe('pass'));
  it('flags an older OS', () =>
    expect(assessPolicy({ ...inventory, osVersion: '11.9' }, defaultPolicy)[0].status).toBe(
      'fail',
    ));
  it('uses a separate iOS threshold', () =>
    expect(
      assessPolicy({ ...inventory, platform: 'ios', osVersion: '15.8' }, defaultPolicy)[0].status,
    ).toBe('fail'));
  it('never treats missing OS information as compliance', () =>
    expect(assessPolicy({ ...inventory, osVersion: 'unknown' }, defaultPolicy)[0].status).toBe(
      'unknown',
    ));
  it('does not attest a browser as a phone', () =>
    expect(
      assessPolicy({ ...inventory, platform: 'web' }, defaultPolicy).every(
        (rule) => rule.status === 'unknown',
      ),
    ).toBe(true));
  it('detects a simulator when a phone is required', () =>
    expect(
      assessPolicy(
        { ...inventory, isPhysicalDevice: false },
        { ...defaultPolicy, requirePhysicalDevice: true },
      )[1].status,
    ).toBe('fail'));
});
describe('input boundaries', () => {
  it.each([
    'http://localhost:4347',
    'http://10.0.2.2:4347',
    'http://192.168.1.2:4347',
    'https://lab.example',
  ])('accepts %s', (value) => expect(validateServerUrl(value)).toBe(value));
  it.each([
    'http://public.example',
    'ftp://localhost',
    'https://user:secret@example.com',
    'https://example.com/path',
    'https://example.com?token=secret',
    'http://192.168.1.2.evil.example',
  ])('rejects %s', (value) => expect(() => validateServerUrl(value)).toThrow());
  it('rejects surplus inventory fields', () =>
    expect(InventorySchema.safeParse({ ...inventory, imei: 'not-collected' }).success).toBe(false));
  it('rejects destructive command types', () =>
    expect(CommandRequestSchema.safeParse({ type: 'wipe' }).success).toBe(false));
  it('rejects blank or oversized reminders', () => {
    expect(CommandRequestSchema.safeParse({ type: 'show_message', message: ' ' }).success).toBe(
      false,
    );
    expect(
      CommandRequestSchema.safeParse({ type: 'show_message', message: 'x'.repeat(241) }).success,
    ).toBe(false);
  });
});
