import { Image } from "expo-image";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { useReducedMotion } from "react-native-reanimated";
import { useTheme } from "@/theme";
import { Skeleton } from "@/ui";

/**
 * A Product's image for a row's `leading`: a skeleton while `url` is undefined (looking up) or still loading,
 * the image fading in once loaded, nothing when there is none (null) or it fails. Decorative: screen readers skip it.
 */
export function ProductImage({ url }: { url: string | null | undefined }) {
  const { radius, motion } = useTheme();
  const reduced = useReducedMotion();
  // Keyed by URL so a new Product starts over at the skeleton.
  const [settled, setSettled] = useState<{ url: string; ok: boolean } | null>(null);
  const done = settled?.url === url ? settled : null;
  if (url === null || done?.ok === false) return null;
  return (
    <View style={styles.box} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {!done && <Skeleton style={StyleSheet.absoluteFill} />}
      {url && (
        <Image
          source={url}
          accessible={false}
          contentFit="contain"
          transition={reduced ? null : motion.duration.base}
          style={[StyleSheet.absoluteFill, { borderRadius: radius.control }]}
          onLoad={() => setSettled({ url, ok: true })}
          onError={() => setSettled({ url, ok: false })}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({ box: { width: 40, height: 40 } });
