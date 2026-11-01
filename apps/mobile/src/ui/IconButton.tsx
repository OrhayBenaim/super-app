import type { LucideIcon } from "lucide-react-native";
import { tokens, useTheme, type ColorName } from "@/theme";
import { Tap, type TapProps } from "./Tap";

export type IconButtonProps = Omit<TapProps, "children"> & { icon: LucideIcon; size?: number; color?: ColorName };

/** 44pt square, icon centered. accessibilityLabel is required. */
export function IconButton({ icon: Icon, size = 22, color = "tint", style, ...rest }: IconButtonProps) {
  const { colors } = useTheme();
  const box = tokens.size.target;
  return (
    <Tap scaleTo={0.9} style={[{ width: box, height: box, alignItems: "center", justifyContent: "center" }, style]} {...rest}>
      <Icon size={size} color={colors[color]} />
    </Tap>
  );
}
