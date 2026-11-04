import type { ReactElement, ReactNode } from "react";
import { FlatList, View } from "react-native";
import { useTheme } from "@/theme";

type Props<T> = {
  data: T[];
  keyOf: (item: T) => string;
  render: (item: T) => ReactElement;
  header: ReactElement;
  /** Shown instead of the grid when `data` is empty (loading, error, nothing nearby). */
  empty: ReactNode;
};

/**
 * The browse grid (DESIGN.md "Card grid"): 2 cards per row with a 12pt gap and 16pt gutters; cards in a row are as tall
 * as the tallest. An odd last card keeps its half width.
 */
export function CardGrid<T>({ data, keyOf, render, header, empty }: Props<T>) {
  const { space } = useTheme();
  const cells: (T | null)[] = data.length % 2 ? [...data, null] : data;
  return (
    <FlatList
      data={cells}
      keyExtractor={(item) => (item === null ? "empty" : keyOf(item))}
      numColumns={2}
      columnWrapperStyle={{ gap: space[4] }}
      contentContainerStyle={{ flexGrow: 1, gap: space[4], paddingHorizontal: space[5], paddingBottom: space[9] }}
      ListHeaderComponent={header}
      ListEmptyComponent={<>{empty}</>}
      renderItem={({ item }) => (item === null ? <View style={{ flex: 1 }} /> : render(item))}
    />
  );
}
