import { View } from "react-native";
import Animated, { useReducedMotion } from "react-native-reanimated";
import { useTheme } from "@/theme";

// Loop with no state change: a CSS animation, on the UI thread. Reduced motion keeps the static block.
const pulse = { from: { opacity: 1 }, to: { opacity: 0.45 } };

function Block({ w, h }: { w: number | `${number}%`; h: number }) {
  const { colors, radius } = useTheme();
  const reduced = useReducedMotion();
  return (
    <Animated.View
      style={{
        width: w,
        height: h,
        borderRadius: radius.xs,
        backgroundColor: colors.skeleton,
        ...(!reduced && {
          animationName: pulse,
          animationDuration: 900,
          animationIterationCount: "infinite",
          animationDirection: "alternate",
          animationTimingFunction: "ease-in-out",
        }),
      }}
    />
  );
}

export function StoreCardSkeleton() {
  const { colors, radius, space } = useTheme();
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ backgroundColor: colors.surface, borderRadius: radius.lg, padding: space[6], gap: space[4] }}
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <View style={{ gap: space[3], flex: 1 }}>
          <Block w="55%" h={18} />
          <Block w="35%" h={14} />
        </View>
        <Block w={84} h={30} />
      </View>
      <Block w="100%" h={4} />
      <View style={{ flexDirection: "row", gap: space[3] }}>
        <View style={{ flex: 1 }}>
          <Block w="100%" h={52} />
        </View>
        <Block w={52} h={52} />
      </View>
    </View>
  );
}
