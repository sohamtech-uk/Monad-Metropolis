# Mobile Store Release

Cherry Pay Global is an Expo / React Native app.

## Store identity

- App name: `Cherry Pay Global`
- Android package: `uk.co.cherrymoney.metropolis`
- iOS bundle identifier: `uk.co.cherrymoney.metropolis`
- URL scheme: `cherrypayglobal`
- Passkey RP ID: `metropolis.cherrymoney.co.uk`

Do not change the package or bundle identifier after store records and passkeys
are created.

## Accounts required

Before the first store build:

1. Expo account for EAS Build.
2. Google Play Developer account.
3. Apple Developer Program membership.

For passkeys, also record:

- the real Apple Team ID;
- the Android SHA-256 signing certificate fingerprint used by the Play build.

Those values must be reflected by the association files hosted at
`metropolis.cherrymoney.co.uk`.

## First EAS setup

From the repository root:

```bash
cd apps/mobile
npm install --global eas-cli
eas login
eas init
```

When `eas init` creates or links the Expo project, keep the existing slug
`cherry-pay-global` and store the generated EAS project ID in the app config
if EAS asks for it.

## Android test build

Create an installable APK for device testing:

```bash
cd apps/mobile
eas build --platform android --profile preview
```

## Android Play Store build

Create the Android App Bundle:

```bash
cd apps/mobile
eas build --platform android --profile production
```

The production profile produces a signed `.aab` suitable for Google Play.

Create the app in Google Play Console with package:

```text
uk.co.cherrymoney.metropolis
```

For the first release, use Internal testing before Production.

Submit after the Play app record and service-account access are configured:

```bash
eas submit --platform android --profile production
```

## iOS TestFlight / App Store build

Create the signed iOS archive:

```bash
cd apps/mobile
eas build --platform ios --profile production
```

Register the App ID in Apple Developer / App Store Connect as:

```text
uk.co.cherrymoney.metropolis
```

Upload the completed build:

```bash
eas submit --platform ios --profile production
```

The build will appear in TestFlight after Apple processes it. Use TestFlight
for the first external/device validation before sending a production release
to App Review.

## Passkey release checks

### Apple

The RP host must return an Apple App Site Association file with:

```text
<REAL_APPLE_TEAM_ID>.uk.co.cherrymoney.metropolis
```

### Android

The RP host must return `/.well-known/assetlinks.json` containing:

- package name `uk.co.cherrymoney.metropolis`;
- SHA-256 certificate fingerprint for the actual release signing key.

If Google Play App Signing is enabled, include the Play App Signing certificate
fingerprint, not only a local upload/debug certificate.

## Store assets still required

Before public submission prepare:

- 1024×1024 production app icon;
- Android adaptive icon;
- launch/splash artwork;
- Google Play screenshots and feature graphic;
- Apple App Store screenshots;
- privacy policy URL;
- support URL;
- store descriptions and release notes.

Do not submit publicly until the production icon and both passkey association
files have been validated on signed store builds.
