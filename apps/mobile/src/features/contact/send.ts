import type { Topic } from "@grocer/shared/contact";
import { nativeApplicationVersion } from "expo-application";
import { Platform } from "react-native";
import { api } from "@/lib/api";
import { ApiError } from "@/lib/api-error";

/** Send stays off until there is a Topic and text that is not just spaces. */
export const canSend = (topic: Topic | null, text: string) => topic !== null && text.trim() !== "";

/** Posts one Contact message; throws what api() throws. */
export const sendContact = (topic: Topic, text: string) =>
  api<void>("api/contact", {
    method: "POST",
    body: JSON.stringify({ topic, text: text.trim(), appVersion: nativeApplicationVersion ?? "unknown", os: Platform.OS }),
  });

/** Which line the page shows under שליחה. */
export const contactError = (e: unknown): "tooMany" | "failed" => (e instanceof ApiError && e.status === 429 ? "tooMany" : "failed");
