import { TOPICS, type Topic } from "@grocer/shared/contact";
import * as Haptics from "expo-haptics";
import { ChevronDown } from "lucide-react-native";
import { useState } from "react";
import { Platform, View } from "react-native";
import { Host as AndroidHost, DropdownMenu, DropdownMenuItem, RNHostView as AndroidRNHost, Text as AndroidText } from "@expo/ui/jetpack-compose";
import { Host, Menu, RNHostView, Toggle } from "@expo/ui/swift-ui";
import { Taps, trackTap } from "@/lib/analytics";
import { t, type StringKey } from "@/lib/strings";
import { useTheme } from "@/theme";
import { Tap, Text } from "@/ui";

// SF Symbols for the iOS menu: the Lucide icons can't be drawn natively there. Android's menu has no icons (it needs XML vectors).
const SYMBOLS = { general: "bubble.left", bug: "ladybug", improvement: "lightbulb", missingSupermarket: "storefront", missingProduct: "shippingbox" } as const;
const label = (topic: Topic) => t(`contact.topic.${topic}` as StringKey);

/** The Topic pull-down row: "נושא" at the start; the value (or "בחירה") and a chevron at the end. Opens a native menu. */
export function TopicPicker({ value, onChange }: { value: Topic | null; onChange: (topic: Topic) => void }) {
  const { colors, radius, space, size } = useTheme();
  const [open, setOpen] = useState(false);
  const shown = value ? label(value) : t("contact.topic.choose");
  const pick = (topic: Topic) => {
    trackTap(Taps.contactTopicPick, { topic });
    if (topic !== value) Haptics.selectionAsync();
    onChange(topic);
    setOpen(false);
  };
  const row = (
    <View
      accessible
      accessibilityRole="button"
      accessibilityLabel={`${t("contact.topic")}: ${shown}`}
      style={{ flexDirection: "row", alignItems: "center", gap: space[4], minHeight: size.row, paddingHorizontal: space[5], backgroundColor: colors.surface, borderRadius: radius.group }}
    >
      <Text style={{ flex: 1 }}>{t("contact.topic")}</Text>
      <Text color="tint" numberOfLines={1} style={{ flexShrink: 1 }}>
        {shown}
      </Text>
      <ChevronDown size={18} color={colors.tint} strokeWidth={1.75} />
    </View>
  );

  if (Platform.OS === "ios") {
    return (
      <Host matchContents={{ vertical: true }} style={{ alignSelf: "stretch" }}>
        <Menu label={<RNHostView matchContents={{ vertical: true }}>{row}</RNHostView>}>
          {TOPICS.map((topic) => (
            <Toggle key={topic} isOn={topic === value} label={label(topic)} systemImage={SYMBOLS[topic]} onIsOnChange={() => pick(topic)} />
          ))}
        </Menu>
      </Host>
    );
  }
  return (
    <AndroidHost matchContents={{ vertical: true }} style={{ alignSelf: "stretch" }}>
      <DropdownMenu expanded={open} onDismissRequest={() => setOpen(false)}>
        <DropdownMenu.Trigger>
          <AndroidRNHost matchContents={{ vertical: true }}>
            <Tap accessibilityLabel={`${t("contact.topic")}: ${shown}`} analyticsName={Taps.contactTopic} onPress={() => setOpen(true)} scaleTo={1}>
              {row}
            </Tap>
          </AndroidRNHost>
        </DropdownMenu.Trigger>
        <DropdownMenu.Items>
          {TOPICS.map((topic) => (
            <DropdownMenuItem key={topic} onClick={() => pick(topic)}>
              <DropdownMenuItem.Text>
                <AndroidText>{label(topic)}</AndroidText>
              </DropdownMenuItem.Text>
              {topic === value && (
                <DropdownMenuItem.TrailingIcon>
                  <AndroidText>✓</AndroidText>
                </DropdownMenuItem.TrailingIcon>
              )}
            </DropdownMenuItem>
          ))}
        </DropdownMenu.Items>
      </DropdownMenu>
    </AndroidHost>
  );
}
