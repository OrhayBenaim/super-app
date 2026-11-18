import { CONTACT_TEXT_MAX, type Topic } from "@grocer/shared/contact";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { fmt } from "@/features/compare/format";
import { Events, Taps, track } from "@/lib/analytics";
import { t } from "@/lib/strings";
import { useTheme } from "@/theme";
import { Button, Group, Screen, SectionHeader, Text, TextField } from "@/ui";
import { showContactSent } from "./ContactSentToast";
import { canSend, contactError, sendContact } from "./send";
import { TopicPicker } from "./TopicPicker";

/** Contact us (pushed from the drawer): a Topic, the User's text and שליחה. The draft lives only on this page. */
export function ContactScreen() {
  const router = useRouter();
  const { space, size } = useTheme();
  const [topic, setTopic] = useState<Topic | null>(null);
  const [text, setText] = useState("");
  const send = useMutation({
    mutationFn: ({ topic, text }: { topic: Topic; text: string }) => sendContact(topic, text),
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
      <Group>
        <TextField
          label={t("contact.message")}
          placeholder={t("contact.placeholder")}
          multiline
          maxLength={CONTACT_TEXT_MAX}
          value={text}
          onChangeText={setText}
          textAlignVertical="top"
          style={{ minHeight: size.row * 3 }}
        />
      </Group>
      <View style={{ flexDirection: "row", gap: space[4], paddingHorizontal: space[5], paddingTop: space[3] }}>
        <Text variant="footnote" color="labelSecondary" style={{ flex: 1 }}>
          {t("contact.attached")}
        </Text>
        <Text variant="footnote" color="labelSecondary" tabular accessibilityLabel={fmt(t("contact.counter"), { n: text.length, max: CONTACT_TEXT_MAX })}>
          {text.length}/{CONTACT_TEXT_MAX}
        </Text>
      </View>
      <Button
        title={t("contact.send")}
        analyticsName={Taps.contactSend}
        disabled={!canSend(topic, text)}
        loading={send.isPending}
        onPress={() => topic && send.mutate({ topic, text })}
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
