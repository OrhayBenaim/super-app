import * as AppleAuthentication from "expo-apple-authentication";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { useRef, useState } from "react";
import { Platform, type TextInputInstance } from "react-native";
import Animated, { FadeIn, FadeOut, LinearTransition } from "react-native-reanimated";
import { signInWithApple, signInWithBrowser } from "@/features/auth/social";
import { authErrorKey, validate, type FieldErrors, type Fields } from "@/features/auth/validate";
import { authClient } from "@/lib/auth-client";
import { t } from "@/lib/strings";
import { springs, useTheme } from "@/theme";
import { Button, Group, Screen, Text, TextField } from "@/ui";

type Mode = "signIn" | "signUp";
type Busy = "email" | "apple" | "google" | null;

const s = springs.gentle;
const layout = LinearTransition.springify().damping(s.damping).stiffness(s.stiffness).mass(s.mass);

export default function SignIn() {
  const { space, radius, size, isDark } = useTheme();
  const [mode, setMode] = useState<Mode>("signIn");
  const [fields, setFields] = useState<Fields>({ name: "", email: "", password: "" });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const passwordRef = useRef<TextInputInstance>(null);
  const emailRef = useRef<TextInputInstance>(null);

  const set = (key: keyof Fields) => (value: string) => setFields((f) => ({ ...f, [key]: value }));

  // On success the session refetches and the root Stack.Protected swaps to (tabs); nothing to navigate here.
  async function run(kind: Exclude<Busy, null>, action: () => Promise<string | null>) {
    setBusy(kind);
    setFormError(null);
    try {
      const message = await action();
      if (message) setFormError(message);
    } catch {
      setFormError(t("auth.error.generic"));
    } finally {
      setBusy(null);
    }
  }

  function submit() {
    const found = validate(fields, mode);
    setErrors(found);
    if (Object.keys(found).length) return Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    const email = fields.email.trim();
    run("email", async () => {
      const { error } =
        mode === "signUp"
          ? await authClient.signUp.email({ name: fields.name.trim(), email, password: fields.password })
          : await authClient.signIn.email({ email, password: fields.password });
      return error ? t(authErrorKey(error.code)) : null;
    });
  }

  const ios = Platform.OS === "ios";
  const google = (
    <Button
      title={t("auth.google")}
      variant="neutral"
      loading={busy === "google"}
      disabled={!!busy}
      onPress={() => run("google", () => signInWithBrowser("google"))}
    />
  );
  const apple = ios ? (
    <AppleAuthentication.AppleAuthenticationButton
      buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
      buttonStyle={isDark ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
      cornerRadius={radius.button}
      style={{ height: size.button, opacity: busy ? 0.5 : 1 }}
      onPress={() => !busy && run("apple", signInWithApple)}
    />
  ) : (
    <Button
      title={t("auth.apple")}
      variant="neutral"
      loading={busy === "apple"}
      disabled={!!busy}
      onPress={() => run("apple", () => signInWithBrowser("apple"))}
    />
  );

  const fieldError = errors.name ?? errors.email ?? errors.password;
  return (
    <Screen scroll keyboard style={{ paddingTop: space[10], paddingBottom: space[8], gap: space[4] }}>
      <Animated.View layout={layout} style={{ gap: space[1], paddingBottom: space[4] }}>
        <Text variant="largeTitle" accessibilityRole="header">
          {t("auth.title")}
        </Text>
        <Text variant="subhead" color="labelSecondary">
          {t("auth.subtitle")}
        </Text>
      </Animated.View>

      <Animated.View layout={layout} style={{ gap: space[3] }}>
        {ios ? apple : google}
        {ios ? google : apple}
      </Animated.View>

      <Animated.View layout={layout}>
        <Text variant="footnote" color="labelSecondary" style={{ textAlign: "center", paddingVertical: space[2] }}>
          {t("auth.or")}
        </Text>
      </Animated.View>

      <Animated.View layout={layout}>
        <Group>
          {mode === "signUp" && (
            <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(150)}>
              <TextField
                label={t("auth.name")}
                value={fields.name}
                onChangeText={set("name")}
                error={errors.name && t(errors.name)}
                autoComplete="name"
                textContentType="name"
                returnKeyType="next"
                onSubmitEditing={() => emailRef.current?.focus()}
              />
            </Animated.View>
          )}
          <TextField
            ref={emailRef}
            label={t("auth.email")}
            value={fields.email}
            onChangeText={set("email")}
            error={errors.email && t(errors.email)}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            textContentType="emailAddress"
            returnKeyType="next"
            onSubmitEditing={() => passwordRef.current?.focus()}
          />
          <TextField
            ref={passwordRef}
            label={t("auth.password")}
            value={fields.password}
            onChangeText={set("password")}
            error={errors.password && t(errors.password)}
            secureTextEntry
            autoComplete={mode === "signUp" ? "new-password" : "current-password"}
            textContentType={mode === "signUp" ? "newPassword" : "password"}
            returnKeyType="go"
            onSubmitEditing={submit}
          />
        </Group>
        {(fieldError || formError || mode === "signUp") && (
          <Animated.View entering={FadeIn.duration(150)} style={{ paddingHorizontal: space[5], paddingTop: space[3] }}>
            <Text
              variant="footnote"
              color={fieldError || formError ? "danger" : "labelSecondary"}
              accessibilityLiveRegion="polite"
              accessibilityRole={fieldError || formError ? "alert" : undefined}
            >
              {fieldError ? t(fieldError) : (formError ?? t("auth.passwordHint"))}
            </Text>
          </Animated.View>
        )}
      </Animated.View>

      <Button
        layout={layout}
        title={t(mode === "signUp" ? "auth.signUp" : "auth.signIn")}
        haptic
        loading={busy === "email"}
        disabled={!!busy && busy !== "email"}
        onPress={submit}
        style={{ marginTop: space[2] }}
      />
      {mode === "signIn" && (
        <Button
          layout={layout}
          variant="plain"
          title={t("auth.forgot")}
          disabled={!!busy}
          onPress={() => router.push({ pathname: "/forgot-password", params: { email: fields.email.trim() } })}
        />
      )}
      <Button
        layout={layout}
        variant="plain"
        title={t(mode === "signUp" ? "auth.toSignIn" : "auth.toSignUp")}
        onPress={() => {
          setMode((m) => (m === "signUp" ? "signIn" : "signUp"));
          setErrors({});
          setFormError(null);
        }}
      />
    </Screen>
  );
}
