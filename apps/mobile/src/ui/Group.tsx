import { Children, Fragment, isValidElement, useState, type ReactNode } from "react";
import { ScrollView, View, type ViewStyle } from "react-native";
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
  /** Show this many rows and scroll the rest inside the group. */
  maxRows?: number;
  style?: ViewStyle;
};

/** iOS inset group: white rounded block on the grouped background, hairlines between rows, no border or shadow. */
export function Group({ children, title, count, footer, inset, maxRows, style }: GroupProps) {
  const { colors, radius, space } = useTheme();
  const rows = Children.toArray(children);
  // Measured top of the first hidden row: rows vary in height (detail lines, Dynamic Type).
  // Until measured the scroller is 0 tall, not every row tall: a fitToContents sheet would jump to full height and back.
  const [cut, setCut] = useState<number>();
  const scrolls = maxRows !== undefined && rows.length > maxRows;
  const Block = scrolls ? ScrollView : View;
  // A new set of rows (another search) remounts the scroller so it starts at the top, not at the last offset.
  const rowKeys = scrolls ? rows.map((row) => (isValidElement(row) ? row.key : "")).join() : undefined;
  return (
    <View style={style}>
      {title !== undefined && <SectionHeader title={title} count={count} />}
      <Block
        key={rowKeys}
        style={{ backgroundColor: colors.surface, borderRadius: radius.group, overflow: "hidden", maxHeight: scrolls ? (cut ?? 0) : undefined }}
        {...(scrolls && { keyboardShouldPersistTaps: "handled", nestedScrollEnabled: true })}
      >
        {rows.map((row, i) => {
          const body = (
            <>
              {i > 0 && <Divider style={{ marginStart: inset ?? space[5] }} />}
              {row}
            </>
          );
          return scrolls && i === maxRows ? (
            <View key={i} onLayout={(e) => setCut(e.nativeEvent.layout.y)}>
              {body}
            </View>
          ) : (
            <Fragment key={i}>{body}</Fragment>
          );
        })}
      </Block>
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
