import { Image } from "expo-image";
import { I18nManager, View } from "react-native";
import Animated, { useReducedMotion } from "react-native-reanimated";
import { useTheme } from "@/theme";
import { Text } from "./Text";

// One trip: the mascot walks to the store (0–52%), goes in, and the store squishes,
// bounces and spills groceries (54–100%). CSS keyframes run on the UI thread with no JS state.
const TRIP = 2800;
const WALK = 150 * (I18nManager.isRTL ? -1 : 1);
const loop = (animationName: object, animationDuration = TRIP) => ({ animationName, animationDuration, animationIterationCount: "infinite" as const });

const walk = loop({
  "0%": { opacity: 0, transform: [{ translateX: 0 }] },
  "6%": { opacity: 1 },
  "50%": { opacity: 1, transform: [{ translateX: WALK }] },
  "54%": { opacity: 0, transform: [{ translateX: WALK }] },
  "100%": { opacity: 0, transform: [{ translateX: WALK }] },
});
const waddle = { ...loop({ from: { transform: [{ translateY: 0 }, { rotate: "-5deg" }] }, to: { transform: [{ translateY: -6 }, { rotate: "5deg" }] } }, 220), animationDirection: "alternate" as const };
const squish = loop({
  "54%": { transform: [{ scaleX: 1 }, { scaleY: 1 }] },
  "60%": { transform: [{ scaleX: 1.18 }, { scaleY: 0.82 }] },
  "68%": { transform: [{ scaleX: 0.94 }, { scaleY: 1.08 }] },
  "76%": { transform: [{ scaleX: 1.04 }, { scaleY: 0.97 }] },
  "84%": { transform: [{ scaleX: 1 }, { scaleY: 1 }] },
});
const fly = (dx: number, dy: number, spin: number) =>
  loop({
    "58%": { opacity: 0, transform: [{ translateX: 0 }, { translateY: 0 }, { rotate: "0deg" }] },
    "62%": { opacity: 1 },
    "80%": { opacity: 1, transform: [{ translateX: dx }, { translateY: -dy }, { rotate: `${spin}deg` }] },
    "100%": { opacity: 0, transform: [{ translateX: dx * 1.3 }, { translateY: -dy * 0.4 }, { rotate: `${spin * 1.5}deg` }] },
  });

const groceries = [
  { source: require("../../assets/loading/milk.png"), style: fly(-70, 90, -40) },
  { source: require("../../assets/loading/tomato.png"), style: fly(-30, 120, 60) },
  { source: require("../../assets/loading/bread.png"), style: fly(20, 110, -30) },
  { source: require("../../assets/loading/cheese.png"), style: fly(60, 95, 45) },
  { source: require("../../assets/loading/eggs.png"), style: fly(-5, 70, 20) },
];

/** The mascot going shopping, for screens that wait on prices. `label` is read to assistive tech and shown under the scene. */
export function ShoppingLoader({ label }: { label: string }) {
  const { space } = useTheme();
  const reduced = useReducedMotion();
  return (
    <View accessible accessibilityRole="progressbar" accessibilityLabel={label} style={{ alignItems: "center", gap: space[5], paddingVertical: space[10] }}>
      <View style={{ width: 300, height: 190 }}>
        <Animated.View style={[{ position: "absolute", end: 0, bottom: 0, transformOrigin: "50% 100%" }, !reduced && squish]}>
          <Image source={require("../../assets/loading/store.png")} style={{ width: 150, height: 150 }} />
        </Animated.View>
        {!reduced &&
          groceries.map((g, i) => (
            <Animated.View key={i} style={[{ position: "absolute", end: 57, bottom: 60, opacity: 0 }, g.style]}>
              <Image source={g.source} style={{ width: 36, height: 36 }} contentFit="contain" />
            </Animated.View>
          ))}
        <Animated.View style={[{ position: "absolute", start: 20, bottom: 0 }, !reduced && walk]}>
          <Animated.View style={!reduced && waddle}>
            <Image source={require("../../assets/loading/mascot.png")} style={{ width: 84, height: 84 }} />
          </Animated.View>
        </Animated.View>
      </View>
      <Text variant="callout" color="labelSecondary" style={{ textAlign: "center" }}>
        {label}
      </Text>
    </View>
  );
}
