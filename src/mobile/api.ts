import {
  CommandSchema,
  EnrollmentResponseSchema,
  SnapshotSchema,
  type CommandResult,
  type Inventory,
  type Session,
} from '../../shared/contracts';
import { ApiError, type DeviceApi } from '../core/sync';

export async function request(
  session: Pick<Session, 'url'> & Partial<Pick<Session, 'token'>>,
  path: string,
  body?: unknown,
  signal?: AbortSignal,
  method = 'POST',
): Promise<unknown> {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  signal?.addEventListener('abort', cancel, { once: true });
  if (signal?.aborted) controller.abort();
  const timeout = setTimeout(cancel, 10_000);
  try {
    const response = await fetch(session.url + path, {
      method,
      headers: {
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(session.token ? { Authorization: `Bearer ${session.token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    const data = await response.json();
    if (!response.ok)
      throw new ApiError(
        response.status,
        typeof data.error === 'string' ? data.error : 'Request failed.',
      );
    return data;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', cancel);
  }
}
export const deviceApi: DeviceApi = {
  async checkIn(session, inventory, signal) {
    return SnapshotSchema.parse(await request(session, '/v1/device/check-in', inventory, signal));
  },
  async result(session, id, result: CommandResult, signal) {
    return CommandSchema.parse(
      await request(session, `/v1/device/commands/${id}/result`, result, signal),
    );
  },
};
export async function enroll(url: string, name: string, code: string, inventory: Inventory) {
  return EnrollmentResponseSchema.parse(
    await request({ url }, '/v1/enroll', { name, code, inventory }),
  );
}
