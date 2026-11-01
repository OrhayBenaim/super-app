import * as Haptics from "expo-haptics";
import { useEffect, useState } from "react";
import { I18nManager, Pressable, View } from "react-native";
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring } from "react-native-reanimated";
import { t } from "@/lib/strings";
import { springs, useTheme } from "@/theme";
import { Text } from "@/ui";
import type { Sort } from "./sort";

const OPTIONS: Sort[] = ["price", "distance", "coverage"];
const PAD = 2;
// Segments are 44pt tall for the touch target; the pill stays 36pt.
const INSET = 4;

/** Segmented control; the pill slides between segments (spatial consistency: it shows where the selection went). */
export function SortControl({ value, onChange }: { value: Sort; onChange: (s: Sort) => void }) {
  const { colors, radius, shadow } = useTheme();
  const reduced = useReducedMotion();
  const [segW, setSegW] = useState(0);
  const x = useSharedValue(-1);

  useEffect(() => {
    if (!segW) return;
    // RTL flips the row, so flip the travel direction too (same as TabBar).
    const target = (I18nManager.isRTL ? -1 : 1) * OPTIONS.indexOf(value) * segW;
    x.set(reduced || x.get() === -1 ? target : withSpring(target, springs.snappy));
  }, [value, segW, reduced, x]);

  const pill = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }] }));

  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel={t("compare.sortLabel")}
      onLayout={(e) => setSegW((e.nativeEvent.layout.width - PAD * 2) / OPTIONS.length)}
      style={{ flexDirection: "row", padding: PAD, borderRadius: radius.sm, backgroundColor: colors.surfaceSunken }}
    >
      {segW > 0 && (
        <Animated.View
          style={[
            { position: "absolute", top: PAD + INSET, bottom: PAD + INSET, start: PAD, width: segW, borderRadius: radius.sm - PAD, backgroundColor: colors.surfaceRaised },
            shadow.sm,
            pill,
          ]}
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
            onPress={() => {
              if (selected) return;
              Haptics.selectionAsync();
              onChange(o);
            }}
            style={{ flex: 1, minHeight: 44, alignItems: "center", justifyContent: "center" }}
          >
            <Text variant="subhead" color={selected ? "text" : "textSecondary"} style={{ fontWeight: selected ? "600" : "400" }}>
              {t(`compare.sort.${o}`)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
