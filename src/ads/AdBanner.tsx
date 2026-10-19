import { BottomTabBarHeightContext } from '@react-navigation/bottom-tabs';
import { useContext, useState } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { BannerAd, BannerAdSize } from 'react-native-google-mobile-ads';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '../ui/theme';
import { useBannersOn } from './hooks';
import { bannerUnitId, requestOptions } from './runtime';
import type { BannerPlacement } from './rules';

type Props = {
  placement: BannerPlacement;
  /** Pad below the banner: the tab bar's height inside the tabs, else the bottom inset. Default true. */
  spaceBelow?: boolean;
  /** The banner's height as it is drawn (0 while hidden), for screens that lay out around it. */
  onHeight?: (height: number) => void;
  style?: StyleProp<ViewStyle>;
};

/**
 * The anchored adaptive banner at the bottom of Map browse, Saved, Activity and Settings
 * (docs/ads.md). Nothing at all when ads are off, the reward runs or the alarm rings; a failed
 * load collapses to nothing. Never used on Trip, Arrived, Setup, Onboarding or sign-in.
 */
export function AdBanner({ placement, spaceBelow = true, onHeight, style }: Props) {
  const on = useBannersOn();
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const tabBarHeight = useContext(BottomTabBarHeightContext);
  const [failed, setFailed] = useState(false);
  if (!on) return null;
  const below = spaceBelow ? (tabBarHeight ?? insets.bottom) : 0;
  return (
    <View
      testID={`ad-banner-${placement}`}
      onLayout={(e) => onHeight?.(failed ? 0 : e.nativeEvent.layout.height - below)}
      style={[
        failed ? styles.hidden : { backgroundColor: t.color.surface2, borderTopColor: t.color.border, borderTopWidth: StyleSheet.hairlineWidth },
        { paddingBottom: below },
        style,
      ]}>
      <View style={failed ? styles.collapsed : styles.center}>
        <BannerAd
          unitId={bannerUnitId()}
          size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
          requestOptions={requestOptions()}
          onAdLoaded={() => setFailed(false)}
          onAdFailedToLoad={() => setFailed(true)}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center' },
  collapsed: { height: 0, overflow: 'hidden' },
  hidden: {},
});

/**
 * For `<Screen footer>`: the banner while banners are on, else undefined (so the screen keeps
 * its usual bottom padding).
 */
export function useBannerFooter(placement: BannerPlacement) {
  const on = useBannersOn();
  return on ? <AdBanner placement={placement} /> : undefined;
}
