import { useSentryNavigation, useSentryUser } from "@/lib/sentry"; // first: starts Sentry before the rest loads
import * as Sentry from "@sentry/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect, useRef } from "react";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import "@/features/geofence/task"; // registers the background geofence task at startup
import { useNearbyNotificationTap } from "@/features/geofence/useNearbyNotificationTap";
import { usePendingInvite } from "@/features/share/usePendingInvite";
import { useAnalytics } from "@/lib/useAnalytics";
import { authClient } from "@/lib/auth-client";
import { useTheme } from "@/theme";

const queryClient = new QueryClient();

// Keep the native splash (logo) up until the session is read, instead of a blank first frame.
SplashScreen.preventAutoHideAsync();

function RootLayout() {
  const { data: session, isPending } = authClient.useSession();
  useSentryNavigation();
  useSentryUser(session?.user.id);
  const { colors, radius, shadow } = useTheme();
  useAnalytics(session?.user.id ?? null);
  // Gate only the first load: a signed-out refetch (sign-in, app focus) sets isPending again,
  // and returning null then would unmount the whole navigator mid-form.
  const loaded = useRef(false);
  if (!isPending) loaded.current = true;
  // Navigate only once the navigator is mounted and the (drawer) group is reachable.
  useNearbyNotificationTap(loaded.current && !!session);
  usePendingInvite(loaded.current && !!session);
  const ready = loaded.current;
  useEffect(() => {
    if (ready) SplashScreen.hide();
  }, [ready]);
  if (!ready) return null; // the splash stays up meanwhile; the session is cached in SecureStore, so this is brief

  // Native content-sized sheet; grouped background so the white inset groups inside read as groups, as on screens.
  const sheet = {
    presentation: "formSheet",
    sheetAllowedDetents: "fitToContents",
    sheetGrabberVisible: true,
    sheetCornerRadius: radius.sheet,
    sheetElevation: shadow.sheet.elevation,
    contentStyle: { backgroundColor: colors.groupedBg },
  } as const;

  // Protected groups: without a session expo-router redirects to (auth) (onboarding first), else (drawer).
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <QueryClientProvider client={queryClient}>
        <StatusBar style="dark" />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Protected guard={!!session}>
            <Stack.Screen name="(drawer)" />
            <Stack.Screen
              name="recent"
              options={{ headerShown: true, title: "", headerTintColor: colors.tint, headerShadowVisible: false, headerStyle: { backgroundColor: colors.groupedBg } }}
            />
            <Stack.Screen name="share" options={{ presentation: "modal" }} />
            <Stack.Screen name="lists" options={sheet} />
            {/* Snap points, not fitToContents: product search results loading in resized it off-screen on Android. */}
            <Stack.Screen name="item/[id]" options={{ ...sheet, sheetAllowedDetents: [0.4, 0.9] }} />
            <Stack.Screen name="quantity/[id]" options={sheet} />
            <Stack.Screen name="scan" options={sheet} />
            {/* Snap points: a long basket scrolls inside the sheet instead of running off-screen. */}
            <Stack.Screen name="breakdown" options={{ ...sheet, sheetAllowedDetents: [0.6, 0.95] }} />
            <Stack.Screen name="join/[code]" />
          </Stack.Protected>
          <Stack.Protected guard={!session}>
            <Stack.Screen name="(auth)" />
          </Stack.Protected>
        </Stack>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}

export default Sentry.wrap(RootLayout);
