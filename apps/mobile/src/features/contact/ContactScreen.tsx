import { CONTACT_TEXT_MAX, type Topic } from "@grocer/shared/contact";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useState } from "react";
import { I18nManager, TextInput, View } from "react-native";
import { fmt } from "@/features/compare/format";
import { Events, Taps, track } from "@/lib/analytics";
import { t } from "@/lib/strings";
import { text, useTheme } from "@/theme";
import { Button, Screen, SectionHeader, Text } from "@/ui";
import { showContactSent } from "./ContactSentToast";
import { canSend, contactError, sendContact } from "./send";
import { TopicPicker } from "./TopicPicker";

/** Contact us (pushed from the drawer): a Topic, the User's text and שליחה. The draft lives only on this page. */
export function ContactScreen() {
  const router = useRouter();
  const { colors, space, radius } = useTheme();
  const [topic, setTopic] = useState<Topic | null>(null);
  const [message, setMessage] = useState("");
  const send = useMutation({
    mutationFn: ({ topic, message }: { topic: Topic; message: string }) => sendContact(topic, message),
    onSuccess: (_d, { topic }) => {
      track(Events.contactSent, { topic });
      showContactSent();
      router.back();
    },
  });

  return (
    <Screen scroll keyboard edges={["bottom"]} style={{ paddingBottom: space[9] }}>
      <Text variant="largeTitle" accessibilityRole="header">
        {t("contact.title")}
      </Text>
      <Text color="labelSecondary" style={{ paddingTop: space[2], paddingBottom: space[5] }}>
        {t("contact.summary")}
      </Text>
      <TopicPicker value={topic} onChange={setTopic} />
      <SectionHeader title={t("contact.message")} />
      <View style={{ backgroundColor: colors.surface, borderRadius: radius.group, paddingHorizontal: space[5], paddingVertical: space[4], minHeight: 168 }}>
        <TextInput
          accessibilityLabel={t("contact.message")}
          multiline
          maxLength={CONTACT_TEXT_MAX}
          value={message}
          onChangeText={setMessage}
          placeholder={t("contact.placeholder")}
          placeholderTextColor={colors.labelSecondary}
          selectionColor={colors.tint}
          textAlignVertical="top"
          style={[text("body"), { flex: 1, minHeight: 168 - space[4] * 2, color: colors.label, textAlign: I18nManager.isRTL ? "right" : "left" }]}
        />
      </View>
      <View style={{ flexDirection: "row", gap: space[4], paddingHorizontal: space[5], paddingTop: space[3] }}>
        <Text variant="footnote" color="labelSecondary" style={{ flex: 1 }}>
          {t("contact.attached")}
        </Text>
        <Text variant="footnote" color="labelSecondary" tabular accessibilityLabel={fmt(t("contact.counter"), { n: message.length, max: CONTACT_TEXT_MAX })}>
          {message.length}/{CONTACT_TEXT_MAX}
        </Text>
      </View>
      <Button
        title={t("contact.send")}
        analyticsName={Taps.contactSend}
        disabled={!canSend(topic, message)}
        loading={send.isPending}
        onPress={() => topic && send.mutate({ topic, message })}
        style={{ marginTop: space[6] }}
      />
      {send.isError && (
        <Text variant="footnote" color="danger" accessibilityLiveRegion="polite" style={{ paddingHorizontal: space[5], paddingTop: space[3] }}>
          {t(`contact.${contactError(send.error)}`)}
        </Text>
      )}
    </Screen>
  );
}
