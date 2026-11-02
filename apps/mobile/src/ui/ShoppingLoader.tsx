import { Image } from "expo-image";
import type { ReactNode } from "react";
import { I18nManager, View } from "react-native";
import Animated, { useReducedMotion } from "react-native-reanimated";
import { useTheme } from "@/theme";
import { Text } from "./Text";

// One trip: the mascot walks in from off-screen to the store door (0–50%), steps inside (50–55%),
// and the store squishes, bounces and spills groceries (55–100%). CSS keyframes run on the UI thread with no JS state.
const TRIP = 2800;
const STRIDE = 520;
const SIZE = 84;
const DIR = I18nManager.isRTL ? -1 : 1;
const loop = (animationName: object, animationDuration: number, extra?: object) => ({ animationName, animationDuration, animationIterationCount: "infinite" as const, ...extra });

const walk = loop(
  {
    "0%": { opacity: 1, transform: [{ translateX: -120 * DIR }, { scale: 1 }] },
    "50%": { opacity: 1, transform: [{ translateX: 150 * DIR }, { scale: 1 }] },
    "55%": { opacity: 0, transform: [{ translateX: 160 * DIR }, { scale: 0.6 }] },
    "100%": { opacity: 0, transform: [{ translateX: 160 * DIR }, { scale: 0.6 }] },
  },
  TRIP,
  { animationTimingFunction: "linear" },
);

// The walk cycle: every part keyed to one stride (two steps). Pivots are percentages of the 84px box.
const torso = loop(
  {
    "0%": { transform: [{ translateY: 0 }, { rotate: "2deg" }, { scaleX: 1.02 }, { scaleY: 0.98 }] },
    "25%": { transform: [{ translateY: -5 }, { rotate: "0deg" }, { scaleX: 0.99 }, { scaleY: 1.02 }] },
    "50%": { transform: [{ translateY: 0 }, { rotate: "-2deg" }, { scaleX: 1.02 }, { scaleY: 0.98 }] },
    "75%": { transform: [{ translateY: -5 }, { rotate: "0deg" }, { scaleX: 0.99 }, { scaleY: 1.02 }] },
    "100%": { transform: [{ translateY: 0 }, { rotate: "2deg" }, { scaleX: 1.02 }, { scaleY: 0.98 }] },
  },
  STRIDE,
);
const footL = loop(
  {
    "0%": { transform: [{ translateY: 0 }, { rotate: "-25deg" }] },
    "25%": { transform: [{ translateY: -6 }, { rotate: "0deg" }] },
    "50%": { transform: [{ translateY: 0 }, { rotate: "25deg" }] },
    "100%": { transform: [{ translateY: 0 }, { rotate: "-25deg" }] },
  },
  STRIDE,
);
const footR = loop(
  {
    "0%": { transform: [{ translateY: 0 }, { rotate: "25deg" }] },
    "50%": { transform: [{ translateY: 0 }, { rotate: "-25deg" }] },
    "75%": { transform: [{ translateY: -6 }, { rotate: "0deg" }] },
    "100%": { transform: [{ translateY: 0 }, { rotate: "25deg" }] },
  },
  STRIDE,
);
const armL = loop({ "0%": { transform: [{ rotate: "-22deg" }] }, "50%": { transform: [{ rotate: "22deg" }] }, "100%": { transform: [{ rotate: "-22deg" }] } }, STRIDE);
const armR = loop({ "0%": { transform: [{ rotate: "22deg" }] }, "50%": { transform: [{ rotate: "-22deg" }] }, "100%": { transform: [{ rotate: "22deg" }] } }, STRIDE);
const cargo = loop(
  {
    "0%": { transform: [{ translateY: 0 }, { rotate: "-3deg" }] },
    "25%": { transform: [{ translateY: -3 }, { rotate: "0deg" }] },
    "50%": { transform: [{ translateY: 0 }, { rotate: "3deg" }] },
    "75%": { transform: [{ translateY: -3 }, { rotate: "0deg" }] },
    "100%": { transform: [{ translateY: 0 }, { rotate: "-3deg" }] },
  },
  STRIDE,
  { animationDelay: 80 },
);
const shadow = loop(
  {
    "0%": { opacity: 1, transform: [{ scale: 1 }] },
    "25%": { opacity: 0.75, transform: [{ scale: 0.9 }] },
    "50%": { opacity: 1, transform: [{ scale: 1 }] },
    "75%": { opacity: 0.75, transform: [{ scale: 0.9 }] },
    "100%": { opacity: 1, transform: [{ scale: 1 }] },
  },
  STRIDE,
);
const blink = loop({ "0%": { transform: [{ scaleY: 1 }] }, "92%": { transform: [{ scaleY: 1 }] }, "95%": { transform: [{ scaleY: 0.1 }] }, "98%": { transform: [{ scaleY: 1 }] } }, 3100);

