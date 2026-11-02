import { ActivityIndicator, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { Taps } from "@/lib/analytics";
import { t } from "@/lib/strings";
import { google, useTheme } from "@/theme";
import { Tap, Text } from "@/ui";

type Props = { loading: boolean; disabled: boolean; onPress: () => void };

/** The official "Continue with Google" pill: Google's colors, 20px G logo, Roboto Medium 14/20, Android padding 12/10/12. */
export function GoogleButton({ loading, disabled, onPress }: Props) {
  const { size } = useTheme();
  const c = google.button;
  const off = disabled || loading;
  return (
    <Tap
      accessibilityLabel={t("auth.google")}
      accessibilityState={{ disabled: off, busy: loading }}
      analyticsName={Taps.authGoogle}
      disabled={off}
      onPress={onPress}
      style={{
        minHeight: size.button,
        borderRadius: size.button / 2,
        borderWidth: 1,
        borderColor: c.stroke,
        backgroundColor: c.fill,
        paddingStart: 12,
        paddingEnd: 12,
        alignItems: "center",
        justifyContent: "center",
        opacity: disabled ? 0.4 : 1,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, opacity: loading ? 0 : 1 }}>
        <Svg width={20} height={20} viewBox="0 0 48 48">
          <Path fill={google.logo.red} d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
          <Path fill={google.logo.blue} d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
          <Path fill={google.logo.yellow} d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
          <Path fill={google.logo.green} d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
        </Svg>
        <Text numberOfLines={1} style={{ color: c.label, fontSize: 14, lineHeight: 20, fontWeight: "500", letterSpacing: 0.25 }}>
          {t("auth.google")}
        </Text>
      </View>
      {loading && <ActivityIndicator color={c.label} style={{ position: "absolute" }} />}
    </Tap>
  );
}
