# Stack research: Expo 58 + Hono + better-auth + Drizzle/SQLite

Researched 2026-10-31. Versions from `npm view`; behaviour from the primary docs cited inline. Anything not confirmed is tagged **UNVERIFIED**.

## Summary (10 lines)
1. Current: Expo 58.0.22, RN 0.88.1, better-auth + @better-auth/expo 1.7.14, Hono 4.13.14, Drizzle ORM 0.45.4 (drizzle-kit 0.31.11).
2. The Drizzle adapter is now a **separate package**: `@better-auth/drizzle-adapter` (1.7.14). `better-auth/adapters/drizzle` is no longer the documented import.
3. The schema CLI is now `npx auth@latest generate` (package `auth`). `@better-auth/cli` is stale (1.4.21). I ran it: it emits `user`, `session`, `account`, `verification` with Drizzle relations.
4. Mount with `app.on(["POST","GET"], "/api/auth/*", c => auth.handler(c.req.raw))`. Protect routes with `auth.api.getSession({ headers })`.
5. Expo: no Metro tweak is needed (package exports are on by default in SDK 53+). Add the scheme to `trustedOrigins`. Send `Cookie` from `authClient.getCookie()` to your own API routes.
6. Apple: native iOS uses `expo-apple-authentication`, then `signIn.social({provider:"apple", idToken})`. The server needs `appBundleIdentifier`. Apple does not support localhost, so test against an HTTPS domain.
7. Google: simplest is the browser OAuth flow (`signIn.social({provider:"google", callbackURL})`) with one Web client ID and no native module. The native `google-signin` is optional and dev-build only.
8. Geofencing needs a dev build. iOS caps monitored regions at 20, Android at 100. Define the task at module top level. Fire with `scheduleNotificationAsync({trigger:null})`.
9. Waze: `waze://?ll=lat,lng&navigate=yes`, else `https://waze.com/ul?ll=…&navigate=yes`. Add `waze` to `LSApplicationQueriesSchemes`.
10. Reanimated 4.7.1 needs `react-native-worklets` and the New Architecture. Gesture Handler is now **3.x** with hook gestures (`usePanGesture`). Shared element transitions are still experimental behind a flag.

## 1. Server: Hono + better-auth + Drizzle (SQLite)

Install (Node 22; better-sqlite3 13 requires node >=22, better-auth 1.7.14 requires node >=20):
```bash
npm i hono @hono/node-server better-auth @better-auth/expo @better-auth/drizzle-adapter \
      drizzle-orm better-sqlite3 jose zod
npm i -D drizzle-kit auth tsx typescript @types/better-sqlite3 @types/node
```

### src/db.ts
```ts
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema"; // generated auth tables + your own tables
export const sqlite = new Database(process.env.DB_PATH ?? "app.db");
sqlite.pragma("journal_mode = WAL");
export const db = drizzle(sqlite, { schema });
```
The adapter needs the schema. When I ran the CLI against a `drizzle()` with no schema, better-auth logged "Drizzle schema mismatch: Missing tables user, session, account, verification". Pass it via `drizzle(…, { schema })` or `drizzleAdapter(db, { provider:"sqlite", schema })`.

