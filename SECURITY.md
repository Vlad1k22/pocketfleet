# Security model

PocketFleet is for **your own devices on a trusted development network**. It is not a security product. Do not connect devices that you do not own or have permission to use.

## Collected data

Device nickname, model, operating-system version, app version, physical/simulator flag and check-in timestamps. No stable hardware identifiers, location, contacts, installed-app list or device contents are collected. A generated enrollment ID identifies this app session, not the person's hardware.

## Credentials

- Device bearer tokens and the administrator token contain 256 bits of randomness.
- Tokens/codes are hashed in SQLite. The admin key remains in a git-ignored local file.
- Enrollment codes are short-lived, single-use and rate-limited. They are not passwords for long-lived authentication.
- Revoking a device invalidates its server session and cascades its command records.
- No credential is placed in an `EXPO_PUBLIC_` environment variable or URL.
- Request logging is disabled; errors do not echo authorization headers or server stack traces.

## Limitations

Local HTTP exposes traffic to an observer on the same network; it is accepted only for private-development origins by the client URL validator. Outside the trusted lab, HTTPS is required, and a real deployment also needs identity management, audit logging, credential rotation, monitoring and a platform-specific review. Binding to all interfaces requires an explicit environment setting; the default is loopback.

The local file's `0600` mode is effective on POSIX. On Windows it does not replace NTFS ACLs; use a private user directory and do not share `.local/`. AsyncStorage is not a vault: the cache is intentionally non-secret but still contains limited device metadata. Disconnecting deletes that session's cache; backups and forensic erasure are outside scope.

The device can lie about inventory. This is not Apple MDM, Android Enterprise Device Owner, device attestation or a way to enforce system restrictions. Do not add destructive commands to this example.

Please report a vulnerability privately to the repository owner through GitHub rather than publishing credentials, exploit URLs or personal device data in an issue. Do not include secrets in screenshots.

## Dependency review (2026-10-27)

The application and separate API workspace use patched Zod 4.6.7+. The Expo CLI bundles its own Zod 3.25.76, which is still reported by npm under [GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5). It is not the validator used by the management API. Keep development tooling on a trusted local network; do not expose Metro to the internet. A normal npm override does not reliably replace this bundled dependency, so no ineffective override is left in the project.

SDK 57's router still brings `query-string@7` / `decode-uri-component@0.2.2`, reported by npm as a moderate denial-of-service advisory: [GHSA-vcc3-ghjq-m6fr](https://github.com/advisories/GHSA-vcc3-ghjq-m6fr). Its fixed decoder is an ESM major change, while this router expects a CommonJS dependency. Do not force an incompatible major version merely to hide an audit warning. This remaining development/route-parsing risk is accepted for the isolated lab; a compatible SDK/router upgrade is required before any production deployment. The API does not use this decoder.

CI fails on high/critical advisories in the separate **management API workspace**, which is the service processing network input. The complete mobile/development dependency tree still reports the Expo CLI high advisory and the router moderate advisory described above (six npm findings including affected ancestor packages at the review date). This is an explicit accepted limitation of this SDK-pinned learning project, not a zero-vulnerability claim. A compatible upstream SDK update is needed before production consideration.
