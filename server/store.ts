import { DatabaseSync } from 'node:sqlite';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import {
  defaultPolicy,
  type Command,
  type CommandRequest,
  type CommandResult,
  type Inventory,
  type ManagedDevice,
  type Policy,
} from '../shared/contracts';

export const hash = (value: string) => createHash('sha256').update(value).digest('hex');
export class DomainError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
type Row = Record<string, string | number | null>;

export class Store {
  readonly db: DatabaseSync;
  constructor(
    path = ':memory:',
    private readonly clock = () => Date.now(),
  ) {
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;
      CREATE TABLE IF NOT EXISTS enrollment (hash TEXT PRIMARY KEY, expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS devices (id TEXT PRIMARY KEY, name TEXT NOT NULL, token_hash TEXT UNIQUE NOT NULL, inventory TEXT NOT NULL, last_seen TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS commands (id TEXT PRIMARY KEY, device_id TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE, data TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS commands_device ON commands(device_id);
      CREATE TABLE IF NOT EXISTS policy (id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL);`);
    this.db.prepare('INSERT OR IGNORE INTO policy VALUES (1,?)').run(JSON.stringify(defaultPolicy));
  }
  now() {
    return new Date(this.clock()).toISOString();
  }
  close() {
    this.db.close();
  }
  policy(): Policy {
    return JSON.parse(
      (this.db.prepare('SELECT data FROM policy WHERE id=1').get() as Row).data as string,
    );
  }
  setPolicy(value: Omit<Policy, 'revision'>) {
    const policy = { ...value, revision: this.policy().revision + 1 };
    this.db.prepare('UPDATE policy SET data=? WHERE id=1').run(JSON.stringify(policy));
    return policy;
  }
  code() {
    this.db.prepare('DELETE FROM enrollment WHERE expires<=?').run(this.clock());
    const code = randomBytes(4).toString('hex').toUpperCase();
    const expiresAt = this.clock() + 10 * 60_000;
    this.db.prepare('INSERT INTO enrollment VALUES (?,?)').run(hash(code), expiresAt);
    return { code, expiresAt: new Date(expiresAt).toISOString() };
  }
  enroll(code: string, name: string, inventory: Inventory) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const entry = this.db
        .prepare('SELECT expires FROM enrollment WHERE hash=?')
        .get(hash(code.toUpperCase())) as Row | undefined;
      if (!entry || Number(entry.expires) <= this.clock())
        throw new DomainError(400, 'Invalid or expired enrollment code.');
      const id = randomUUID(),
        token = randomBytes(32).toString('hex');
      this.db
        .prepare('INSERT INTO devices VALUES (?,?,?,?,?)')
        .run(id, name, hash(token), JSON.stringify(inventory), this.now());
      this.db.prepare('DELETE FROM enrollment WHERE hash=?').run(hash(code.toUpperCase()));
      this.db.exec('COMMIT');
      return { session: { deviceId: id, token }, snapshot: this.snapshot(id) };
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
  authenticate(token: string) {
    return (
      this.db.prepare('SELECT id FROM devices WHERE token_hash=?').get(hash(token)) as
        Row | undefined
    )?.id as string | undefined;
  }
  device(id: string): ManagedDevice {
    const row = this.db
      .prepare('SELECT id,name,inventory,last_seen FROM devices WHERE id=?')
      .get(id) as Row | undefined;
    if (!row) throw new DomainError(404, 'Device not found.');
    return {
      id: row.id as string,
      name: row.name as string,
      inventory: JSON.parse(row.inventory as string),
      lastSeen: row.last_seen as string,
    };
  }
  devices() {
    return (this.db.prepare('SELECT id FROM devices ORDER BY last_seen DESC').all() as Row[]).map(
      (row) => this.device(row.id as string),
    );
  }
  revoke(id: string) {
    this.device(id);
    this.db.prepare('DELETE FROM devices WHERE id=?').run(id);
  }
  commands(id: string): Command[] {
    this.device(id);
    const rows = this.db
      .prepare(
        "SELECT data FROM commands WHERE device_id=? ORDER BY (json_extract(data,'$.status') IN ('queued','delivered')) DESC, rowid DESC LIMIT 120",
      )
      .all(id) as Row[];
    return rows.map((row) => {
      const command: Command = JSON.parse(row.data as string);
      if (
        ['queued', 'delivered'].includes(command.status) &&
        Date.parse(command.expiresAt) <= this.clock()
      ) {
        command.status = 'expired';
        command.completedAt = this.now();
        this.save(command);
      }
      return command;
    });
  }
  private save(command: Command) {
    this.db
      .prepare('UPDATE commands SET data=? WHERE id=?')
      .run(JSON.stringify(command), command.id);
  }
  enqueue(id: string, input: CommandRequest) {
    this.device(id);
    if (
      this.commands(id).filter((command) => ['queued', 'delivered'].includes(command.status))
        .length >= 20
    )
      throw new DomainError(409, 'Device queue is full.');
    const command: Command = {
      id: randomUUID(),
      deviceId: id,
      type: input.type,
      ...('message' in input ? { message: input.message } : {}),
      status: 'queued',
      createdAt: this.now(),
      expiresAt: new Date(this.clock() + input.ttlSeconds * 1000).toISOString(),
      deliveredAt: null,
      completedAt: null,
    };
    this.db
      .prepare('INSERT INTO commands VALUES (?,?,?)')
      .run(command.id, id, JSON.stringify(command));
    return command;
  }
  snapshot(id: string) {
    return { device: this.device(id), policy: this.policy(), commands: this.commands(id) };
  }
  checkIn(id: string, inventory: Inventory) {
    this.db
      .prepare('UPDATE devices SET inventory=?,last_seen=? WHERE id=?')
      .run(JSON.stringify(inventory), this.now(), id);
    for (const command of this.commands(id)) {
      if (command.status === 'queued') {
        command.status = 'delivered';
        command.deliveredAt = this.now();
        this.save(command);
      }
    }
    return this.snapshot(id);
  }
  complete(id: string, commandId: string, result: CommandResult) {
    const row = this.db
      .prepare('SELECT data FROM commands WHERE id=? AND device_id=?')
      .get(commandId, id) as Row | undefined;
    if (!row) throw new DomainError(404, 'Command not found.');
    const command: Command = JSON.parse(row.data as string);
    if (['acknowledged', 'failed'].includes(command.status)) {
      if (result.status !== command.status)
        throw new DomainError(409, 'A terminal result cannot be changed.');
      return command;
    }
    if (Date.parse(command.expiresAt) <= this.clock())
      throw new DomainError(409, 'Command expired.');
    if (command.status !== 'delivered')
      throw new DomainError(409, 'Command must be delivered before a result is accepted.');
    this.db.exec('BEGIN IMMEDIATE');
    try {
      command.status = result.status;
      command.completedAt = this.now();
      this.save(command);
      if (result.inventory && result.status === 'acknowledged')
        this.db
          .prepare('UPDATE devices SET inventory=?,last_seen=? WHERE id=?')
          .run(JSON.stringify(result.inventory), this.now(), id);
      this.db.exec('COMMIT');
      return command;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
}
