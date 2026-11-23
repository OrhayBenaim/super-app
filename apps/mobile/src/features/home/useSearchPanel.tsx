import { router } from "expo-router";
import { Search } from "lucide-react-native";
import type { ReactNode } from "react";
import { fmt } from "@/features/compare/format";
import { SearchingRow, suggestionRows } from "@/features/items/SuggestionRows";
import { useProductSearch } from "@/features/items/products";
import { Events, Taps, track } from "@/lib/analytics";
import { t } from "@/lib/strings";
import { useTheme } from "@/theme";
import { Group, Row } from "@/ui";
import { homeSuggestions, searchRow, suggestionTarget } from "./search";

/**
 * What sits under Home's and Search results' search field while it has text: the Product group and Product suggestions
 * (a tap opens a page and adds nothing) and the search row. `submit` is what the row and Return both do.
 */
export function useSearchPanel(query: string, setQuery: (q: string) => void, from: "home" | "results", submit: (q: string) => void): { panel: ReactNode; submitQuery: () => void } {
  const { colors } = useTheme();
  const search = useProductSearch(query);
  const { groups, products } = homeSuggestions(query, search.data);
  const open = (row: Parameters<typeof suggestionTarget>[0]) => router.push(suggestionTarget(row));
  const q = searchRow(query);
  const submitQuery = () => {
    if (!q) return;
    track(Events.searchSubmitted, { from });
    submit(q);
  };
  const rows = suggestionRows({
    groups,
    products,
    productLabel: "home.suggest.open",
    groupAnalyticsName: Taps.homeSuggestGroup,
    productAnalyticsName: Taps.homeSuggestProduct,
    onGroup: open,
    onProduct: open,
    onRefine: (word) => setQuery(`${query.trim()} ${word}`),
  });
  const panel =
    groups.length + products.length > 0 || q ? (
      <Group>
        {rows}
        {q && (
          <Row
            title={fmt(t("home.search.row"), { name: q })}
            titleColor="tint"
            accessibilityRole="button"
            analyticsName={Taps.homeSearchRow}
            trailing={<Search size={20} color={colors.tint} strokeWidth={2} />}
            onPress={submitQuery}
          />
        )}
      </Group>
    ) : search.isFetching ? (
      <SearchingRow />
    ) : null;
  return { panel, submitQuery };
}
