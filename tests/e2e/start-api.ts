import { randomUUID } from 'node:crypto';
import { unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildApp } from '../../server/app';
import { Store } from '../../server/store';
import { testAdmin } from './lab';

async function start() {
  const path = join(tmpdir(), `pocketfleet-browser-${randomUUID()}.sqlite`);
  const store = new Store(path);
  const app = await buildApp(store, testAdmin);
  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    await app.close();
    store.close();
    for (const file of [path, `${path}-wal`, `${path}-shm`]) {
      try {
        unlinkSync(file);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
    }
  };
  process.once('SIGTERM', () => void stop());
  process.once('SIGINT', () => void stop());
  await app.listen({ host: '127.0.0.1', port: 4349 });
}
void start().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
