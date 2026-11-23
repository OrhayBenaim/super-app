import type { ProductType } from "@grocer/shared/product-types";
import { Image } from "expo-image";
import { Camera } from "expo-camera";
import { useFocusEffect, useRouter } from "expo-router";
import { ScanBarcode, SearchX, TriangleAlert } from "lucide-react-native";
import { useCallback, useRef, useState } from "react";
import { Keyboard, View, type TextInputInstance } from "react-native";
import { MenuButton } from "@/features/drawer/MenuButton";
import { fmt } from "@/features/compare/format";
import { RADII, useRadius } from "@/features/compare/api";
import { takeScan } from "@/features/items/scan";
import { Events, Taps, track } from "@/lib/analytics";
import { t } from "@/lib/strings";
import { useTheme } from "@/theme";
import { EmptyState, LargeTitle, Screen, SearchField, Skeleton, Tap, Text } from "@/ui";
import { useProductTypes, type TypeCount } from "./api";
import { CardGrid } from "./CardGrid";
import { typeNameKey } from "./card";
import { LocationBanner, useBrowseLocation } from "./LocationBanner";
import { homeScan, resultsTarget } from "./search";
import { useSearchPanel } from "./useSearchPanel";

// Brand page "Illustration/Product type/*", exported at @2x and @3x.
const ILLUSTRATIONS: Record<ProductType, number> = {
  "dairy-eggs": require("../../../assets/product-types/dairy-eggs.png"),
  "meat-fish": require("../../../assets/product-types/meat-fish.png"),
  produce: require("../../../assets/product-types/produce.png"),
  bakery: require("../../../assets/product-types/bakery.png"),
  drinks: require("../../../assets/product-types/drinks.png"),
  "snacks-sweets": require("../../../assets/product-types/snacks-sweets.png"),
  pantry: require("../../../assets/product-types/pantry.png"),
  frozen: require("../../../assets/product-types/frozen.png"),
  canned: require("../../../assets/product-types/canned.png"),
  "cleaning-home": require("../../../assets/product-types/cleaning-home.png"),
  "personal-care": require("../../../assets/product-types/personal-care.png"),
  baby: require("../../../assets/product-types/baby.png"),
  pets: require("../../../assets/product-types/pets.png"),
  alcohol: require("../../../assets/product-types/alcohol.png"),
  other: require("../../../assets/product-types/other.png"),
};

const CARD_HEIGHT = 132;

function TypeCard({ type, cardCount, onPress }: TypeCount & { onPress: () => void }) {
  const { colors, space, radius } = useTheme();
  const name = t(typeNameKey(type));
  const count = fmt(t("items.group.products"), { n: cardCount });
  return (
    <Tap
      accessibilityLabel={`${name}, ${count}`}
      analyticsName={Taps.homeType}
      onPress={onPress}
      style={{ flex: 1, height: CARD_HEIGHT, justifyContent: "flex-end", backgroundColor: colors.surface, borderRadius: radius.group, padding: space[4] }}
    >
      <Image source={ILLUSTRATIONS[type]} accessible={false} style={{ width: 56, height: 56, marginBottom: space[3] }} />
      <Text variant="headline" numberOfLines={1}>
        {name}
      </Text>
      <Text variant="footnote" color="labelSecondary" numberOfLines={1}>
        {count}
      </Text>
    </Tap>
  );
}

/** Home (the opening route): a card per Product type sold within Compare's radius, in the fixed order with Other last. */
export function HomeScreen() {
  const router = useRouter();
  const { space, colors } = useTheme();
  const { location, coords, radiusKm, off, known } = useBrowseLocation();
  const setRadiusKm = useRadius((s) => s.set);
  const types = useProductTypes(coords, radiusKm, known);
  const data = types.data ?? [];
  const loading = !known || types.isPending;

  const subtitle = loading
    ? t("home.summary.loading")
    : fmt(t(off ? "home.summary.noLocation" : "home.summary"), { n: data.length, km: radiusKm });
  const wider = RADII.find((r) => r > radiusKm);
  const empty = types.isError ? (
    <EmptyState icon={TriangleAlert} title={t("home.error.title")} action={{ title: t("compare.retry"), analyticsName: Taps.homeRetry, onPress: () => types.refetch() }} />
  ) : loading ? (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space[4] }}>
      {[0, 1, 2, 3].map((i) => (
        <Skeleton key={i} style={{ width: "47%", flexGrow: 1, height: CARD_HEIGHT }} />
      ))}
    </View>
  ) : (
    <EmptyState
      icon={SearchX}
      title={fmt(t("home.empty.title"), { km: radiusKm })}
      action={wider ? { title: fmt(t("compare.empty.widen"), { km: wider }), analyticsName: Taps.homeEmptyWiden, onPress: () => setRadiusKm(wider) } : undefined}
    />
  );

  // While the field has text the suggestions take the grid's place; the field stays in the list header so it keeps focus.
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const field = useRef<TextInputInstance>(null);
  const { panel, submitQuery } = useSearchPanel(query, setQuery, "home", (q) => router.push(resultsTarget(q)));
  const suggesting = query !== "";
  // Scanning: ask for the camera on the first tap; the sheet explains a refusal. A found Product opens its page, a name fills the field.
  const scan = async () => {
    Keyboard.dismiss();
    const { granted } = await Camera.requestCameraPermissionsAsync();
    if (!granted) track(Events.itemScanned, { result: "denied", from: "home" });
    router.push({ pathname: "/scan", params: { from: "home" } });
  };
  useFocusEffect(
    useCallback(() => {
      const scanned = takeScan();
      const step = scanned && homeScan(scanned);
      if (step?.go === "push") router.push(step.target);
      else if (step?.go === "fill") setQuery(step.query);
    }, [router]),
  );
  const cancel = () => {
    setQuery("");
    field.current?.blur();
  };

  return (
    <Screen edges={["top"]} style={{ paddingHorizontal: 0 }}>
      <CardGrid
        data={suggesting ? [] : data}
        keyOf={(c) => c.type}
        header={
          <>
            <LargeTitle start={<MenuButton />} title={t("tabs.home")} subtitle={subtitle} />
            <View style={{ flexDirection: "row", alignItems: "center", gap: space[4], paddingBottom: space[3] }}>
              <SearchField
                ref={field}
                label={t("home.search.placeholder")}
                value={query}
                onChangeText={setQuery}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                returnKeyType="search"
                onSubmitEditing={submitQuery}
                containerStyle={{ flex: 1 }}
                trailing={
                  !query && (
                    <Tap accessibilityLabel={t("items.scan")} analyticsName={Taps.homeScan} onPress={scan} hitSlop={8} style={{ width: 28, height: 28, alignItems: "center", justifyContent: "center" }}>
                      <ScanBarcode size={22} color={colors.tint} strokeWidth={1.75} />
                    </Tap>
                  )
                }
              />
              {(focused || suggesting) && (
                <Tap accessibilityLabel={t("common.cancel")} analyticsName={Taps.homeSearchCancel} onPress={cancel} hitSlop={8} style={{ minHeight: 44, justifyContent: "center" }}>
                  <Text color="tint">{t("common.cancel")}</Text>
                </Tap>
              )}
            </View>
            {off && <LocationBanner location={location} />}
          </>
        }
        empty={suggesting ? panel : empty}
        render={(item) => <TypeCard {...item} onPress={() => router.push({ pathname: "/type/[id]", params: { id: item.type } })} />}
      />
    </Screen>
  );
}