### src/auth.ts
```ts
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { expo } from "@better-auth/expo";
import { importPKCS8, SignJWT } from "jose";
import { db } from "./db";
import * as schema from "./schema";

async function appleSecret() {                       // Apple client secret = ES256 JWT, max 6 months
  const key = await importPKCS8(process.env.APPLE_PRIVATE_KEY!, "ES256");
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({}).setProtectedHeader({ alg: "ES256", kid: process.env.APPLE_KEY_ID! })
    .setIssuer(process.env.APPLE_TEAM_ID!).setSubject(process.env.APPLE_CLIENT_ID!)
    .setAudience("https://appleid.apple.com").setIssuedAt(now)
    .setExpirationTime(now + 180 * 24 * 3600).sign(key);
}

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL,              // public HTTPS URL in prod; avoids redirect_uri_mismatch
  secret: process.env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, { provider: "sqlite", schema }),
  emailAndPassword: { enabled: true },
  socialProviders: {
    google: {
      // array = accepted ID-token audiences (web + iOS + Android); OAuth code flow uses the first + clientSecret
      clientId: [process.env.GOOGLE_WEB_CLIENT_ID!, process.env.GOOGLE_IOS_CLIENT_ID!, process.env.GOOGLE_ANDROID_CLIENT_ID!],
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    },
    apple: async () => ({                            // async config supported by the docs
      clientId: process.env.APPLE_CLIENT_ID!,        // Services ID (web/Android flow)
      clientSecret: await appleSecret(),
      appBundleIdentifier: process.env.APPLE_APP_BUNDLE_IDENTIFIER!, // REQUIRED for native iOS idToken, else JWT "aud" error
    }),
  },
  plugins: [expo()],
  trustedOrigins: [
    "grocer://", "grocer://*",                       // must match app.json "scheme"
    "https://appleid.apple.com",                     // required for Apple flows
    ...(process.env.NODE_ENV !== "production" ? ["exp://", "exp://**", "exp://192.168.*.*:*/**"] : []),
  ],
});
```
Env vars: `BETTER_AUTH_URL`, `BETTER_AUTH_SECRET`, `GOOGLE_WEB_CLIENT_ID`, `GOOGLE_IOS_CLIENT_ID`, `GOOGLE_ANDROID_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `APPLE_CLIENT_ID`, `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY` (.p8 contents), `APPLE_APP_BUNDLE_IDENTIFIER`.

Notes:
- Google: create a Web OAuth client with redirect `https://<api>/api/auth/callback/google` (the secret belongs to this client), plus iOS and Android clients for native ID tokens. Android clients need package name + SHA-1. Source: https://www.better-auth.com/docs/authentication/google
- Apple: needs an App ID with Sign In with Apple, a Services ID (the web `clientId`), a Key (.p8), the Team ID and the Key ID. Return URL is `https://<domain>/api/auth/callback/apple`. Apple omits `email` after the first authorization. Source: https://www.better-auth.com/docs/authentication/apple
- Apple does not allow localhost or http return URLs. The native `idToken` path does not use the redirect, so it works on a dev device. **UNVERIFIED:** whether the Google web redirect flow accepts a LAN IP. Google generally rejects private IPs for web clients, so use a tunnel or a real domain for device testing.

### src/index.ts (Hono mount and protected routes)
```ts
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import { auth } from "./auth";

type Env = { Variables: { session: NonNullable<Awaited<ReturnType<typeof auth.api.getSession>>> } };
const requireSession = createMiddleware<Env>(async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) throw new HTTPException(401);
  c.set("session", session);
  await next();
});

const app = new Hono<Env>();
// Register BEFORE any catch-all. Native Expo clients send no browser Origin, so CORS only matters for web.
app.on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw));
app.get("/api/me", requireSession, (c) => c.json(c.var.session.user));

serve({ fetch: app.fetch, port: 3000 }); // @hono/node-server v2 signature UNVERIFIED (v1 identical)
```
The docs use `app.all("/api/auth/*", …)`; `app.on(["POST","GET"], …)` is equivalent for auth. If you use `new Hono().basePath("/api")`, mount at `/auth/*`. Web CORS: `app.use("/api/auth/*", cors({ origin, credentials: true }))` before the handler, and add the same origin to `trustedOrigins`. Source: https://www.better-auth.com/docs/integrations/hono

### Schema generation (verified by running it)
```bash
npx auth@latest generate --config src/auth.ts --output src/schema.ts   # default output ./schema.ts
npx drizzle-kit generate && npx drizzle-kit migrate
```
`drizzle.config.ts`: `{ dialect: "sqlite", schema: "./src/schema.ts", out: "./drizzle", dbCredentials: { url: process.env.DB_PATH! } }`
Generated SQLite tables (dates are `integer({mode:"timestamp_ms"})`, booleans are `integer({mode:"boolean"})`):
- `user`: id, name, email (unique), email_verified, image, created_at, updated_at.
- `session`: id, expires_at, token (unique), created_at, updated_at, ip_address, user_agent, user_id (FK, cascade).
- `account`: id, account_id, provider_id, user_id (FK, cascade), access_token, refresh_token, id_token, access_token_expires_at, refresh_token_expires_at, scope, password, created_at, updated_at.
- `verification`: id, identifier, value, expires_at, created_at, updated_at.
Plus `relations()` for each. Re-run `generate` if you add plugins. Docs: https://www.better-auth.com/docs/adapters/drizzle and https://www.better-auth.com/docs/concepts/cli

