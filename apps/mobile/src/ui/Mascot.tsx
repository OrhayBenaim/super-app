import { Image } from "expo-image";
import type { ReactNode } from "react";
import { View } from "react-native";
import Animated, { useReducedMotion } from "react-native-reanimated";
import { useTheme } from "@/theme";
import { Text } from "./Text";

// The mascot rig the loaders animate: every bone is exported on one 84pt canvas, so pivots are percentages of that box.
export const SIZE = 84;
export const loop = (animationName: object, animationDuration: number, extra?: object) => ({ animationName, animationDuration, animationIterationCount: "infinite" as const, ...extra });
export const blink = loop({ "0%": { transform: [{ scaleY: 1 }] }, "92%": { transform: [{ scaleY: 1 }] }, "95%": { transform: [{ scaleY: 0.1 }] }, "98%": { transform: [{ scaleY: 1 }] } }, 3100);

export const parts = {
  shadow: require("../../assets/loading/mascot/shadow.png"),
  footL: require("../../assets/loading/mascot/foot-l.png"),
  footR: require("../../assets/loading/mascot/foot-r.png"),
  cargo: require("../../assets/loading/mascot/cargo.png"),
  armL: require("../../assets/loading/mascot/arm-l.png"),
  armR: require("../../assets/loading/mascot/arm-r.png"),
  armRGlass: require("../../assets/loading/mascot/arm-r-glass.png"),
  body: require("../../assets/loading/mascot/body.png"),
  eyes: require("../../assets/loading/mascot/eyes.png"),
};

const box = { position: "absolute" as const, top: 0, start: 0, width: SIZE, height: SIZE };

/** One bone of the mascot: a full-size layer that rotates and scales around `origin` ("x% y%" of the box). */
export function Bone({ origin, anim, children }: { origin?: string; anim?: object; children: ReactNode }) {
  const reduced = useReducedMotion();
  return <Animated.View style={[box, { transformOrigin: origin }, !reduced && anim]}>{children}</Animated.View>;
}
/** A bone holding one image; a part with no `anim` stays still. */
export function Part({ part, origin, anim }: { part: keyof typeof parts; origin?: string; anim?: object }) {
  return (
    <Bone origin={origin} anim={anim}>
      <Image source={parts[part]} style={{ width: SIZE, height: SIZE }} />
    </Bone>
  );
}

/** A loader's frame: one labelled progress bar holding a clipped `width`×`height` scene, with `label` shown under it. */
export function MascotScene({ label, width, height, children }: { label: string; width: number; height: number; children: ReactNode }) {
  const { space } = useTheme();
  return (
    <View accessible accessibilityRole="progressbar" accessibilityLabel={label} style={{ alignItems: "center", gap: space[5], paddingVertical: space[10] }}>
      <View style={{ width, height, overflow: "hidden" }}>{children}</View>
      <Text variant="callout" color="labelSecondary" style={{ textAlign: "center" }}>
        {label}
      </Text>
    </View>
  );
}
