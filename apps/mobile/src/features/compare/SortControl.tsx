import * as Haptics from "expo-haptics";
import { useEffect, useState } from "react";
import { I18nManager, Pressable, View } from "react-native";
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring } from "react-native-reanimated";
import { track } from "@/lib/analytics";
import { t } from "@/lib/strings";
import { springs, useTheme } from "@/theme";
import { Text } from "@/ui";
import type { Sort } from "./sort";

const OPTIONS: Sort[] = ["price", "distance", "coverage"];
const PAD = 2;

/** iOS segmented control (32pt, vertical hit slop to 44pt); the thumb slides between segments. */
export function SortControl({ value, onChange }: { value: Sort; onChange: (s: Sort) => void }) {
  const { colors, radius, shadow, size } = useTheme();
  const reduced = useReducedMotion();
  const [segW, setSegW] = useState(0);
  const x = useSharedValue(-1);

  useEffect(() => {
    if (!segW) return;
    // RTL flips the row, so flip the travel direction too.
    const target = (I18nManager.isRTL ? -1 : 1) * OPTIONS.indexOf(value) * segW;
    x.set(reduced || x.get() === -1 ? target : withSpring(target, springs.snappy));
  }, [value, segW, reduced, x]);

  const thumb = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }] }));
  const slop = (size.target - size.segmented) / 2;

  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel={t("compare.sortLabel")}
      onLayout={(e) => setSegW((e.nativeEvent.layout.width - PAD * 2) / OPTIONS.length)}
      style={{ flexDirection: "row", height: size.segmented, padding: PAD, borderRadius: radius.control - 1, backgroundColor: colors.fillControl }}
    >
      {segW > 0 && (
        <Animated.View
          style={[{ position: "absolute", top: PAD, bottom: PAD, start: PAD, width: segW, borderRadius: radius.control - 3, backgroundColor: colors.fillSelected }, shadow.thumb, thumb]}
        />
      )}
      {OPTIONS.map((o) => {
        const selected = o === value;
        return (
          <Pressable
            key={o}
            accessibilityRole="tab"
            accessibilityLabel={t(`compare.sort.${o}`)}
            accessibilityState={{ selected }}
            hitSlop={{ top: slop, bottom: slop }}
            onPress={() => {
              track("tap", { name: `compare.sort.${o}` });
              if (selected) return;
              Haptics.selectionAsync();
              onChange(o);
            }}
            style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
          >
            <Text variant="subhead" style={{ fontWeight: selected ? "600" : "400" }}>
              {t(`compare.sort.${o}`)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
