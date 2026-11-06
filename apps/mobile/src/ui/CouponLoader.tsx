import { Image } from "expo-image";
import { View } from "react-native";
import Animated, { useReducedMotion } from "react-native-reanimated";
import Svg, { Circle, Line, Path } from "react-native-svg";
import { useTheme } from "@/theme";
import { blink, Bone, loop, MascotScene, Part, parts, SIZE } from "./Mascot";

// One cycle is two digs: the mascot dips into the coupon mountain and pops out leaning left (30%) flinging coupons
// left, then again to the right (80%). CSS keyframes run on the UI thread with no JS state.
export const COUPON_DIG_MS = 1800;
// The beats of one cycle: rest, dip, pop left, rest, dip, pop right, rest.
const BEATS = ["0%", "15%", "30%", "50%", "65%", "80%", "100%"];
const beats = (frames: object[]) => Object.fromEntries(BEATS.map((k, i) => [k, frames[i]]));
const W = 300;
const H = 210;
const CX = W / 2;

// Torso per beat: [drop, lean, stretch].
const torso = loop(
  beats(
    [[0, 0, 1], [14, -4, 0.94], [-8, -8, 1.04], [0, 0, 1], [14, 4, 0.94], [-8, 8, 1.04], [0, 0, 1]].map(([y, r, s]) => ({
      transform: [{ translateY: y }, { rotate: `${r}deg` }, { scaleY: s }],
    })),
  ),
  COUPON_DIG_MS,
);
// Each arm scoops in under the body on its dig and flings up and out on the pop (positive turns the left arm outward).
const arm = (degs: number[]) => loop(beats(degs.map((d) => ({ transform: [{ rotate: `${d}deg` }] }))), COUPON_DIG_MS);
const armL = arm([0, -20, 110, 0, -10, 20, 0]);
const armR = arm([0, 10, -20, 0, 20, -110, 0]);
// Searching: the eyes glance one way, then the other.
const look = loop(
  { "0%": { transform: [{ translateX: 0 }] }, "20%": { transform: [{ translateX: -4 }] }, "45%": { transform: [{ translateX: -4 }] }, "60%": { transform: [{ translateX: 4 }] }, "85%": { transform: [{ translateX: 4 }] }, "100%": { transform: [{ translateX: 0 }] } },
  2600,
);
const jiggle = loop(
  {
    "0%": { transform: [{ scaleX: 1 }, { scaleY: 1 }] },
    "10%": { transform: [{ scaleX: 1 }, { scaleY: 1 }] },
    "18%": { transform: [{ scaleX: 1.03 }, { scaleY: 0.95 }] },
    "28%": { transform: [{ scaleX: 1 }, { scaleY: 1 }] },
    "60%": { transform: [{ scaleX: 1 }, { scaleY: 1 }] },
    "68%": { transform: [{ scaleX: 1.03 }, { scaleY: 0.95 }] },
    "78%": { transform: [{ scaleX: 1 }, { scaleY: 1 }] },
    "100%": { transform: [{ scaleX: 1 }, { scaleY: 1 }] },
  },
  COUPON_DIG_MS,
);

/** A coupon thrown at `launch` (a fraction of the cycle): a parabola `dx` across and `up` high that lands 60pt below its start, spinning `spin`, flown in the first 60% of the cycle. */
function toss(dx: number, up: number, spin: number, launch: number) {
  const frames: Record<string, object> = {};
  for (let i = 0; i <= 10; i++) {
    const p = i / 10;
    frames[`${i * 6}%`] = {
      opacity: p === 0 || p === 1 ? 0 : 1,
      transform: [{ translateX: dx * p }, { translateY: -4 * up * p * (1 - p) + 60 * p * p }, { rotate: `${spin * p}deg` }],
    };
  }
  frames["100%"] = frames["60%"];
  return loop(frames, COUPON_DIG_MS, { animationTimingFunction: "linear", animationDelay: launch * COUPON_DIG_MS });
}
const thrown: { style: object; tone: Tone }[] = [
  { style: toss(-115, 85, -260, 0.3), tone: "filled" },
  { style: toss(-75, 110, 200, 0.32), tone: "soft" },
  { style: toss(-40, 70, -140, 0.34), tone: "outline" },
  { style: toss(45, 75, 160, 0.8), tone: "soft" },
  { style: toss(80, 105, -220, 0.82), tone: "filled" },
  { style: toss(120, 80, 280, 0.84), tone: "outline" },
];

