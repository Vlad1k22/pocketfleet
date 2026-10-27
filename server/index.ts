import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { networkInterfaces } from 'node:os';
import { Store } from './store';
import { buildApp } from './app';

async function main() {
  const local = resolve('.local');
  mkdirSync(local, { recursive: true });
  const keyFile = resolve(local, 'admin.key');
  if (!existsSync(keyFile))
    writeFileSync(keyFile, randomBytes(32).toString('hex'), { mode: 0o600 });
  const token = process.env.POCKETFLEET_ADMIN_TOKEN || readFileSync(keyFile, 'utf8').trim();
  const store = new Store(process.env.POCKETFLEET_DB || resolve(local, 'fleet.sqlite'));
  const app = await buildApp(store, token);
  const host = process.env.POCKETFLEET_HOST || '127.0.0.1';
  const port = Number(process.env.POCKETFLEET_PORT || 4347);
  await app.listen({ host, port });
  console.log(`PocketFleet API: http://${host}:${port}`);
  if (host === '0.0.0.0') {
    for (const addresses of Object.values(networkInterfaces()))
      for (const address of addresses ?? [])
        if (address.family === 'IPv4' && !address.internal)
          console.log(`Phone URL: http://${address.address}:${port}`);
    console.log('LAN development mode: trusted Wi-Fi only. Use HTTPS outside the lab.');
  }
  console.log('Create a 10-minute code: npm run admin -- code');
  const stop = async () => {
    await app.close();
    store.close();
    process.exit(0);
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Server failed.');
  process.exitCode = 1;
});
