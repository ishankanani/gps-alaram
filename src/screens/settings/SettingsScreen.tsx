import { useFocusEffect } from '@react-navigation/native';
import { getCalendars } from 'expo-localization';
import { useCallback, useState } from 'react';
import { StyleSheet } from 'react-native';

import { showPrivacyOptions, showRewarded, useAdsOn, useAdsState, useBannerFooter, useReward } from '../../ads';
import { LANGUAGES, useI18n, type Key } from '../../i18n';
import { formatBytes, formatRadius } from '../../lib/format';
import { useRemoteConfig } from '../../api/config';
import { offlineMapAllowed } from '../../lib/plans';
import type { AppearanceChoice } from '../../lib/prefs';
import { usePro } from '../../lib/pro';
import { usePacks } from '../../lib/stations/packs';
import { listAreas } from '../../map/offline';
import { openSheet } from '../../navigation/sheet';
import type { RootScreenProps } from '../../navigation/types';
import { useToast } from '../../state';
import { useSavedData } from '../../state/saved';
import { AppText, Icon, ListItem, Screen, Section } from '../../ui';
import { nbsp, plural } from '../activity/format';
import { formatClock } from '../trip/tripView';
import { openPage, openStoreListing, useAppLinks, versionInfo } from './appLinks';

const APPEARANCE: Record<AppearanceChoice, Key> = {
  system: 'settings.appearance.system',
  light: 'settings.appearance.light',
  dark: 'settings.appearance.dark',
};

/**
 * Settings (ui-direction-a 4.3): grouped sections of rows; every value row opens a sheet or a
 * screen. Alarm reliability and Help & support live in the Account tab (ui-critiques: no second
 * way in), so they are not repeated here.
 */
