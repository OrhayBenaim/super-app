import { Children, Fragment, type ReactNode } from "react";
import { View, type ViewStyle } from "react-native";
import { useTheme } from "@/theme";
import { Divider } from "./Divider";
import { Text } from "./Text";

export type GroupProps = {
  children: ReactNode;
  /** Section header above the group, with an optional trailing count. */
  title?: string;
  count?: number;
  footer?: string;
  /** Leading inset of the hairlines between rows (to the text start). */
  inset?: number;
  style?: ViewStyle;
};

/** iOS inset group: white rounded block on the grouped background, hairlines between rows, no border or shadow. */
export function Group({ children, title, count, footer, inset, style }: GroupProps) {
  const { colors, radius, space } = useTheme();
  const rows = Children.toArray(children);
  return (
    <View style={style}>
      {title !== undefined && <SectionHeader title={title} count={count} />}
      <View style={{ backgroundColor: colors.surface, borderRadius: radius.group, overflow: "hidden" }}>
        {rows.map((row, i) => (
          <Fragment key={i}>
            {i > 0 && <Divider style={{ marginStart: inset ?? space[5] }} />}
            {row}
          </Fragment>
        ))}
      </View>
      {footer && (
        <Text variant="footnote" color="labelSecondary" style={{ paddingHorizontal: space[5], paddingTop: space[3] }}>
          {footer}
        </Text>
      )}
    </View>
  );
}

/** Sentence-case 13pt header in Secondary Label with a trailing tabular count. */
export function SectionHeader({ title, count }: { title: string; count?: number }) {
  const { space } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-end", paddingHorizontal: space[5], paddingTop: space[6], paddingBottom: space[3], gap: space[4] }}>
      <Text variant="sectionHeader" color="labelSecondary" accessibilityRole="header" numberOfLines={1} style={{ flex: 1 }}>
        {title}
      </Text>
      {count !== undefined && (
        <Text variant="sectionHeader" color="labelSecondary" tabular>
          {count}
        </Text>
      )}
    </View>
  );
}
