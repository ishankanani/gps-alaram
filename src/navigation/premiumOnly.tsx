import type { ComponentType } from 'react';
import { useEffect } from 'react';
import { View } from 'react-native';

import { premiumEnabled } from '../lib/monetization';
import { useTheme } from '../ui/theme';

type Closable = { navigation: { canGoBack: () => boolean; goBack: () => void } };

/** Free for everyone (src/lib/monetization.ts): a link to the Paywall or Redeem just closes again. */
function Closed({ navigation }: Closable) {
  const t = useTheme();
  useEffect(() => {
    if (navigation.canGoBack()) navigation.goBack();
  }, [navigation]);
  return <View style={{ flex: 1, backgroundColor: t.color.bg }} />;
}

/** The screen only while Pro is sold (MONETIZATION_MODE premium). */
export function premiumOnly<P extends Closable>(Screen: ComponentType<P>): ComponentType<P> {
  function PremiumOnly(props: P) {
    return premiumEnabled() ? <Screen {...props} /> : <Closed navigation={props.navigation} />;
  }
  PremiumOnly.displayName = `PremiumOnly(${Screen.displayName ?? Screen.name})`;
  return PremiumOnly;
}
