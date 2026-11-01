import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { View, type TextInputInstance } from "react-native";
import { codeStatus, RESET_CODE, type SentCode } from "@grocer/shared/reset-code";
import { formatCountdown, lockMessage } from "@/features/auth/resetCode";
import { authErrorKey, validate } from "@/features/auth/validate";
import { fmt } from "@/features/compare/format";
import { authClient } from "@/lib/auth-client";
import { t, type StringKey } from "@/lib/strings";
import { useTheme } from "@/theme";
import { Button, Group, Screen, Text, TextField } from "@/ui";

type Busy = "send" | "reset" | null;

/** Password reset: the email step requests a Reset code, the code step sets the new password and signs in. */
export function PasswordResetScreen() {
  const { space } = useTheme();
  const params = useLocalSearchParams<{ email?: string }>();
  const [email, setEmail] = useState(params.email ?? "");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [sent, setSent] = useState<SentCode | null>(null);
  const [now, setNow] = useState(Date.now);
  const [error, setError] = useState<StringKey | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const passwordRef = useRef<TextInputInstance>(null);
  const passwordSet = useRef<string | null>(null);

  useEffect(() => {
    if (!sent) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [sent]);

  const status = sent && codeStatus(sent, now);
  const target = email.trim();

  function fail(key: StringKey) {
    setError(key);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  }

  async function run(kind: Exclude<Busy, null>, action: () => Promise<StringKey | null>) {
    setBusy(kind);
    setError(null);
    try {
      const key = await action();
      if (key) fail(key);
    } catch {
      fail("auth.error.generic");
    } finally {
      setBusy(null);
    }
  }

  // The answer is the same whether or not the email has an account, so every success moves on to the code step.
  function send() {
    const invalid = validate({ name: "", email: target, password }, "signIn").email;
    if (invalid) return fail(invalid);
    run("send", async () => {
      const { error } = await authClient.emailOtp.requestPasswordReset({ email: target });
      if (error) return authErrorKey(error.code);
      const at = Date.now();
      setSent({ sentAt: at, wrongTries: 0 });
      setNow(at);
      setCode("");
      return null;
    });
  }

  // On sign-in the session refetches and the root Stack.Protected swaps to (tabs); nothing to navigate here.
  function submit() {
    if (code.length !== RESET_CODE.length) return fail("auth.reset.codeFormat");
    const invalid = validate({ name: "", email: target, password }, "signIn").password;
    if (invalid) return fail(invalid);
    run("reset", async () => {
      // The code is spent once the reset succeeds, so a retry after a failed sign-in only signs in.
      if (passwordSet.current !== password) {
        const { error } = await authClient.emailOtp.resetPassword({ email: target, otp: code, password });
        if (error) {
          if (error.code === "INVALID_OTP") setSent((s) => s && { ...s, wrongTries: s.wrongTries + 1 });
          if (error.code === "TOO_MANY_ATTEMPTS") setSent((s) => s && { ...s, wrongTries: RESET_CODE.maxTries });
          return authErrorKey(error.code);
        }
        passwordSet.current = password;
      }
      const signIn = await authClient.signIn.email({ email: target, password });
      return signIn.error ? authErrorKey(signIn.error.code) : null;
    });
  }

  const message = status?.lock ? lockMessage[status.lock] : error;
  const footnote: StringKey | null = message ?? (sent ? "auth.passwordHint" : null);
  return (
    <Screen scroll keyboard style={{ paddingTop: space[10], paddingBottom: space[8], gap: space[4] }}>
      <View style={{ gap: space[1], paddingBottom: space[4] }}>
        <Text variant="largeTitle" accessibilityRole="header">
          {t("auth.reset.title")}
        </Text>
        <Text variant="subhead" color="labelSecondary">
          {sent ? fmt(t("auth.reset.sent"), { email: target }) : t("auth.reset.intro")}
        </Text>
      </View>

      <View>
        <Group>
          {!sent && (
            <TextField
              label={t("auth.email")}
              value={email}
              onChangeText={setEmail}
              error={error ? t(error) : undefined}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              textContentType="emailAddress"
              returnKeyType="send"
              onSubmitEditing={send}
            />
          )}
          {sent && (
            <TextField
              label={t("auth.reset.code")}
              value={code}
              onChangeText={(v) => setCode(v.replace(/\D/g, ""))}
              error={message ? t(message) : undefined}
              editable={!status?.lock}
              keyboardType="number-pad"
              autoComplete="one-time-code"
              textContentType="oneTimeCode"
              maxLength={RESET_CODE.length}
              returnKeyType="next"
              onSubmitEditing={() => passwordRef.current?.focus()}
            />
          )}
          {sent && (
            <TextField
              ref={passwordRef}
              label={t("auth.reset.newPassword")}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="new-password"
              textContentType="newPassword"
              returnKeyType="go"
              onSubmitEditing={submit}
            />
          )}
        </Group>
        {footnote && (
          <Text
            variant="footnote"
            color={message ? "danger" : "labelSecondary"}
            accessibilityLiveRegion="polite"
            accessibilityRole={message ? "alert" : undefined}
            style={{ paddingHorizontal: space[5], paddingTop: space[3] }}
          >
            {t(footnote)}
          </Text>
        )}
        {/* Not a live region: screen readers read it on focus instead of every second. */}
        {status && !status.lock && (
          <Text variant="footnote" color="labelSecondary" tabular style={{ paddingHorizontal: space[5], paddingTop: space[1] }}>
            {fmt(t("auth.reset.expiresIn"), { time: formatCountdown(status.msLeft) })}
          </Text>
        )}
      </View>

      {sent ? (
        <>
          <Button
            title={t("auth.reset.submit")}
            haptic
            loading={busy === "reset"}
            disabled={!!status?.lock || busy === "send"}
            onPress={submit}
            style={{ marginTop: space[2] }}
          />
          <Button
            variant="plain"
            title={status?.resendInMs ? fmt(t("auth.reset.resendIn"), { time: formatCountdown(status.resendInMs) }) : t("auth.reset.resend")}
            accessibilityLabel={t("auth.reset.resend")}
            loading={busy === "send"}
            disabled={!!status?.resendInMs || busy === "reset"}
            onPress={send}
          />
        </>
      ) : (
        <Button title={t("auth.reset.send")} haptic loading={busy === "send"} onPress={send} style={{ marginTop: space[2] }} />
      )}
      <Button variant="plain" title={t("auth.reset.back")} disabled={!!busy} onPress={() => router.back()} />
    </Screen>
  );
}
