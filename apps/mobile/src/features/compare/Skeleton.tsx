import { View } from "react-native";
import Animated, { useReducedMotion } from "react-native-reanimated";
import { useTheme } from "@/theme";
import { Group } from "@/ui";

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
        borderRadius: radius.control - 4,
        backgroundColor: colors.fillControl,
        ...(!reduced && { animationName: pulse, animationDuration: 900, animationIterationCount: "infinite", animationDirection: "alternate", animationTimingFunction: "ease-in-out" }),
      }}
    />
  );
}

/** Loading shape of the Best store group and two store rows. Hidden from assistive tech. */
export function CompareSkeleton() {
  const { space, radius } = useTheme();
  const row = (
    <View style={{ flexDirection: "row", justifyContent: "space-between", padding: space[5] }}>
      <View style={{ gap: space[2], width: "45%" }}>
        <Block w="70%" h={14} />
        <Block w="100%" h={12} />
      </View>
      <Block w={70} h={16} />
    </View>
  );
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ gap: space[6], paddingTop: space[4] }}>
      <Group>
        <View style={{ padding: space[5], gap: space[4] }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <View style={{ gap: space[3], width: "45%" }}>
              <Block w="60%" h={18} />
              <Block w="100%" h={14} />
              <Block w="80%" h={14} />
            </View>
            <Block w={140} h={40} />
          </View>
          <Block w="100%" h={50} />
          <View style={{ height: radius.button }} />
        </View>
      </Group>
      <Group>
        {row}
        {row}
      </Group>
    </View>
  );
}
