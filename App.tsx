import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useFonts } from 'expo-font';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { AdsController } from './src/ads';
import { startPro } from './src/lib/pro';
import { AppNavigation } from './src/navigation/AppNavigation';
import { AppProviders } from './src/state';
import { useTheme } from './src/ui/theme';

/** The icon font loads at run time; wait for it at most this long so icons never pop in late. */
const ICON_FONT_WAIT_MS = 1000;

/**
 * Inter is embedded at build time (app.json, expo-font plugin), so only the icon font loads here.
 * Everything else lives in the providers (src/state) and the navigators (src/navigation).
 */
export default function App() {
  useEffect(startPro, []);
  const [iconsLoaded, iconsError] = useFonts(MaterialCommunityIcons.font);
  const [waited, setWaited] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setWaited(true), ICON_FONT_WAIT_MS);
    return () => clearTimeout(timer);
  }, []);
  const ready = iconsLoaded || !!iconsError || waited;
  return (
    <AppProviders>
      <AdsController />
      {ready ? <AppNavigation /> : <Blank />}
    </AppProviders>
  );
}

function Blank() {
  const t = useTheme();
  return <View style={{ flex: 1, backgroundColor: t.color.bg }} />;
}
