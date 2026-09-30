# Mera Passkey Domain Setup

## Relying party

Default:

`metropolis.cherrymoney.co.uk`

The relying-party ID is security-sensitive. Changing it creates a different passkey
namespace, so do not casually change it after judge/demo accounts are created.

## iOS

App bundle ID:

`uk.co.cherrymoney.metropolis`

The native app is configured with:

`webcredentials:metropolis.cherrymoney.co.uk`

The RP host must serve:

`https://metropolis.cherrymoney.co.uk/.well-known/apple-app-site-association`

with a `webcredentials.apps` entry containing:

`<APPLE_TEAM_ID>.uk.co.cherrymoney.metropolis`

Do not commit an invented Team ID. Use the real Apple Developer team ID.

## Android

Package:

`uk.co.cherrymoney.metropolis`

The RP host must serve:

`https://metropolis.cherrymoney.co.uk/.well-known/assetlinks.json`

with:

- namespace `android_app`
- package name `uk.co.cherrymoney.metropolis`
- the SHA-256 fingerprint(s) of every signing certificate used for the demo build.

The Android build must also include Credential Manager's native Digital Asset
Links declaration under `<application>`:

```xml
<meta-data
    android:name="asset_statements"
    android:resource="@string/asset_statements" />
```

The Expo config plugin at
`apps/mobile/plugins/with-credential-manager-domain.cjs` generates that
metadata and the corresponding `asset_statements` string resource from
`MERA_RP_ID`. The JSON quotation marks in the Android string resource must be
escaped (for example `[{\\\"include\\\":\\\"https://.../assetlinks.json\\\"}]`) so
Credential Manager receives a valid Digital Asset Links statement list.

For a local Android debug certificate:

```bash
keytool -list -v \
  -keystore ~/.android/debug.keystore \
  -alias androiddebugkey \
  -storepass android
```

## Hosting rules

Both association files must:

- be public over HTTPS;
- return JSON directly;
- avoid redirects;
- use the final RP hostname;
- contain the actual production/demo signing identities.

## Verification checklist

- [ ] DNS for `metropolis.cherrymoney.co.uk` resolves.
- [ ] HTTPS certificate is valid.
- [ ] Apple association file returns 200 without redirect.
- [ ] Android assetlinks file returns 200 without redirect.
- [ ] Apple Team ID is correct.
- [ ] Android SHA-256 signing fingerprint is correct.
- [ ] Create passkey works on a supported device.
- [ ] Same passkey can recover the same address on a second device/fresh profile.
