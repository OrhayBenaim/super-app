import { DrawerActions } from "@react-navigation/native";
import { useNavigation } from "expo-router";
import { Menu } from "lucide-react-native";
import { Taps } from "@/lib/analytics";
import { t } from "@/lib/strings";
import { IconButton } from "@/ui";

/** The only way to open the drawer: it has no swipe, so swiping a List row never opens it. */
export function MenuButton() {
  const navigation = useNavigation();
  return <IconButton icon={Menu} accessibilityLabel={t("drawer.menu")} analyticsName={Taps.drawerMenu} onPress={() => navigation.dispatch(DrawerActions.openDrawer())} />;
}
