import * as AppleAuthentication from "expo-apple-authentication";
import * as Haptics from "expo-haptics";
import { useRef, useState } from "react";
import { Platform, View, type TextInputInstance } from "react-native";
import Animated, { FadeIn, FadeOut, LinearTransition } from "react-native-reanimated";
import { signInWithApple, signInWithBrowser } from "@/features/auth/social";
import { authErrorKey, validate, type FieldErrors, type Fields } from "@/features/auth/validate";
import { authClient } from "@/lib/auth-client";
import { t } from "@/lib/strings";
import { springs, useTheme } from "@/theme";
import { Button, Divider, Screen, Text, TextField } from "@/ui";

type Mode = "signIn" | "signUp";
type Busy = "email" | "apple" | "google" | null;

const s = springs.gentle;
const layout = LinearTransition.springify().damping(s.damping).stiffness(s.stiffness).mass(s.mass);

export default function SignIn() {
  const { colors, space, radius, isDark } = useTheme();
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
      variant={ios ? "ghost" : "secondary"}
      loading={busy === "google"}
      disabled={!!busy}
      onPress={() => run("google", () => signInWithBrowser("google"))}
    />
  );
  const apple = ios ? (
    <AppleAuthentication.AppleAuthenticationButton
      buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
      buttonStyle={isDark ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
      cornerRadius={radius.md}
      style={{ height: 52, opacity: busy ? 0.5 : 1 }}
      onPress={() => !busy && run("apple", signInWithApple)}
    />
  ) : (
    <Button
      title={t("auth.apple")}
      variant="ghost"
      loading={busy === "apple"}
      disabled={!!busy}
      onPress={() => run("apple", () => signInWithBrowser("apple"))}
    />
  );

  return (
    <Screen scroll keyboard style={{ paddingVertical: space[8], gap: space[6] }}>
      <Animated.View layout={layout} style={{ gap: space[3] }}>
        <Text variant="largeTitle" accessibilityRole="header">
          {t(mode === "signUp" ? "auth.signUp.title" : "auth.signIn.title")}
        </Text>
        <Text color="textSecondary">{t("auth.subtitle")}</Text>
      </Animated.View>

      <Animated.View layout={layout} style={{ gap: space[3] }}>
        {ios ? apple : google}
        {ios ? google : apple}
      </Animated.View>

      <Animated.View layout={layout} style={{ flexDirection: "row", alignItems: "center", gap: space[4] }}>
        <Divider style={{ flex: 1 }} />
        <Text variant="footnote" color="textTertiary">
          {t("auth.or")}
        </Text>
        <Divider style={{ flex: 1 }} />
      </Animated.View>

      <View style={{ gap: space[5] }}>
        {mode === "signUp" && (
          <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(150)} layout={layout}>
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
        <Animated.View layout={layout}>
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
        </Animated.View>
        <Animated.View layout={layout}>
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
        </Animated.View>
        {formError && (
          <Animated.View entering={FadeIn.duration(150)} layout={layout} style={{ backgroundColor: colors.accentSoft, borderRadius: radius.sm, padding: space[4] }}>
            <Text variant="subhead" color="danger" accessibilityLiveRegion="polite" accessibilityRole="alert">
              {formError}
            </Text>
          </Animated.View>
        )}
        <Button
          layout={layout}
          title={t(mode === "signUp" ? "auth.signUp" : "auth.signIn")}
          haptic
          loading={busy === "email"}
          disabled={!!busy && busy !== "email"}
          onPress={submit}
        />
        <Button
          layout={layout}
          variant="ghost"
          title={t(mode === "signUp" ? "auth.toSignIn" : "auth.toSignUp")}
          onPress={() => {
            setMode((m) => (m === "signUp" ? "signIn" : "signUp"));
            setErrors({});
            setFormError(null);
          }}
        />
      </View>
    </Screen>
  );
}
