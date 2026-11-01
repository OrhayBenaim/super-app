import { LinearGradient } from "expo-linear-gradient";
import type { ReactNode } from "react";
import { View, type ViewStyle } from "react-native";
import Animated, { Extrapolation, interpolate, useAnimatedStyle, useReducedMotion, type SharedValue } from "react-native-reanimated";
import { tokens, useTheme, type Colors } from "@/theme";

type Props = { scrollX: SharedValue<number>; width: number; height: number; pages: number; rtl: boolean };

/** Shared parallax stage behind the pager: back blob, one motif per page, front sparkles. Pure Views, no assets. */
export function Illustration({ scrollX, width, height, pages, rtl }: Props) {
  const { colors } = useTheme();
  const reduced = useReducedMotion();
  const motifs = [ListMotif, BasketMotif, PinMotif];

  // Reduced motion: keep the crossfade (it explains the page change), drop all translation.
  const back = useAnimatedStyle(() => ({ transform: [{ translateX: reduced ? 0 : -scrollX.get() * 0.15 }] }));
  const front = useAnimatedStyle(() => ({ transform: [{ translateX: reduced ? 0 : -scrollX.get() * 0.7 }] }));

  return (
    <View pointerEvents="none" style={{ position: "absolute", top: 0, start: 0, end: 0, height, overflow: "hidden", direction: "ltr" }}>
      <Animated.View style={[{ position: "absolute", top: -height * 0.25, start: width * 0.1 }, back]}>
        <LinearGradient
          colors={[colors.primarySoft, colors.bg]}
          start={{ x: 0.2, y: 0 }}
          end={{ x: 0.8, y: 1 }}
          style={{ width: width * 1.4, height: width * 1.4, borderRadius: width * 0.7 }}
        />
      </Animated.View>
      {motifs.map((Motif, i) => (
        <Page key={i} physical={rtl ? pages - 1 - i : i} {...{ scrollX, width, height, reduced }}>
          <Motif colors={colors} />
        </Page>
      ))}
      <Animated.View style={[{ position: "absolute", top: 0, start: 0, width: width * pages, height }, front]}>
        {SPARKS.map(([x, y, size, accent], i) => (
          <View
            key={i}
            style={{
              position: "absolute",
              start: x * width,
              top: y * height,
              width: size,
              height: size,
              borderRadius: size / 2,
              backgroundColor: accent ? colors.accent : colors.primary,
              opacity: 0.35,
            }}
          />
        ))}
      </Animated.View>
    </View>
  );
}

// [x in page widths, y in stage heights, size, accent?]
const SPARKS: [number, number, number, boolean][] = [
  [0.12, 0.2, 10, true], [0.85, 0.7, 14, false], [1.1, 0.15, 8, false],
  [1.8, 0.8, 12, true], [2.2, 0.25, 10, false], [2.9, 0.6, 8, true],
];

function Page({ physical, scrollX, width, height, reduced, children }: { physical: number; scrollX: SharedValue<number>; width: number; height: number; reduced: boolean; children: ReactNode }) {
  const style = useAnimatedStyle(() => {
    const at = physical * width;
    const x = scrollX.get();
    return {
      opacity: interpolate(x, [at - width, at, at + width], [0, 1, 0], Extrapolation.CLAMP),
      // Motif travels at half page speed, so it lags the copy: that lag is the parallax.
      transform: [{ translateX: reduced ? 0 : (at - x) * 0.5 }, { scale: interpolate(x, [at - width, at, at + width], [0.95, 1, 0.95], Extrapolation.CLAMP) }],
    };
  });
  return (
    <Animated.View style={[{ position: "absolute", top: 0, start: 0, width, height, alignItems: "center", justifyContent: "center" }, style]}>
      {children}
    </Animated.View>
  );
}

const card = (c: Colors): ViewStyle => ({ backgroundColor: c.surfaceRaised, borderRadius: tokens.radius.lg, ...tokens.shadow.md });

function ListMotif({ colors: c }: { colors: Colors }) {
  const rows = [false, true, false];
  return (
    <View style={[card(c), { width: 220, padding: 20, gap: 16 }]}>
      <View style={{ position: "absolute", top: -14, end: 16, flexDirection: "row" }}>
        <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: c.primary, borderWidth: 3, borderColor: c.surfaceRaised }} />
        <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: c.accent, borderWidth: 3, borderColor: c.surfaceRaised, marginStart: -10 }} />
      </View>
      {rows.map((checked, i) => (
        <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <View
            style={{
              width: 22,
              height: 22,
              borderRadius: 11,
              borderWidth: 2,
              borderColor: checked ? c.primary : c.borderControl,
              backgroundColor: checked ? c.primary : "transparent",
            }}
          />
          <View style={{ height: 10, borderRadius: 5, width: [120, 90, 140][i], backgroundColor: checked ? c.border : c.textTertiary, opacity: checked ? 1 : 0.5 }} />
        </View>
      ))}
    </View>
  );
}

function BasketMotif({ colors: c }: { colors: Colors }) {
  const bars = [0.8, 0.45, 1];
  return (
    <View style={[card(c), { width: 220, height: 170, padding: 20, flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between" }]}>
      {bars.map((h, i) => {
        const cheapest = h === Math.min(...bars);
        return (
          <View key={i} style={{ alignItems: "center", gap: 8 }}>
            {cheapest && <View style={{ width: 40, height: 16, borderRadius: 8, backgroundColor: c.accentSoft }} />}
            {cheapest ? (
              <LinearGradient colors={[c.primary, c.primaryPressed]} style={{ width: 44, height: 110 * h, borderRadius: 10 }} />
            ) : (
              <View style={{ width: 44, height: 110 * h, borderRadius: 10, backgroundColor: c.surfaceSunken }} />
            )}
          </View>
        );
      })}
    </View>
  );
}

function PinMotif({ colors: c }: { colors: Colors }) {
  return (
    <View style={{ width: 220, height: 200, alignItems: "center", justifyContent: "center" }}>
      {[200, 140].map((d) => (
        <View key={d} style={{ position: "absolute", width: d, height: d, borderRadius: d / 2, borderWidth: 2, borderColor: c.primarySoft }} />
      ))}
      <View style={{ alignItems: "center", marginTop: -24 }}>
        <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: c.accent, alignItems: "center", justifyContent: "center" }}>
          <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: c.surfaceRaised }} />
        </View>
        <View style={{ width: 28, height: 28, marginTop: -22, zIndex: -1, backgroundColor: c.accent, transform: [{ rotate: "45deg" }] }} />
      </View>
      <View style={{ position: "absolute", bottom: 0, width: 96, height: 32, borderRadius: 16, backgroundColor: c.waze }} />
    </View>
  );
}
