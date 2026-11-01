import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { useRef } from "react";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import "@/features/geofence/task"; // registers the background geofence task at startup
import { useNearbyNotificationTap } from "@/features/geofence/useNearbyNotificationTap";
import { authClient } from "@/lib/auth-client";

const queryClient = new QueryClient();

export default function RootLayout() {
  const { data: session, isPending } = authClient.useSession();
  // Gate only the first load: a signed-out refetch (sign-in, app focus) sets isPending again,
  // and returning null then would unmount the whole navigator mid-form.
  const loaded = useRef(false);
  if (!isPending) loaded.current = true;
  // Navigate only once the navigator is mounted and the (tabs) group is reachable.
  useNearbyNotificationTap(loaded.current && !!session);
  if (!loaded.current) return null; // session is cached in SecureStore, so this is brief

  // Protected groups: without a session expo-router redirects to (auth) (onboarding first), else (tabs).
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <QueryClientProvider client={queryClient}>
        <StatusBar style="auto" />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Protected guard={!!session}>
            <Stack.Screen name="(tabs)" />
          </Stack.Protected>
          <Stack.Protected guard={!session}>
            <Stack.Screen name="(auth)" />
          </Stack.Protected>
        </Stack>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}
