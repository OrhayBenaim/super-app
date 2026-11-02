import { Redirect } from "expo-router";

// Signed out, "/" (the launch URL) has no screen: (tabs)/index is protected and expo-router doesn't fall back into (auth).
export default function AuthIndex() {
  return <Redirect href="/onboarding" />;
}
