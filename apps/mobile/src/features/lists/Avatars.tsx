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
        borderWidth: size > 24 ? 2 : 1.5,
        borderColor: colors.groupedBg,
        backgroundColor: colors.tintSoft,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text variant={size > 36 ? "headline" : "caption"} color="tint" style={{ fontWeight: "600" }}>
        {initials(name)}
      </Text>
    </View>
  );
}

/** Overlapping member initials, at most `max`. */
export function Avatars({ names, max = 3, size = 32 }: { names: string[]; max?: number; size?: number }) {
  return (
    <View style={{ flexDirection: "row" }} accessibilityLabel={names.join(", ")}>
      {names.slice(0, max).map((n, i) => (
        <View key={`${n}${i}`} style={{ marginStart: i ? -size / 3 : 0 }}>
          <Avatar name={n} size={size} />
        </View>
      ))}
    </View>
  );
}