## 2. Expo client

```bash
npx expo install expo-secure-store expo-web-browser expo-linking expo-constants expo-network expo-apple-authentication expo-crypto
npm i better-auth @better-auth/expo
npm i @react-native-google-signin/google-signin   # optional, native Google (dev build only)
```
`expo-network` is required by the current Expo docs and is a peer of `@better-auth/expo`. Source: https://www.better-auth.com/docs/integrations/expo

app.json:
```json
{ "expo": { "scheme": "grocer", "ios": { "bundleIdentifier": "com.you.grocer", "usesAppleSignIn": true,
  "infoPlist": { "LSApplicationQueriesSchemes": ["waze"] } },
  "android": { "package": "com.you.grocer" },
  "plugins": ["expo-router", "expo-secure-store", "expo-apple-authentication"] } }
```
**Metro:** nothing to do. The docs say package exports are on by default since SDK 53, so `unstable_enablePackageExports` is not needed. Just don't set it to `false` in a custom `metro.config.js`. Run `npx expo start --clear` after changing Metro config.

src/lib/auth-client.ts:
```ts
import { createAuthClient } from "better-auth/react";            // import from /react
import { expoClient } from "@better-auth/expo/client";
import * as SecureStore from "expo-secure-store";

export const authClient = createAuthClient({
  baseURL: process.env.EXPO_PUBLIC_API_URL!,                     // include path if you changed /api/auth
  plugins: [expoClient({ scheme: "grocer", storagePrefix: "grocer", storage: SecureStore })],
});
```

Usage:
```ts
await authClient.signUp.email({ email, password, name });
await authClient.signIn.email({ email, password });
const { data: session, isPending } = authClient.useSession();    // cached in SecureStore
await authClient.signOut();

// Browser OAuth (works for Google and Apple; relative callbackURL becomes grocer://dashboard)
const { error } = await authClient.signIn.social({ provider: "google", callbackURL: "/" });
// On native, signIn.social does NOT navigate for you: router.replace("/") yourself afterwards.
```
Authenticated calls to your own Hono routes (`/api/me`): the client does not attach cookies automatically.
```ts
const res = await fetch(`${API}/api/me`, { headers: { Cookie: authClient.getCookie() }, credentials: "omit" });
```

### Native Apple (iOS): the recommended path
Show the Apple button on iOS (`Platform.OS === "ios"`, or `AppleAuthentication.isAvailableAsync()`). On Android, Apple uses the browser flow (`signIn.social({provider:"apple"})`) through the Services ID over HTTPS.
```tsx
import * as AppleAuthentication from "expo-apple-authentication";
import * as Crypto from "expo-crypto";

async function signInApple() {
  const raw = Crypto.randomUUID();
  const hashed = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, raw);
  const cred = await AppleAuthentication.signInAsync({
    requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME, AppleAuthentication.AppleAuthenticationScope.EMAIL],
    nonce: hashed,
  });
  if (!cred.identityToken) throw new Error("No identity token");
  await authClient.signIn.social({ provider: "apple", idToken: { token: cred.identityToken, nonce: raw } });
}
```
The name and email arrive only on the first sign-in (`cred.fullName`). The nonce hashing pattern follows Apple's spec; **UNVERIFIED** whether better-auth expects the raw or hashed nonce, so test it, and omit the nonce if verification fails. Server `appBundleIdentifier` must equal the iOS bundle ID, or you get `JWTClaimValidationFailed: unexpected "aud"`. `expo-apple-authentication` works in Expo Go on iOS, but the identifiers differ from a standalone build. Sources: https://docs.expo.dev/versions/latest/sdk/apple-authentication/ and https://www.better-auth.com/docs/authentication/apple

