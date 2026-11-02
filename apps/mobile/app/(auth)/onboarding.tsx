import { router } from "expo-router";
import { useState } from "react";
import { I18nManager, useWindowDimensions, View } from "react-native";
import Animated, {
  interpolateColor,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  type SharedValue,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { Illustration } from "@/features/onboarding/Illustration";
import { Taps } from "@/lib/analytics";
import { t, type StringKey } from "@/lib/strings";
import { useTheme } from "@/theme";
import { Button, Screen, Text } from "@/ui";

const SLIDES = [1, 2, 3].map((n) => ({ title: `onboarding.${n}.title` as StringKey, body: `onboarding.${n}.body` as StringKey }));
const N = SLIDES.length;
const RTL = I18nManager.isRTL;

// The pager is forced LTR so offsets mean the same on iOS and Android; in RTL the slides are
// laid out reversed and we start at the far end, which reads right-to-left.
const physical = (logical: number) => (RTL ? N - 1 - logical : logical);

export default function Onboarding() {
  const { width, height } = useWindowDimensions();
  const { space, motion } = useTheme();
  const reduced = useReducedMotion();
  const stage = Math.min(height * 0.5, 440);
  const scrollX = useSharedValue(physical(0) * width);
  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const [index, setIndex] = useState(0);
  const last = index === N - 1;

  const onScroll = useAnimatedScrollHandler({
    onScroll: (e) => scrollX.set(e.contentOffset.x),
    onMomentumEnd: (e) => {
      const p = Math.round(e.contentOffset.x / width);
      scheduleOnRN(setIndex, RTL ? N - 1 - p : p);
    },
  });

  const finish = () => router.push("/sign-in");
  const next = () => {
    if (last) return finish();
    scrollRef.current?.scrollTo({ x: physical(index + 1) * width, animated: !reduced });
    setIndex(index + 1);
  };

  return (
    <Screen style={{ paddingHorizontal: 0 }}>
      <View style={{ alignItems: "flex-end", paddingHorizontal: space[3], minHeight: 50 }}>
        <Animated.View
          pointerEvents={last ? "none" : "auto"}
          accessibilityElementsHidden={last}
          importantForAccessibility={last ? "no-hide-descendants" : "auto"}
          style={{ opacity: last ? 0 : 1, transitionProperty: "opacity", transitionDuration: motion.duration.fast }}
        >
          <Button variant="plain" title={t("common.skip")} analyticsName={Taps.commonSkip} onPress={finish} style={{ paddingHorizontal: space[3] }} />
        </Animated.View>
      </View>

      <View style={{ flex: 1 }}>
        <Animated.ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          bounces={false}
          showsHorizontalScrollIndicator={false}
          contentOffset={{ x: physical(0) * width, y: 0 }}
          onScroll={onScroll}
          scrollEventThrottle={16}
          style={{ direction: "ltr" }}
        >
          {(RTL ? [...SLIDES].reverse() : SLIDES).map((slide) => (
            <View key={slide.title} style={{ width, paddingTop: stage, paddingHorizontal: space[7], gap: space[3] }}>
              <Text variant="title2" accessibilityRole="header" style={{ textAlign: "center" }}>
                {t(slide.title)}
              </Text>
              <Text variant="callout" color="labelSecondary" style={{ textAlign: "center" }}>
                {t(slide.body)}
              </Text>
            </View>
          ))}
        </Animated.ScrollView>
        <Illustration scrollX={scrollX} width={width} height={stage} pages={N} rtl={RTL} />
      </View>

      <View style={{ alignItems: "center", gap: space[6], padding: space[5] }}>
        <View style={{ flexDirection: "row", gap: space[3] }} accessibilityLabel={`${index + 1} / ${N}`} accessible>
          {SLIDES.map((slide, i) => (
            <Dot key={slide.title} i={i} scrollX={scrollX} width={width} />
          ))}
        </View>
        <Button style={{ alignSelf: "stretch" }} title={t(last ? "common.getStarted" : "common.next")} analyticsName={last ? Taps.commonGetStarted : Taps.commonNext} haptic={last} onPress={next} />
      </View>
    </Screen>
  );
}

function Dot({ i, scrollX, width }: { i: number; scrollX: SharedValue<number>; width: number }) {
  const { colors } = useTheme();
  const style = useAnimatedStyle(() => {
    const p = scrollX.get() / width;
    const page = RTL ? N - 1 - p : p;
    const range = [i - 1, i, i + 1];
    return {
      backgroundColor: interpolateColor(page, range, [colors.controlOutline, colors.tint, colors.controlOutline]),
    };
  });
  return <Animated.View style={[{ width: 7, height: 7, borderRadius: 3.5 }, style]} />;
}