type Tone = "filled" | "soft" | "outline";

// The mountain: [center offset, bottom, rotation, tone], back rows first.
const pile: [number, number, number, Tone][] = [
  [-22, 58, -14, "soft"], [24, 56, 16, "filled"],
  [-52, 44, 10, "outline"], [-16, 46, -6, "filled"], [20, 44, 8, "outline"], [52, 42, -12, "soft"],
  [-42, 28, -18, "filled"], [0, 30, 4, "soft"], [42, 28, 14, "filled"],
  [-64, 14, 8, "soft"], [-22, 14, -10, "outline"], [22, 14, 12, "soft"], [64, 14, -6, "outline"],
  [-86, 0, -4, "filled"], [-44, 0, 6, "soft"], [0, 0, -8, "filled"], [44, 0, 10, "outline"], [86, 0, -14, "soft"],
];

/** A coupon ticket: notched sides, a perforation and a percent sign, in one of three token pairings. */
function Coupon({ tone, width = 48 }: { tone: Tone; width?: number }) {
  const { colors } = useTheme();
  const [fill, mark, edge] = {
    filled: [colors.tint, colors.tintOn, colors.tint],
    soft: [colors.tintSoft, colors.tint, colors.tintSoft],
    outline: [colors.surface, colors.tint, colors.tint],
  }[tone];
  return (
    <Svg width={width} height={(width * 26) / 44} viewBox="-1 -1 46 28">
      <Path
        d="M3 0H41A3 3 0 0 1 44 3V9A4 4 0 0 0 44 17V23A3 3 0 0 1 41 26H3A3 3 0 0 1 0 23V17A4 4 0 0 0 0 9V3A3 3 0 0 1 3 0Z"
        fill={fill}
        stroke={edge}
        strokeWidth={1.2}
      />
      <Line x1={15} y1={4} x2={15} y2={22} stroke={mark} strokeWidth={1.4} strokeDasharray="2.5 2.5" />
      <Circle cx={25.5} cy={8.5} r={2.3} fill={mark} />
      <Circle cx={33.5} cy={17.5} r={2.3} fill={mark} />
      <Line x1={34} y1={7} x2={25} y2={19} stroke={mark} strokeWidth={2.2} strokeLinecap="round" />
    </Svg>
  );
}

/** The mascot digging through a mountain of coupons, for screens that wait on Promotions. `label` is read to assistive tech and shown under the scene. */
export function CouponLoader({ label }: { label: string }) {
  const reduced = useReducedMotion();
  return (
    <MascotScene label={label} width={W} height={H}>
      {/* Thrown coupons sit behind the mascot and the pile, so they come up out of the mountain. */}
      {!reduced &&
        thrown.map((c, i) => (
          <Animated.View key={i} style={[{ position: "absolute", start: CX - 18, bottom: 70, opacity: 0 }, c.style]}>
            <Coupon tone={c.tone} width={36} />
          </Animated.View>
        ))}
      {/* The mascot (84pt rig at 1.25x) stands in the pile; the pile is drawn over its lower half. */}
      <View style={{ position: "absolute", start: CX - SIZE / 2, bottom: 64, width: SIZE, height: SIZE, transform: [{ scale: 1.25 }], transformOrigin: "50% 100%" }}>
        <Bone origin="50% 88%" anim={torso}>
          <Part part="armL" origin="20% 63%" anim={armL} />
          <Part part="armR" origin="80% 63%" anim={armR} />
          <Image source={parts.body} style={{ width: SIZE, height: SIZE }} />
          <Bone origin="50% 50%" anim={look}>
            <Part part="eyes" origin="50% 59%" anim={blink} />
          </Bone>
        </Bone>
      </View>
      <Animated.View style={[{ position: "absolute", start: 0, bottom: 0, width: W, height: 90, transformOrigin: "50% 100%" }, !reduced && jiggle]}>
        {pile.map(([dx, bottom, rotate, tone], i) => (
          <View key={i} style={{ position: "absolute", start: CX + dx - 24, bottom, transform: [{ rotate: `${rotate}deg` }] }}>
            <Coupon tone={tone} />
          </View>
        ))}
      </Animated.View>
    </MascotScene>
  );
}