export function SettingsScreen({ navigation }: RootScreenProps<'Settings'>) {
  const { t: tr, lang } = useI18n();
  const saved = useSavedData();
  const { isPro } = usePro();
  const { proFeatures } = useRemoteConfig();
  const packs = usePacks();
  const links = useAppLinks();
  const prefs = saved.data.preferences;
  const [areas, setAreas] = useState<{ count: number; bytes: number } | null>(null);
  const toast = useToast();
  const adsOn = useAdsOn();
  const adsState = useAdsState();
  const reward = useReward();
  const adFooter = useBannerFooter('settings');
  const [watching, setWatching] = useState(false);

  // Saved map areas, again whenever Settings comes back into view (after OfflineMaps).
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      listAreas()
        .then((list) => {
          if (!cancelled) setAreas({ count: list.length, bytes: list.reduce((sum, a) => sum + a.sizeBytes, 0) });
        })
        .catch(() => {});
      return () => {
        cancelled = true;
      };
    }, []),
  );

  const strength = tr(`strength.${prefs.strength}` as Key);
  const alarmValue = tr('settings.alarmDefaults.value', {
    strength,
    minutes: tr('settings.minutes', { minutes: prefs.minutesBefore }),
    distance: nbsp(formatRadius(prefs.radiusM, prefs.useMiles, lang)),
  });
  const language = LANGUAGES.find((l) => l.code === lang)?.name ?? lang;
  const germany = tr('country.de');
  const countriesValue = packs.installed.length ? tr('settings.countries.value', { country: germany, count: packs.installed.length }) : germany;
  const offlineLocked = !offlineMapAllowed(isPro, proFeatures);
  const offlineValue =
    areas == null || offlineLocked
      ? undefined
      : areas.count === 0
        ? tr('settings.offlineMaps.none')
        : plural(tr, lang, 'settings.offlineMaps.value', areas.count, { size: formatBytes(areas.bytes, lang) });
  const { version, build } = versionInfo();

  async function pickUnits() {
    const choice = await openSheet({
      title: tr('settings.units'),
      options: [
        { id: 'km', label: tr('settings.units.km'), selected: !prefs.useMiles },
        { id: 'mi', label: tr('settings.units.mi'), selected: prefs.useMiles },
      ],
    });
    if (choice) saved.setPreferences((p) => ({ ...p, useMiles: choice === 'mi' }));
  }

  async function pickAppearance() {
    const choice = await openSheet({
      title: tr('settings.appearance'),
      options: (Object.keys(APPEARANCE) as AppearanceChoice[]).map((id) => ({
        id,
        label: tr(APPEARANCE[id]),
        description: id === 'system' ? tr('settings.appearance.systemBody') : undefined,
        selected: prefs.appearance === id,
      })),
    });
    if (choice === 'system' || choice === 'light' || choice === 'dark') saved.setPreferences((p) => ({ ...p, appearance: choice }));
  }

  const clock = (at: number) => formatClock(at, getCalendars()[0]?.uses24hourClock ?? true);

  // The rewarded ad (docs/ads.md): the user chooses to support the app; 24 h without other ads.
  async function watchReward() {
    if (watching) return;
    setWatching(true);
    const result = await showRewarded();
    setWatching(false);
    if (result === 'rewarded') {
      const until = Date.now() + 24 * 3600_000;
      toast.show({ id: 'ads-reward', message: tr('ads.reward.done', { time: clock(until) }), icon: 'heart-outline' });
    } else if (result === 'unavailable') {
      toast.show({ id: 'ads-reward', message: tr('ads.reward.unavailable') });
    }
  }

  const legal = (doc: 'privacy' | 'terms') => {
    const url = doc === 'privacy' ? links.privacyUrl : links.termsUrl;
    if (url) void openPage(url);
    else navigation.navigate('Legal', { doc });
  };

  return (
    <Screen topBar={{ title: tr('settings.title') }} footer={adFooter} testID="screen-Settings">
      <Section title={tr('settings.section.alarm')} first>
        <ListItem
          icon="alarm"
          title={tr('settings.alarmDefaults')}
          value={alarmValue}
          chevron
          onPress={() => navigation.navigate('AlarmDefaults')}
          testID="settings-alarm-defaults"
        />
      </Section>

      <Section title={tr('settings.section.display')}>
        <ListItem
          icon="translate"
          title={tr('settings.language')}
          value={language}
          chevron
          onPress={() => navigation.navigate('Language', { presentation: 'card' })}
          testID="settings-language"
        />
        <ListItem
          icon="ruler"
          title={tr('settings.units')}
          value={tr(prefs.useMiles ? 'settings.units.mi' : 'settings.units.km')}
          chevron
          onPress={() => void pickUnits()}
          testID="settings-units"
        />
        <ListItem
          icon="theme-light-dark"
          title={tr('settings.appearance')}
          value={tr(APPEARANCE[prefs.appearance] ?? APPEARANCE.system)}
          chevron
          onPress={() => void pickAppearance()}
          testID="settings-appearance"
        />
      </Section>

      <Section title={tr('settings.section.maps')}>
        <ListItem
          icon="earth"
          title={tr('settings.countries')}
          value={countriesValue}
          chevron
          onPress={() => navigation.navigate('Countries')}
          testID="settings-countries"
        />
        <ListItem
          icon="map-check-outline"
          title={tr('settings.offlineMaps')}
          value={offlineValue}
          locked={offlineLocked}
          chevron
          onPress={() => navigation.navigate('OfflineMaps')}
          testID="settings-offline-maps"
        />
      </Section>

      {adsOn && (reward.offer || adsState.privacyOptionsRequired) ? (
        <Section title={tr('ads.section')}>
          {reward.offer ? (
            <ListItem
              icon="heart-outline"
              title={tr('ads.reward.title')}
              subtitle={
                reward.adFreeUntil != null
                  ? tr('ads.reward.active', { time: clock(reward.adFreeUntil) })
                  : reward.ready
                    ? tr('ads.reward.body')
                    : tr('ads.reward.loading')
              }
              subtitleLines={2}
              loading={watching}
              disabled={!reward.ready || reward.adFreeUntil != null}
              onPress={() => void watchReward()}
              testID="settings-ads-reward"
            />
          ) : null}
          {adsState.privacyOptionsRequired ? (
            <ListItem
              icon="cookie-outline"
              title={tr('ads.privacy')}
              chevron
              onPress={() => void showPrivacyOptions()}
              testID="settings-ads-privacy"
            />
          ) : null}
        </Section>
      ) : null}

      <Section title={tr('settings.section.legal')}>
        <ListItem
          icon="shield-account-outline"
          title={tr('settings.privacy')}
          trailing={links.privacyUrl ? <OpenIcon /> : undefined}
          chevron={!links.privacyUrl}
          accessibilityHint={links.privacyUrl ? tr('settings.opensBrowser') : undefined}
          onPress={() => legal('privacy')}
          testID="settings-privacy"
        />
        <ListItem
          icon="file-document-outline"
          title={tr('settings.terms')}
          trailing={links.termsUrl ? <OpenIcon /> : undefined}
          chevron={!links.termsUrl}
          accessibilityHint={links.termsUrl ? tr('settings.opensBrowser') : undefined}
          onPress={() => legal('terms')}
          testID="settings-terms"
        />
        <ListItem
          icon="license"
          title={tr('settings.licences')}
          chevron
          onPress={() => navigation.navigate('Licences')}
          testID="settings-licences"
        />
      </Section>

      <Section title={tr('settings.section.about')}>
        <ListItem
          icon="information-outline"
          title={tr('settings.aboutRow')}
          value={build ? `${version} (${build})` : version}
          chevron
          onPress={() => navigation.navigate('About')}
          testID="settings-about"
        />
        <ListItem icon="star-outline" title={tr('settings.rate')} trailing={<OpenIcon />} onPress={() => void openStoreListing()} testID="settings-rate" />
      </Section>

      <AppText variant="bodyS" color="textTertiary" style={styles.footer}>
        {tr('settings.footer')}
      </AppText>
    </Screen>
  );
}

/** Rows that leave the app end in open-in-new instead of a chevron. */
function OpenIcon() {
  return <Icon name="open-in-new" size={20} color="textTertiary" />;
}

const styles = StyleSheet.create({
  footer: { paddingHorizontal: 32, paddingTop: 24 },
});
