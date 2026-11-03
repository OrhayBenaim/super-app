import { Bell, ChartColumn, Plus, Share, type LucideIcon } from "lucide-react-native";
import type { ComponentType } from "react";
import { View } from "react-native";
import { fmt } from "@/features/compare/format";
import { t } from "@/lib/strings";
import { useTheme } from "@/theme";
import { Text } from "@/ui";
import { AddItem, Cheapest, GoNearby, Hello, ShareList, type StageProps } from "./Illustration";

type Tip = { icon: LucideIcon; text: string };
export type Slide = { title: string; body: string; tip?: Tip; Stage: ComponentType<StageProps> };

// Each tip says where the feature lives, with the real tab and setting names.
export const SLIDES: Slide[] = [
  { title: t("onboarding.1.title"), body: t("onboarding.1.body"), Stage: Hello },
  { title: t("onboarding.2.title"), body: t("onboarding.2.body"), tip: { icon: Plus, text: t("onboarding.2.tip") }, Stage: AddItem },
  { title: t("onboarding.3.title"), body: t("onboarding.3.body"), tip: { icon: Share, text: t("onboarding.3.tip") }, Stage: ShareList },
  { title: t("onboarding.4.title"), body: t("onboarding.4.body"), tip: { icon: ChartColumn, text: fmt(t("onboarding.4.tip"), { tab: t("tabs.compare") }) }, Stage: Cheapest },
  { title: t("onboarding.5.title"), body: t("onboarding.5.body"), tip: { icon: Bell, text: fmt(t("onboarding.5.tip"), { setting: t("settings.nearby") }) }, Stage: GoNearby },
];

/** Where to find the feature later: an icon in a tint-soft circle and one line of footnote. */
export function SlideTip({ icon: Icon, text }: Tip) {
  const { colors, space, radius } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space[4], marginTop: space[3], paddingHorizontal: space[4], paddingVertical: 10, borderRadius: radius.group, backgroundColor: colors.surface }}>
      <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.tintSoft, alignItems: "center", justifyContent: "center" }}>
        <Icon size={18} color={colors.tint} strokeWidth={1.75} />
      </View>
      <Text variant="footnote" color="labelSecondary" style={{ flex: 1 }}>
        {text}
      </Text>
    </View>
  );
}
