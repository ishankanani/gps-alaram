import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useRef, useState, type ReactNode } from 'react';
import {
  BackHandler,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LANGUAGES, useI18n } from '../../i18n';
import type { RootScreenProps } from '../../navigation/types';
import { useSavedData } from '../../state/saved';
import { AppText, Button, Chip, StickyFooter, useTheme } from '../../ui';
import { RouteIllustration, StopIllustration } from './Illustrations';

type Page = { title: string; body: string; illustration: ReactNode; label: string };

/**
 * Onboarding (ui-direction-a 4.3, first launch only), cut to two pages as ui-critiques asks; the
 * "rings on silent" page is folded into page 2. A language chip on top (it opens Language as a
 * modal), Skip, page dots, and Continue. Finishing lands on the map with Get ready on top.
 */
export function OnboardingScreen({ navigation }: RootScreenProps<'Onboarding'>) {
  const t = useTheme();
  const { t: tr, lang } = useI18n();
  const saved = useSavedData();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const scroll = useRef<ScrollView>(null);
  const [page, setPage] = useState(0);
  // A horizontal pager doesn't stretch its pages vertically: they get its measured height.
  const [pagerHeight, setPagerHeight] = useState(0);

  const pages: Page[] = [
    { title: tr('onb.welcome.title'), body: tr('onb.welcome.body'), illustration: <RouteIllustration />, label: tr('onboarding.illustration.route') },
    { title: tr('onboarding.page2.title'), body: tr('onboarding.page2.body'), illustration: <StopIllustration />, label: tr('onboarding.illustration.stop') },
  ];
  const last = page === pages.length - 1;
  const language = LANGUAGES.find((l) => l.code === lang)?.name ?? lang;

  const goTo = useCallback(
    (index: number) => {
      scroll.current?.scrollTo({ x: index * width, animated: !t.reduceMotion });
      setPage(index);
    },
    [width, t.reduceMotion],
  );

  // Android back goes to the previous page; on the first page it leaves the app as usual.
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        if (page === 0) return false;
        goTo(page - 1);
        return true;
      });
      return () => sub.remove();
    }, [page, goTo]),
  );

  function finish() {
    saved.setPreferences((p) => ({ ...p, onboarded: true }));
    navigation.reset({ index: 1, routes: [{ name: 'Tabs' }, { name: 'Setup', params: { entry: 'onboarding' } }] });
  }

  function onScrollEnd(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const index = Math.round(e.nativeEvent.contentOffset.x / Math.max(1, width));
    if (index !== page) setPage(Math.max(0, Math.min(pages.length - 1, index)));
  }

  return (
    <View testID="screen-Onboarding" style={[styles.root, { backgroundColor: t.color.bg, paddingTop: insets.top }]}>
      <View style={styles.topRow}>
        <Chip
          variant="assist"
          icon="translate"
          label={language}
          onPress={() => navigation.navigate('Language', { presentation: 'modal' })}
          accessibilityLabel={tr('onboarding.language', { language })}
          testID="onboarding-language"
        />
        {!last ? <Button label={tr('common.skip')} variant="ghost" size="S" onPress={finish} testID="onboarding-skip" /> : null}
      </View>

      <ScrollView
        ref={scroll}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScrollEnd}
        onLayout={(e) => setPagerHeight(e.nativeEvent.layout.height)}
        style={styles.pager}>
        {pages.map((p, i) => (
          <View
            key={p.title}
            style={[styles.page, { width, height: pagerHeight || undefined }]}
            importantForAccessibility={i === page ? 'auto' : 'no-hide-descendants'}
            accessibilityElementsHidden={i !== page}>
            <View
              accessible
              accessibilityRole="image"
              accessibilityLabel={p.label}
              style={[
                styles.panel,
                {
                  maxHeight: Math.round(height * 0.46),
                  backgroundColor: t.dark ? t.color.surface1 : t.color.primarySoft,
                  borderRadius: t.radius.xl,
                },
              ]}>
              <View pointerEvents="none" importantForAccessibility="no-hide-descendants" accessibilityElementsHidden style={styles.panelContent}>
                {p.illustration}
              </View>
            </View>
            <View style={styles.text}>
              <AppText variant="display" numberOfLines={3}>
                {p.title}
              </AppText>
              <AppText variant="bodyL" color="textSecondary">
                {p.body}
              </AppText>
            </View>
          </View>
        ))}
      </ScrollView>

      <View style={styles.dots} accessible accessibilityLabel={tr('onboarding.page', { page: page + 1, count: pages.length })}>
        {pages.map((p, i) => (
          <View
            key={p.title}
            style={[styles.dot, i === page ? styles.dotActive : null, { backgroundColor: i === page ? t.color.primary : t.color.fill }]}
          />
        ))}
      </View>

      <StickyFooter divider={false} style={{ backgroundColor: t.color.bg }}>
        <Button
          label={last ? tr('onboarding.setUp') : tr('common.continue')}
          block
          onPress={() => (last ? finish() : goTo(page + 1))}
          testID="onboarding-continue"
        />
      </StickyFooter>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  topRow: { minHeight: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 16, paddingRight: 8 },
  pager: { flex: 1 },
  page: { flex: 1 },
  panel: { flex: 1, minHeight: 160, marginHorizontal: 16, overflow: 'hidden' },
  panelContent: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  text: { paddingHorizontal: 24, paddingTop: 24, gap: 8 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, paddingVertical: 12 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  dotActive: { width: 24 },
});