const squish = loop(
  {
    "55%": { transform: [{ scaleX: 1 }, { scaleY: 1 }] },
    "61%": { transform: [{ scaleX: 1.18 }, { scaleY: 0.82 }] },
    "69%": { transform: [{ scaleX: 0.94 }, { scaleY: 1.08 }] },
    "77%": { transform: [{ scaleX: 1.04 }, { scaleY: 0.97 }] },
    "85%": { transform: [{ scaleX: 1 }, { scaleY: 1 }] },
  },
  TRIP,
);
const fly = (dx: number, dy: number, spin: number) =>
  loop(
    {
      "59%": { opacity: 0, transform: [{ translateX: 0 }, { translateY: 0 }, { rotate: "0deg" }] },
      "63%": { opacity: 1 },
      "81%": { opacity: 1, transform: [{ translateX: dx }, { translateY: -dy }, { rotate: `${spin}deg` }] },
      "100%": { opacity: 0, transform: [{ translateX: dx * 1.3 }, { translateY: -dy * 0.4 }, { rotate: `${spin * 1.5}deg` }] },
    },
    TRIP,
  );

const groceries = [
  { source: require("../../assets/loading/milk.png"), style: fly(-70, 90, -40) },
  { source: require("../../assets/loading/tomato.png"), style: fly(-30, 120, 60) },
  { source: require("../../assets/loading/bread.png"), style: fly(20, 110, -30) },
  { source: require("../../assets/loading/cheese.png"), style: fly(60, 95, 45) },
  { source: require("../../assets/loading/eggs.png"), style: fly(-5, 70, 20) },
];
const parts = {
  shadow: require("../../assets/loading/mascot/shadow.png"),
  footL: require("../../assets/loading/mascot/foot-l.png"),
  footR: require("../../assets/loading/mascot/foot-r.png"),
  cargo: require("../../assets/loading/mascot/cargo.png"),
  armL: require("../../assets/loading/mascot/arm-l.png"),
  armR: require("../../assets/loading/mascot/arm-r.png"),
  body: require("../../assets/loading/mascot/body.png"),
  eyes: require("../../assets/loading/mascot/eyes.png"),
};

const box = { position: "absolute" as const, top: 0, start: 0, width: SIZE, height: SIZE };

/** One bone of the mascot: a full-size layer that rotates and scales around `origin` ("x% y%" of the box). */
function Bone({ origin, anim, children }: { origin: string; anim: object; children: ReactNode }) {
  const reduced = useReducedMotion();
  return <Animated.View style={[box, { transformOrigin: origin }, !reduced && anim]}>{children}</Animated.View>;
}
function Part({ part, origin, anim }: { part: keyof typeof parts; origin: string; anim: object }) {
  return (
    <Bone origin={origin} anim={anim}>
      <Image source={parts[part]} style={{ width: SIZE, height: SIZE }} />
    </Bone>
  );
}

/** The mascot going shopping, for screens that wait on prices. `label` is read to assistive tech and shown under the scene. */
export function ShoppingLoader({ label }: { label: string }) {
  const { space } = useTheme();
  const reduced = useReducedMotion();
  return (
    <View accessible accessibilityRole="progressbar" accessibilityLabel={label} style={{ alignItems: "center", gap: space[5], paddingVertical: space[10] }}>
      <View style={{ width: 300, height: 190, overflow: "hidden" }}>
        <Animated.View style={[{ position: "absolute", end: 16, bottom: 0, transformOrigin: "50% 100%" }, !reduced && squish]}>
          <Image source={require("../../assets/loading/store.png")} style={{ width: 150, height: 150 }} />
        </Animated.View>
        {!reduced &&
          groceries.map((g, i) => (
            <Animated.View key={i} style={[{ position: "absolute", end: 73, bottom: 60, opacity: 0 }, g.style]}>
              <Image source={g.source} style={{ width: 36, height: 36 }} contentFit="contain" />
            </Animated.View>
          ))}
        <Animated.View style={[{ position: "absolute", start: 20, bottom: 0, width: SIZE, height: SIZE, transformOrigin: "50% 100%" }, !reduced && walk]}>
          <Part part="shadow" origin="50% 94%" anim={shadow} />
          <Part part="footL" origin="39% 80%" anim={footL} />
          <Part part="footR" origin="61% 80%" anim={footR} />
          <Bone origin="50% 88%" anim={torso}>
            <Part part="cargo" origin="50% 39%" anim={cargo} />
            <Part part="armL" origin="20% 63%" anim={armL} />
            <Part part="armR" origin="80% 63%" anim={armR} />
            <Image source={parts.body} style={{ width: SIZE, height: SIZE }} />
            <Part part="eyes" origin="50% 59%" anim={blink} />
          </Bone>
        </Animated.View>
      </View>
      <Text variant="callout" color="labelSecondary" style={{ textAlign: "center" }}>
        {label}
      </Text>
    </View>
  );
}
