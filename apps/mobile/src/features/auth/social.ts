import * as AppleAuthentication from "expo-apple-authentication";
import * as Crypto from "expo-crypto";
import { authClient } from "@/lib/auth-client";
import { t } from "@/lib/strings";

/** Native Sign in with Apple (iOS). Returns an error message, or null on success or user cancel. */
export async function signInWithApple(): Promise<string | null> {
  const raw = Crypto.randomUUID();
  // Apple gets the SHA-256 hex; the server gets the raw nonce (better-auth compares "exact-or-sha256").
  const hashed = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, raw);
  let cred: AppleAuthentication.AppleAuthenticationCredential;
  try {
    cred = await AppleAuthentication.signInAsync({
      requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME, AppleAuthentication.AppleAuthenticationScope.EMAIL],
      nonce: hashed,
    });
  } catch (e) {
    if ((e as { code?: string }).code === "ERR_REQUEST_CANCELED") return null;
    throw e;
  }
  if (!cred.identityToken) return t("auth.error.generic");
  const { error } = await authClient.signIn.social({
    provider: "apple",
    requestSignUp: true, // the server turns implicit sign-up off for its deletion page
    // Apple sends the name only on the first sign-in.
    idToken: {
      token: cred.identityToken,
      nonce: raw,
      user: cred.fullName ? { name: { firstName: cred.fullName.givenName ?? "", lastName: cred.fullName.familyName ?? "" } } : undefined,
    },
  });
  return error ? (error.message ?? t("auth.error.generic")) : null;
}

/** Google through browser OAuth (expo-web-browser); offered on Android. */
export async function signInWithGoogle(): Promise<string | null> {
  const { error } = await authClient.signIn.social({ provider: "google", callbackURL: "/", requestSignUp: true });
  return error ? (error.message ?? t("auth.error.generic")) : null;
}
