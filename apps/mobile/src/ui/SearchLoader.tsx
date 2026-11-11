import { Image } from "expo-image";
import { View } from "react-native";
import { blink, Bone, loop, MascotScene, Part, parts, SIZE } from "./Mascot";

// One cycle: rest with the glass up, lean left and peer, swing right and peer, hop ("hmm!") and land.
// CSS keyframes run on the UI thread with no JS state. Not mirrored in RTL: it is a character, not layout.
export const SEARCH_MS = 2400;
const BEATS = ["0%", "15%", "35%", "50%", "70%", "80%", "88%", "100%"];
const beats = (frames: object[]) =>
  loop(Object.fromEntries(BEATS.map((k, i) => [k, frames[i]])), SEARCH_MS, { animationTimingFunction: "ease-in-out" });

// Torso per beat: [lean, lift, stretch].
const torso = beats(
  [[0, 0, 1], [-6, 0, 1], [-6, 0, 1], [6, 0, 1], [6, 0, 1], [0, -6, 1.04], [0, 0, 0.96], [0, 0, 1]].map(([r, y, s]) => ({
    transform: [{ translateY: y }, { rotate: `${r}deg` }, { scaleY: s }],
  })),
);
// The glass sweeps up over the head on the left peer and out low on the right one.
const glass = beats([0, -30, -26, 15, 12, -5, 0, 0].map((d) => ({ transform: [{ rotate: `${d}deg` }] })));
// The eyes follow the glass.
const eyes = beats(
  [[1.5, -1], [-2, -1], [-2, -1], [1.5, 0], [1.5, 0], [0, 0], [0, 0], [1.5, -1]].map(([x, y]) => ({ transform: [{ translateX: x }, { translateY: y }] })),
);
// The shadow shrinks and fades under the hop.
const shadow = beats(
  [[1, 1], [1, 1], [1, 1], [1, 1], [1, 1], [0.85, 0.7], [1, 1], [1, 1]].map(([s, o]) => ({ opacity: o, transform: [{ scale: s }] })),
);

const W = 180;
const H = 150;
const SCALE = 128 / SIZE;

/** The mascot looking around with a magnifying glass, for a wait on a lookup. `label` is read to assistive tech and shown under the scene. */
export function SearchLoader({ label }: { label: string }) {
  return (
    <MascotScene label={label} width={W} height={H}>
      {/* The 84pt rig at 128pt, standing on the scene's bottom edge. */}
      <View style={{ position: "absolute", start: (W - SIZE) / 2, bottom: 0, width: SIZE, height: SIZE, transform: [{ scale: SCALE }], transformOrigin: "50% 100%" }}>
        <Part part="shadow" origin="50% 94%" anim={shadow} />
        <Image source={parts.footL} style={{ position: "absolute", width: SIZE, height: SIZE }} />
        <Image source={parts.footR} style={{ position: "absolute", width: SIZE, height: SIZE }} />
        <Bone origin="50% 88%" anim={torso}>
          <Part part="armL" origin="20% 63%" anim={{}} />
          <Part part="armRGlass" origin="80% 63%" anim={glass} />
          <Image source={parts.body} style={{ width: SIZE, height: SIZE }} />
          <Bone origin="50% 50%" anim={eyes}>
            <Part part="eyes" origin="50% 59%" anim={blink} />
          </Bone>
        </Bone>
      </View>
    </MascotScene>
  );
}
