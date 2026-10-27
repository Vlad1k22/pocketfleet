import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

async function main() {
  const [action, id, ...args] = process.argv.slice(2);
  const token =
    process.env.POCKETFLEET_ADMIN_TOKEN || readFileSync(resolve('.local/admin.key'), 'utf8').trim();
  const url = process.env.POCKETFLEET_API || 'http://127.0.0.1:4347';
  const request = async (path: string, method = 'GET', body?: unknown) => {
    const response = await fetch(`${url}/v1/admin${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(JSON.stringify(data));
    return data;
  };
  let result: unknown;
  switch (action) {
    case 'code':
      result = await request('/codes', 'POST');
      break;
    case 'devices':
      result = await request('/devices');
      break;
    case 'commands':
      if (!id) throw new Error('A device ID is required.');
      result = await request(`/devices/${encodeURIComponent(id)}/commands`);
      break;
    case 'inventory':
      if (!id) throw new Error('A device ID is required.');
      result = await request(`/devices/${encodeURIComponent(id)}/commands`, 'POST', {
        type: 'refresh_inventory',
      });
      break;
    case 'message':
      if (!id || !args.length) throw new Error('Usage: message DEVICE_ID "Message text"');
      result = await request(`/devices/${encodeURIComponent(id)}/commands`, 'POST', {
        type: 'show_message',
        message: args.join(' '),
      });
      break;
    case 'revoke':
      if (!id) throw new Error('A device ID is required.');
      result = await request(`/devices/${encodeURIComponent(id)}`, 'DELETE');
      break;
    case 'policy': {
      const policy = await request('/policy');
      if (!id) result = policy;
      else {
        if (!['android', 'ios'].includes(id) || !/^\d+$/.test(args[0] ?? ''))
          throw new Error('Usage: policy android|ios MINIMUM_MAJOR_VERSION');
        delete policy.revision;
        policy[id === 'android' ? 'minimumAndroidMajor' : 'minimumIosMajor'] = Number(args[0]);
        result = await request('/policy', 'PUT', policy);
      }
      break;
    }
    default:
      throw new Error(
        'Commands: code | devices | commands ID | inventory ID | message ID TEXT | policy [android|ios VERSION] | revoke ID',
      );
  }
  console.log(JSON.stringify(result, null, 2));
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Administrator command failed.');
  process.exitCode = 1;
});
