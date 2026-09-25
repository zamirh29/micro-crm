# MicroCRM mobile

Native iOS/Android client for MicroCRM. Built with [Expo](https://expo.dev) SDK 57,
Expo Router and TypeScript. It talks to the same Next.js API and Supabase project as
the web app at https://crm.dtmstechsolutions.co.uk

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create `mobile/.env`. Expo inlines `EXPO_PUBLIC_*` values when the bundler starts,
   so restart `expo start` after changing them:

   ```bash
   EXPO_PUBLIC_SUPABASE_URL=https://<project-id>.supabase.co
   EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon key>
   EXPO_PUBLIC_API_URL=https://crm.dtmstechsolutions.co.uk
   ```

   The Supabase values are the same as the web app's `NEXT_PUBLIC_SUPABASE_*`.
   The anon key is public by design (it ships in every client bundle).

   For local development against a server on your machine, point `EXPO_PUBLIC_API_URL`
   at your LAN address instead, e.g. `http://192.168.1.23:3000`. Find it with `ipconfig`
   (IPv4). The phone and the computer must be on the same network, and the address must
   not be `localhost` — that would resolve to the phone itself.

## Run

```bash
npx expo start
```

Scan the QR code with Expo Go (Android) or the Camera app (iOS). Press `a` / `i` to open
an Android or iOS emulator.

The app only uses modules that ship inside Expo Go (`expo-secure-store`,
`expo-file-system`, `expo-sharing`, Async Storage, NetInfo), so a development build is
not needed while developing.

## Checks

```bash
npx tsc --noEmit   # typecheck
npx expo lint      # lint
npx expo-doctor    # diagnose config and dependency issues
```

## Structure

```
src/app/             Expo Router screens (every file is a route)
  (tabs)/            Dashboard, Customers, Quotes, Invoices, Reports
  quote/[id].tsx     Quote detail, send / convert / PDF
  invoice/[id].tsx   Invoice detail, send / mark paid / PDF
  settings.tsx       Account, API URL, sign out
src/components/      Shared UI (status chips, screen states, offline banner)
src/lib/             Supabase client, REST client, auth, formatting, PDF sharing
```

## Build & ship

Builds run in the cloud with [EAS](https://docs.expo.dev/eas/index.md), so no
Android Studio or Xcode is needed.

```bash
npx eas-cli@latest login                # free Expo account
npx eas-cli@latest build -p android --profile preview
```

- `preview` (see `eas.json`) produces a signed release **APK** — an installable
  file, no app store required.
- The command prints a build URL/QR code; download the `.apk` from that page when
  it finishes (a first build takes roughly 10–20 minutes).
- On the phone, open the downloaded file and allow installs from that source when
  asked (Settings → Install unknown apps → your browser/file manager).

`--profile production` produces an `.aab` for Google Play instead.

**iOS** needs a paid Apple Developer account: `npx eas-cli@latest build -p ios`,
then distribute through TestFlight — iOS cannot be sideloaded without a
certificate.

To ship JavaScript-only fixes to an installed build without rebuilding, use
`npx eas-cli@latest update`.

## Behaviour notes

- Sessions come from Supabase; the access token is sent as a `Bearer` token to `/api/*`.
- GET responses are cached in AsyncStorage and served while the device is offline
  (marked `offline: true`); mutations are never cached.
- `ios/` and `android/` do not exist on purpose — they are generated on demand by
  `npx expo prebuild` / EAS builds. Configure native behaviour in `app.json`.
