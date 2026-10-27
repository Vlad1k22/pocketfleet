# Verification matrix

Automated tests cover pure policy evaluation, URL validation, enrollment, authentication, cross-device authorization, command transitions, expiry, result retries, cancellation and outbox durability.

Run `npm run check`. For the real browser suite, install Chromium with `npx playwright install chromium`, then run `npm run test:browser:security`. CI runs both suites and also exports Android, iOS and web JavaScript bundles. Exporting does **not** compile/sign an APK/IPA or exercise a native runtime.

## Security regression coverage

| Suite                                | Cases                    | What is actually exercised                                                                                                                                                                                                                |
| ------------------------------------ | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/security-api.test.ts`         | 19                       | Fastify HTTP injection + real SQLite: device/admin separation, BOLA, strict inventory, Origin guard with no mutation, no ambient cookie/query auth, response headers, size limit, SQL-shaped input, sanitized errors and token revocation |
| `tests/security-protocol.test.ts`    | 10                       | Client core with controlled responses: wrong owner, duplicate IDs, policy rollback, changed content at the same revision, legitimate new revision and inconsistent ACK retention                                                          |
| `tests/uem-recovery.test.ts`         | 1                        | Real API handlers + disk SQLite + serialized cache: response lost after commit, fresh store/engine instances and idempotent retry                                                                                                         |
| `tests/e2e/browser-security.spec.ts` | 2 scenarios × 2 projects | Actual Expo UI + disposable API in desktop/mobile Chromium: stored HTML/script is inert; web token persistence and live revocation/reload                                                                                                 |

These add 30 unit/integration cases to the existing 58. The four browser runs are separate from the 88 Vitest cases. They are not four different mobile platforms.

The browser suite uses port 4349 and a fresh temporary SQLite database, with a public test-only credential. Existing real lab data on port 4347 is not used. It needs no Expo account or employer access. JSON results and screenshots live in ignored `test-results/`; CI uploads that directory as `browser-security-results` for seven days. Traces/videos are off because network recordings can contain tokens. Screenshot assertions expose only synthetic device nicknames and harmless marker strings, never credentials.

The recovery test deliberately loses an ACK response after the real handler commits. It is not a mocked success response, but it also is not a native storage/power-loss test. For the precise threat model and interview walkthrough, read [SECURITY_LAB_RU.md](SECURITY_LAB_RU.md).

## Physical-device acceptance (not yet verified)

Record the model, OS, app version, date and result after running each check. Do not mark a row passed merely because a browser or bundle export worked.

| Check                                                           | Android | iPhone  |
| --------------------------------------------------------------- | ------- | ------- |
| Install a compatible Expo Go/development build and open the app | Not run | Not run |
| Register with a fresh single-use code                           | Not run | Not run |
| Confirm real model/OS, not synthetic demo data                  | Not run | Not run |
| Relaunch and restore native SecureStore session                 | Not run | Not run |
| Read cached data offline, reconnect and sync                    | Not run | Not run |
| Process both safe command types                                 | Not run | Not run |
| Background/foreground transitions and cancellation              | Not run | Not run |
| Revoke token, observe unauthorized state, disconnect            | Not run | Not run |
| Font scaling, keyboard, safe areas, VoiceOver/TalkBack          | Not run | Not run |

## Browser smoke workflow

`npm run web` serves a supplementary browser preview at port 8087. Check Device, Policy, Activity and Connection; create sample commands, sync, simulate offline, resume, submit an invalid enrollment code and check responsive layout. Web is deliberately reported as `platform=web`, with no invented device attestation and no persistent bearer token.

## Native compatibility

Use `npx expo install --check` and `npx expo-doctor`. A development/preview cloud build needs your own Expo account and appropriate Apple signing/device setup. There is no checked-in signing material or EAS project belonging to somebody else.

## Local run, 2026-10-27

- TypeScript strict check and ESLint completed successfully.
- 88 automated test cases passed across contracts, management API, fetch adapter, sync engine, protocol security and disk recovery.
- Four Playwright browser security runs passed: both stored-XSS and token/revocation scenarios in desktop and emulated mobile Chromium. Screenshots were visually reviewed. No native-device or Safari claim follows from this.
- Expo Doctor: 21/21 checks; SDK package compatibility check passed.
- JavaScript bundle exports completed for Android, iOS and web. No signed APK/IPA was built.
- Browser smoke: actual local enrollment, app-scoped inventory, queued-to-acknowledged reminder, server-side revocation and local disconnect passed. The browser was correctly reported as `web`.
- Demo command flow and cached offline view were exercised in the UI.
- Browser layout at desktop, 390 px and 320 px viewport widths was visually reviewed; this is not a native-device test.
- API workspace dependency audit reported zero vulnerabilities. Full SDK dependency findings are separately disclosed in `SECURITY.md`.

Two issues found by the browser smoke were fixed and regression-tested: empty JSON Content-Type headers on bodyless requests, and missing DELETE in the browser preview's CORS preflight methods.
