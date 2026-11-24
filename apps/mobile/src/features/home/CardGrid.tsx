import { useEffect, type ReactElement, type ReactNode } from "react";
import { FlatList, View } from "react-native";
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring } from "react-native-reanimated";
import { springs, useTheme } from "@/theme";

type Props<T> = {
  data: T[];
  keyOf: (item: T) => string;
  render: (item: T) => ReactElement;
  header: ReactElement;
  /** Shown instead of the grid when `data` is empty (loading, error, nothing nearby). */
  empty: ReactNode;
  /** Called a couple of screens before the end, to load the next page. */
  onEndReached?: () => void;
  /** Under the last card (a page that failed to load). */
  footer?: ReactElement | false;
  /** Opt-in: the cards (not the header) fade and rise in on first show and whenever this changes. Omit for no motion; null never plays. */
  enterKey?: string | null;
};

/**
 * The browse grid (DESIGN.md "Card grid"): 2 cards per row with a 12pt gap and 16pt gutters; cards in a row are as tall
 * as the tallest. An odd last card keeps its half width.
 */
export function CardGrid<T>({ data, keyOf, render, header, empty, onEndReached, footer, enterKey }: Props<T>) {
  const { space } = useTheme();
  const reduced = useReducedMotion();
  const enter = useSharedValue(1);
  useEffect(() => {
    if (!enterKey || reduced) return;
    enter.set(0);
    enter.set(withSpring(1, springs.snappy));
  }, [enterKey, reduced, enter]);
  const enterStyle = useAnimatedStyle(() => ({ opacity: enter.get(), transform: [{ translateY: (1 - enter.get()) * 16 }] }));
  const cells: (T | null)[] = data.length % 2 ? [...data, null] : data;
  return (
    <FlatList
      data={cells}
      keyExtractor={(item) => (item === null ? "empty" : keyOf(item))}
      numColumns={2}
      // Each mounted card looks up its image over the network: keep ~2 screens around the visible one, not FlatList's 10.
      initialNumToRender={4}
      maxToRenderPerBatch={4}
      windowSize={5}
      keyboardShouldPersistTaps="handled"
      onEndReached={onEndReached}
      onEndReachedThreshold={2}
      columnWrapperStyle={{ gap: space[4] }}
      contentContainerStyle={{ flexGrow: 1, gap: space[4], paddingHorizontal: space[5], paddingBottom: space[9] }}
      ListHeaderComponent={header}
      ListFooterComponent={footer || undefined}
      ListEmptyComponent={<>{empty}</>}
      renderItem={({ item }) => {
        const card = item === null ? <View style={{ flex: 1 }} /> : render(item);
        return enterKey === undefined ? card : <Animated.View style={[{ flex: 1 }, enterStyle]}>{card}</Animated.View>;
      }}
    />
  );
}
