# Verification matrix

Automated tests cover pure policy evaluation, URL validation, enrollment, authentication, cross-device authorization, command transitions, expiry, result retries, cancellation and outbox durability.

Run `npm run check`. CI also exports Android, iOS and web JavaScript bundles. Exporting does **not** compile/sign an APK/IPA or exercise a native runtime.

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
- 58 automated assertions passed across contracts, management API, fetch adapter and sync engine.
- Expo Doctor: 21/21 checks; SDK package compatibility check passed.
- JavaScript bundle exports completed for Android, iOS and web. No signed APK/IPA was built.
- Browser smoke: actual local enrollment, app-scoped inventory, queued-to-acknowledged reminder, server-side revocation and local disconnect passed. The browser was correctly reported as `web`.
- Demo command flow and cached offline view were exercised in the UI.
- Browser layout at desktop and 390 px viewport width was visually reviewed; this is not a native-device test.
- API workspace dependency audit reported zero vulnerabilities. Full SDK dependency findings are separately disclosed in `SECURITY.md`.

Two issues found by the browser smoke were fixed and regression-tested: empty JSON Content-Type headers on bodyless requests, and missing DELETE in the browser preview's CORS preflight methods.