### Google
- **Simplest (recommended):** `authClient.signIn.social({ provider: "google", callbackURL: "/" })`. It uses `expo-web-browser` and the Web client, with no native module and no extra Android setup. Needs an HTTPS `BETTER_AUTH_URL` that Google accepts.
- **Native (optional, nicer UX, dev build only):** `@react-native-google-signin/google-signin` 17.0.0. It cannot run in Expo Go. The free "Original" API is in the public package; "Universal" is the paid one.
```json
"plugins": [["@react-native-google-signin/google-signin", { "iosUrlScheme": "com.googleusercontent.apps.<IOS_CLIENT_ID_REVERSED>" }]]
```
```ts
GoogleSignin.configure({ webClientId: WEB_CLIENT_ID, iosClientId: IOS_CLIENT_ID });
const r = await GoogleSignin.signIn();
if (isSuccessResponse(r)) await authClient.signIn.social({ provider: "google", idToken: { token: r.data.idToken! } });
```
Sources: https://react-native-google-signin.github.io/docs/setting-up/expo and https://react-native-google-signin.github.io/docs/original. The server must list the iOS and Android client IDs in `clientId: [...]` (done above). Android additionally needs an Android OAuth client with SHA-1 (debug and release/EAS).

## 3. Versions (npm latest, 2026-10-31)

| Package | Latest | SDK 58 pins (`expo/bundledNativeModules.json`) |
|---|---|---|
| expo | 58.0.22 | – |
| expo-router | 58.0.29 | ~58.0.29 |
| react-native | 0.88.1 | 0.88.1 |
| react-native-reanimated | 4.7.1 | 4.7.1 |
| react-native-worklets | 0.13.1 | 0.13.0 |
| react-native-gesture-handler | 3.4.0 | ~3.3.0 |
| @gorhom/bottom-sheet | 5.2.14 | not Expo-managed |
| expo-notifications / expo-location / expo-task-manager / expo-secure-store | 58.1.7 / 58.0.20 / 58.0.13 / 58.0.2 | same (~) |
| expo-apple-authentication / -web-browser / -linking / -constants / -crypto / -network | 58.0.2 / 58.0.7 / 58.0.15 / 58.0.14 / 58.0.7 / 58.0.4 | – |
| @tanstack/react-query / zustand / zod | 5.105.0 / 5.0.16 / 4.6.7 | – |
| better-auth / @better-auth/expo / @better-auth/drizzle-adapter / auth (CLI) | 1.7.14 each | – |
| hono / @hono/node-server / drizzle-orm / drizzle-kit | 4.13.14 / 2.1.5 / 0.45.4 / 0.31.11 | – |
| better-sqlite3 | 13.0.3 (node >=22) | – |
| fast-xml-parser / sax | 5.11.2 / 1.6.1 | – |
| jose / google-signin / create-expo-app | 6.2.14 / 17.0.0 / 5.0.0 | – |

Always let `npx expo install` pick the SDK-pinned versions of the native modules (e.g. gesture-handler ~3.3.0, worklets 0.13.0). The npm "latest" can be ahead of what the SDK supports. `react-native-worklets` 0.13.x is a peer of Reanimated 4.7.1 (RN 0.86–0.88). For XML: `fast-xml-parser` for small/medium feeds; for huge feeds use streaming `sax` (**UNVERIFIED** which one the feed needs; sax has no built-in types, add `@types/sax`).

Scaffold:
```bash
npx create-expo-app@latest grocer --template default    # SDK 58 + expo-router (template name UNVERIFIED; plain @latest also works)
cd grocer
npx expo install expo-router expo-location expo-task-manager expo-notifications expo-secure-store \
  expo-web-browser expo-linking expo-constants expo-network expo-apple-authentication expo-crypto expo-dev-client \
  react-native-reanimated react-native-worklets react-native-gesture-handler react-native-safe-area-context react-native-screens
npm i @gorhom/bottom-sheet @tanstack/react-query zustand zod better-auth @better-auth/expo
npx expo prebuild   # then: npx expo run:ios | run:android (dev build, needed for geofencing)
```

## 4. Geofencing (expo-location + expo-task-manager + expo-notifications)

