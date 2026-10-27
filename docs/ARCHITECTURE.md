# Architecture and trade-offs

```text
Administrator CLI -- admin bearer --> Fastify API -- prepared SQL --> SQLite
                                         ^
                                         | device-scoped bearer
                                         |
React Native UI <-- FleetProvider <-- SyncEngine <-- fetch adapter
                         |                |
                         |                +-- durable result outbox
                         +-- SecureStore: session
                         +-- AsyncStorage: non-secret cache
```

## Trust boundaries

The administrator credential never crosses into the mobile bundle. A one-time code returns a separate random 256-bit device token. The database stores only its SHA-256 hash. Each authenticated device route derives its owner from the token, not a caller-selected device ID. No user-provided HTML is rendered.

For browser writes, an exact Origin allowlist is enforced before handlers; explicit bearer authentication remains mandatory on protected routes even without Origin. JSON responses are non-cacheable and carry nosniff/CSP headers. That API CSP is not the web document's CSP. Stored reminder text reaches React Native Text without an HTML interpretation step; Playwright covers this path in desktop and mobile Chromium.

Inventory is **self-reported** and can be forged by an untrusted client. Passing a baseline check is not proof of device integrity. This design deliberately avoids claims about hardware attestation, MDM enrollment or OS policy enforcement.

## Command delivery

```text
queued --> delivered --> acknowledged
              |-------> failed
queued/delivered ------> expired
```

Check-in is a POST because it updates inventory and advances delivery state. A command remains eligible for redelivery until its terminal result is stored. Duplicate identical result states preserve the first completion timestamp; changing a terminal state is rejected. Ownership checks also apply to result submission.

The client records processed IDs and an outbox result before transmitting the acknowledgement. If the network fails, it flushes that outbox before requesting more work. Only permanent 404/409 results are discarded; network and authorization failures retain pending results.

Before saving a new snapshot or applying its commands, the client verifies the session's device identity, command ownership, unique command IDs and monotonic policy revision. A policy with changed fields must use a new revision. Result responses must match the pending ID, owner and status before the outbox entry is removed. A conflicting response retains the pending result and stops synchronization. These checks detect inconsistent protocol data; they do not authenticate a malicious server or prevent rollback of the whole local cache.

The recovery integration test commits a real HTTP-handler result into a disk SQLite database, deliberately loses its response, reopens the database and reloads a serialized client cache into a new engine. Retrying preserves the first completion timestamp and does not execute the command again in this failure window. This exercises fresh instances and disk persistence, not an actual killed phone process or native AsyncStorage crash behavior.

This is **at-least-once delivery**, not distributed exactly-once execution. A crash between an app-level action and its durable save can repeat that action. The two supported operations are deliberately safe to repeat. The processed-ID cache is bounded to 200; deadlines and the bounded pending queue limit replay exposure. Do not reuse this implementation for money transfers or destructive actions.

## Lifecycle

Polling runs only while the app is active. `AppState` cancels outstanding fetches on backgrounding; foregrounding requests another check-in. The client uses a single-flight synchronizer, request timeouts and session-generation guards. It does not claim OS background execution, push delivery or WorkManager/BGTaskScheduler support.

The next poll is scheduled after the current attempt finishes, using the latest cached baseline interval (normally 30 seconds). Changing the policy does not create overlapping timers. An already scheduled timer may still use the previous interval once.

## Persistence

SQLite transactions protect one-time code consumption and result/inventory updates. Foreign keys cascade commands when a session is revoked. SQL statements are parameterized. Pending commands are prioritized before capped history so a long journal cannot hide uncompleted work.

Mobile credentials use SecureStore. Cached inventory and command states use AsyncStorage and must not contain tokens. Browser credentials are memory-only. On iOS, Keychain values can survive reinstalls; deleting an app is not a reliable revocation mechanism. Use server revocation.

## Intentional scope

- Single trusted lab administrator, one global baseline, local SQLite database.
- No multi-tenancy, production TLS termination, fine-grained RBAC, push infrastructure or signed native release.
- No access to personal files, contacts, location, messages or installed applications.
- No security claim for a rooted/jailbroken device or compromised lab computer.
- A CLI keeps administrator credentials out of a browser UI and keeps the project focused on mobile behavior.

Useful next steps: per-platform device tests, integration tests around native storage, push-triggered foreground refresh, a dynamic backoff scheduler, device-specific policy assignment and a production identity provider. Implement them only with explicit privacy and threat-model decisions.
