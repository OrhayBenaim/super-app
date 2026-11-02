import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { useEffect, useRef } from "react";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import "@/features/geofence/task"; // registers the background geofence task at startup
import { useNearbyNotificationTap } from "@/features/geofence/useNearbyNotificationTap";
import { authClient } from "@/lib/auth-client";
import { Sentry } from "@/lib/sentry";
import { useTheme } from "@/theme";

const queryClient = new QueryClient();

function RootLayout() {
  const { data: session, isPending } = authClient.useSession();
  const userId = session?.user.id;
  // Same id the API sets in requireUser; null on sign-out.
  useEffect(() => Sentry.setUser(userId ? { id: userId } : null), [userId]);
  const { colors, radius, shadow } = useTheme();
  // Gate only the first load: a signed-out refetch (sign-in, app focus) sets isPending again,
  // and returning null then would unmount the whole navigator mid-form.
  const loaded = useRef(false);
  if (!isPending) loaded.current = true;
  // Navigate only once the navigator is mounted and the (tabs) group is reachable.
  useNearbyNotificationTap(loaded.current && !!session);
  if (!loaded.current) return null; // session is cached in SecureStore, so this is brief

  // Native content-sized sheet; grouped background so the white inset groups inside read as groups, as on screens.
  const sheet = {
    presentation: "formSheet",
    sheetAllowedDetents: "fitToContents",
    sheetGrabberVisible: true,
    sheetCornerRadius: radius.sheet,
    sheetElevation: shadow.sheet.elevation,
    contentStyle: { backgroundColor: colors.groupedBg },
  } as const;

  // Protected groups: without a session expo-router redirects to (auth) (onboarding first), else (tabs).
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <QueryClientProvider client={queryClient}>
        <StatusBar style="auto" />
        <Stack screenOptions={{ headerShown: false }}>
          {/* shortcut: a signed-out join/share deep link lands on onboarding and the invite code is lost after sign-in; stash it if users complain. */}
          <Stack.Protected guard={!!session}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen
              name="recent"
              options={{ headerShown: true, title: "", headerTintColor: colors.tint, headerShadowVisible: false, headerStyle: { backgroundColor: colors.groupedBg } }}
            />
            <Stack.Screen name="share" options={{ presentation: "modal" }} />
            <Stack.Screen name="item/[id]" options={sheet} />
            <Stack.Screen name="missing" options={sheet} />
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
