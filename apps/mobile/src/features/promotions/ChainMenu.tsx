import * as Haptics from "expo-haptics";
import { Check, ChevronDown } from "lucide-react-native";
import { useState } from "react";
import { Modal, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Taps } from "@/lib/analytics";
import { t } from "@/lib/strings";
import { useTheme } from "@/theme";
import { Tap, Text } from "@/ui";
import type { Chain } from "./api";

/**
 * The Chain filter in the nav bar ("כל הרשתות ⌄", or the picked Chain): a menu under it lists "All chains" and every
 * Chain, the picked one checked. Tapping outside closes it.
 */
export function ChainMenu({ chains, value, onChange }: { chains: Chain[]; value: string | null; onChange: (chain: string | null) => void }) {
  const { colors, space, size, radius, shadow } = useTheme();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const current = chains.find((c) => c.id === value);
  const label = current ? current.name : t("promotions.allChains");
  const options: [string | null, string][] = [[null, t("promotions.allChains")], ...chains.map((c): [string, string] => [c.id, c.name])];
  const pick = (id: string | null) => {
    setOpen(false);
    if (id === value) return;
    Haptics.selectionAsync();
    onChange(id);
  };
  return (
    <>
      <Tap
        accessibilityLabel={`${t("promotions.chainFilter")}: ${label}`}
        accessibilityState={{ expanded: open }}
        analyticsName={Taps.promotionsChain}
        onPress={() => setOpen(true)}
        hitSlop={8}
        style={{ flexDirection: "row", alignItems: "center", gap: space[1], minHeight: size.target, flexShrink: 1 }}
      >
        <ChevronDown size={18} color={colors.tint} strokeWidth={1.75} />
        <Text color="tint" numberOfLines={1} style={{ flexShrink: 1 }}>
          {label}
        </Text>
      </Tap>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Tap accessibilityLabel={t("drawer.close")} analyticsName={Taps.promotionsChainClose} onPress={() => setOpen(false)} scaleTo={1} style={StyleSheet.absoluteFill} />
        <View pointerEvents="box-none" style={{ alignItems: "flex-end", paddingTop: insets.top + size.target, paddingHorizontal: space[5] }}>
          <ScrollView
            accessibilityRole="menu"
            style={{ width: 250, maxHeight: 420, backgroundColor: colors.elevated, borderRadius: radius.group, ...shadow.thumb }}
            contentContainerStyle={{ paddingVertical: space[2] }}
          >
            {options.map(([id, name], i) => (
              <Tap
                key={id ?? "all"}
                accessibilityRole="menuitem"
                accessibilityLabel={name}
                accessibilityState={{ selected: id === value }}
                analyticsName={Taps.promotionsChainPick}
                onPress={() => pick(id)}
                scaleTo={1}
                style={{
                  flexDirection: "row", alignItems: "center", gap: space[3], minHeight: size.target, paddingHorizontal: space[5],
                  borderTopWidth: i ? StyleSheet.hairlineWidth : 0, borderTopColor: colors.separator,
                }}
              >
                <Text numberOfLines={1} style={{ flex: 1 }}>
                  {name}
                </Text>
                {id === value && <Check size={18} color={colors.tint} strokeWidth={1.75} />}
              </Tap>
            ))}
          </ScrollView>
        </View>
      </Modal>
    </>
  );
}