Facts (https://docs.expo.dev/versions/latest/sdk/location/):
- The task must be defined at the **top-level scope** with `TaskManager.defineTask`. Import that module from `app/_layout.tsx` so it is registered on a cold start.
- Android allows up to **100** geofences per app. iOS monitors at most **20** regions at once, so keep only the 20 nearest stores. Calling `startGeofencingAsync` again with a new array replaces the set.
- iOS needs "Always" permission (`requestBackgroundPermissionsAsync`). Android needs foreground and then background permission, and background location access needs Play Store review.
- iOS relaunches a terminated app on a geofence event. Android does **not** restart a terminated or force-killed app.
- Background location is not supported in Expo Go on iOS, and Android foreground/background services are not available in Expo Go. Use a **dev build**. Local notifications work in Expo Go, but remote push does not on Android from SDK 53 (https://docs.expo.dev/versions/latest/sdk/notifications/).

app.json plugins:
```json
["expo-location", { "locationAlwaysAndWhenInUsePermission": "Grocer alerts you when you're near a saved store.",
  "locationWhenInUsePermission": "Grocer uses your location to find nearby stores.",
  "isIosBackgroundLocationEnabled": true, "isAndroidBackgroundLocationEnabled": true }],
["expo-notifications", { "defaultChannel": "default" }]
```
`isIosBackgroundLocationEnabled` adds `location` to UIBackgroundModes. The Always/WhenInUse plist keys come from the strings above. `isAndroidBackgroundLocationEnabled` adds `ACCESS_BACKGROUND_LOCATION`, and the foreground-service permissions default on with it.

src/tasks/geofence.ts:
```ts
import * as TaskManager from "expo-task-manager";
import * as Location from "expo-location";
import * as Notifications from "expo-notifications";

export const GEOFENCE_TASK = "grocer-geofence";

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldPlaySound: false, shouldSetBadge: false, shouldShowBanner: true, shouldShowList: true }),
});

TaskManager.defineTask(GEOFENCE_TASK, async ({ data, error }: any) => {
  if (error) return;
  const { eventType, region } = data as { eventType: Location.GeofencingEventType; region: Location.LocationRegion };
  if (eventType === Location.GeofencingEventType.Enter) {
    await Notifications.scheduleNotificationAsync({
      content: { title: "Near " + region.identifier, body: "Tap to see your list for this store." },
      trigger: null, // null = fire immediately
    });
  }
});

export async function armStores(stores: { id: string; lat: number; lng: number }[]) {
  const fg = await Location.requestForegroundPermissionsAsync();
  if (fg.status !== "granted") return;
  const bg = await Location.requestBackgroundPermissionsAsync();
  if (bg.status !== "granted") return;
  await Notifications.requestPermissionsAsync();
  await Location.startGeofencingAsync(
    GEOFENCE_TASK,
    stores.slice(0, 20).map((s) => ({ identifier: s.id, latitude: s.lat, longitude: s.lng, radius: 200, notifyOnEnter: true, notifyOnExit: false })),
  );
}
```
Notes: re-arm the nearest 20 stores on app open. Android may need an explicit channel (`setNotificationChannelAsync`). `hasStartedGeofencingAsync` / `stopGeofencingAsync` also exist.

## 5. Waze deep link

Source: https://developers.google.com/waze/deeplinks
- App scheme: `waze://?ll=<lat>,<lng>&navigate=yes`. Only use it when sure Waze is installed, because otherwise nothing happens.
- Universal link: `https://waze.com/ul?ll=<lat>,<lng>&navigate=yes`. It opens the app if installed, and falls back to the Waze web page otherwise. Other params: `q` (URL-encoded search), `zoom`, `favorite=home|work`, `avoid_tolls`, `utm_source`.
- iOS 9+ needs `waze` in `LSApplicationQueriesSchemes` or `canOpenURL` always returns false (in app.json under `ios.infoPlist`, shown above).
```ts
import { Linking } from "react-native";
export async function openWaze(lat: number, lng: number) {
  const app = `waze://?ll=${lat},${lng}&navigate=yes`;
  const web = `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`;
  await Linking.openURL((await Linking.canOpenURL(app)) ? app : web);
}
```
Android: `canOpenURL("waze://")` needs a `<queries>` entry for Android 11+ package visibility (**UNVERIFIED**). Opening the `https://waze.com/ul` link works regardless, so you can simply always use the web link if `canOpenURL` misbehaves.

## 6. Reanimated 4 and Gesture Handler 3 (Expo 58)

Sources: https://docs.swmansion.com/react-native-reanimated/docs/fundamentals/getting-started/ , https://docs.swmansion.com/react-native-gesture-handler/docs/gestures/use-pan-gesture/
- Reanimated 4.x works **only with the New Architecture**. `react-native-worklets` is a separate required install. The Babel plugin is `react-native-worklets/plugin` and the Expo template includes it by default (so `babel-preset-expo` handles it; you normally add nothing). After installing native modules, rebuild with `npx expo prebuild` / a new dev build.
- Layout animations: `<Animated.View layout={LinearTransition} entering={FadeIn} exiting={FadeOut} />`. Imports come from `react-native-reanimated`. Others: `SequencedTransition`, `FadingTransition`, `JumpingTransition`, `CurvedTransition`, `EntryExitTransition`.
- **Shared element transitions:** experimental, behind the static feature flag `ENABLE_SHARED_ELEMENT_TRANSITIONS` (added in 4.2.0, default `false`). The docs say not recommended for production. It is set in package.json under `"reanimated": { "staticFeatureFlags": {...} }`, and a flag change needs a native rebuild. Prefer `Animated.View` layout/entering animations or expo-router's own transitions. Sources: https://docs.swmansion.com/react-native-reanimated/docs/shared-element-transitions/overview/ and https://docs.swmansion.com/react-native-reanimated/docs/guides/feature-flags/
- **Gesture Handler 3.x** introduces hook gestures: `usePanGesture({ onUpdate, onDeactivate, ... })` passed to `<GestureDetector gesture={...}>`, with the app wrapped in `<GestureHandlerRootView>`. Callbacks are `onBegin / onActivate / onUpdate / onDeactivate / onFinalize`. This replaces the v2 `Gesture.Pan().onEnd()` builder. Config fields such as `activeOffsetX` and `failOffsetY` are plain props. `Gesture.Pan()` compatibility in 3.x is **UNVERIFIED**. With Reanimated installed, callbacks run on the UI thread by default; `runOnJS: true` runs them on JS.

Swipe-to-check row (swipe right to toggle checked; **UNVERIFIED on a device**, built from the docs above):
```tsx
import { GestureDetector, usePanGesture } from "react-native-gesture-handler";
import Animated, { useSharedValue, useAnimatedStyle, withSpring, withTiming, LinearTransition, FadeIn, FadeOut } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets"; // Reanimated 4 replacement for runOnJS (UNVERIFIED name/export on 0.13)

const THRESHOLD = 96;

export function SwipeRow({ label, checked, onToggle }: { label: string; checked: boolean; onToggle: () => void }) {
  const x = useSharedValue(0);
  const pan = usePanGesture({
    activeOffsetX: [-12, 12],  // start only on horizontal intent
    failOffsetY: [-10, 10],    // let the list scroll vertically
    onUpdate: (e) => { x.value = Math.max(0, e.translationX); },
    onDeactivate: (e) => {
      if (e.translationX > THRESHOLD) scheduleOnRN(onToggle);
      x.value = withSpring(0, { damping: 20, stiffness: 220 });
    },
  });
  const rowStyle = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  const hintStyle = useAnimatedStyle(() => ({ opacity: Math.min(1, x.value / THRESHOLD) }));
  return (
    <Animated.View layout={LinearTransition} entering={FadeIn} exiting={FadeOut}>
      <Animated.Text style={[{ position: "absolute", left: 16, alignSelf: "center" }, hintStyle]}>Done</Animated.Text>
      <GestureDetector gesture={pan}>
        <Animated.View style={[{ padding: 16, backgroundColor: "white" }, rowStyle]}>
          <Animated.Text style={{ textDecorationLine: checked ? "line-through" : "none" }}>{label}</Animated.Text>
        </Animated.View>
      </GestureDetector>
    </Animated.View>
  );
}
```
Wrap the root layout in `<GestureHandlerRootView style={{ flex: 1 }}>`. If `scheduleOnRN` is not exported in your installed worklets, either use `runOnJS` from `react-native-reanimated` or set `runOnJS: true` on the gesture and drop the call wrapper. `@gorhom/bottom-sheet` 5.2.14 declares peers `react-native-gesture-handler >=2.16.1` and `react-native-reanimated >=3.16 || >=4.0.0-` (so 3.x/4.7 satisfy it), but runtime compatibility with GH 3 is **UNVERIFIED**.

