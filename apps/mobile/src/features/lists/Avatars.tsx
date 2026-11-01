import { View } from "react-native";
import { useTheme } from "@/theme";
import { Text } from "@/ui";
import { initials } from "./group";

export function Avatar({ name, size = 32 }: { name: string; size?: number }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth: 2,
        borderColor: colors.bg,
        backgroundColor: colors.primarySoft,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text variant={size > 36 ? "headline" : "caption"} color="onPrimarySoft" style={{ fontWeight: "600" }}>
        {initials(name)}
      </Text>
    </View>
  );
}

/** Overlapping member initials, at most `max`. */
export function Avatars({ names, max = 3 }: { names: string[]; max?: number }) {
  return (
    <View style={{ flexDirection: "row" }} accessibilityLabel={names.join(", ")}>
      {names.slice(0, max).map((n, i) => (
        <View key={`${n}${i}`} style={{ marginStart: i ? -10 : 0 }}>
          <Avatar name={n} />
        </View>
      ))}
    </View>
  );
}
