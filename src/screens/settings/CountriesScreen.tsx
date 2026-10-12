import { useNetworkState } from 'expo-network';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { deviceRegion } from '../../api';
import { useI18n, type Key } from '../../i18n';
import { formatBytes, formatCount } from '../../lib/format';
import { BUILT_IN_PACK, PACKS, type CountryPack, type Region } from '../../lib/stations/countries';
import { hasUpdate, installPack, packsSupported, refreshAvailable, removePack, usePacks, type PacksState } from '../../lib/stations/packs';
import {
  AppText,
  Banner,
  Button,
  Icon,
  IconButton,
  ListItem,
  ProgressBar,
  Screen,
  Section,
  useDialogs,
  useSkeletonDelay,
  type ColorToken,
} from '../../ui';
import { nbsp, plural } from '../activity/format';
import { countryName } from './countryName';

const REGIONS: Region[] = ['europe', 'americas', 'asiaPacific'];

/** The one pack worth suggesting for the phone's region (not for countries split into several). */
function suggestedPack(packs: PacksState, region: string | null): CountryPack | null {
  if (!region) return null;
  const ofCountry = PACKS.filter((p) => p.country === region.toLowerCase());
  const pack = ofCountry.length === 1 ? ofCountry[0] : null;
  if (!pack || pack.id === BUILT_IN_PACK || packs.jobs[pack.id]) return null;
  if (packs.installed.some((p) => p.id === pack.id)) return null;
  return packs.available?.some((a) => a.id === pack.id) ? pack : null;
}

/**
 * Countries (ui-direction-a 4.3): Germany is built in; the stops of other countries download,
 * update and go again here. Downloads keep running when the screen closes (src/lib/stations/packs).
 */
export function CountriesScreen() {
  const { t: tr, lang } = useI18n();
  const packs = usePacks();
  const dialogs = useDialogs();
  const network = useNetworkState();
  const [region] = useState(deviceRegion);
  const offline = network.isConnected === false || network.isInternetReachable === false;
  const loading = packsSupported && packs.available == null && !packs.availableError;
  const showSkeleton = useSkeletonDelay(loading);

  useEffect(() => {
    void refreshAvailable();
  }, []);

  const germany = countryName(tr, BUILT_IN_PACK);
  const downloaded = packs.installed.reduce((sum, p) => sum + p.dbBytes, 0);
  const summary = packs.installed.length
    ? plural(tr, lang, 'settings.countries.onPhone', packs.installed.length + 1, { size: nbsp(formatBytes(downloaded, lang)) })
    : tr('settings.countries.onPhoneBuiltIn', { country: germany });
  const suggested = suggestedPack(packs, region);

  async function confirmRemove(pack: CountryPack) {
    const country = countryName(tr, pack.id);
    await dialogs.confirm({
      title: tr('settings.countries.removeTitle', { country }),
      message: tr('settings.countries.removeBody'),
      confirmLabel: tr('countries.remove'),
      tone: 'danger',
      icon: 'delete-outline',
      onConfirm: () => removePack(pack.id),
    });
  }

  return (
    <Screen topBar={{ title: tr('countries.title') }} testID="screen-Countries">
      <View style={styles.intro}>
        <AppText variant="bodyM" color="textSecondary">
          {tr('countries.body')}
        </AppText>
        <AppText variant="bodyS" color="textTertiary" tabular>
          {summary}
        </AppText>
      </View>

      {!packsSupported ? (
        <Banner tone="info" body={tr('settings.countries.unsupported')} style={styles.banner} />
      ) : packs.availableError && !packs.available ? (
        <Banner
          tone="danger"
          body={tr('countries.listFailed')}
          action={{ label: tr('countries.retry'), onPress: () => void refreshAvailable() }}
          style={styles.banner}
          testID="countries-list-failed"
        />
      ) : offline ? (
        <Banner tone="neutral" icon="wifi-off" body={tr('settings.countries.offline')} style={styles.banner} />
      ) : null}

      {suggested ? (
        <Section title={tr('settings.countries.suggested')}>
          <CountryRow pack={suggested} packs={packs} onRemove={confirmRemove} suggested />
        </Section>
      ) : null}

      {REGIONS.map((region) => (
        <Section key={region} title={tr(`countries.region.${region}` as Key)} loading={showSkeleton}>
          {PACKS.filter((p) => p.region === region).map((pack) => (
            <CountryRow key={pack.id} pack={pack} packs={packs} onRemove={confirmRemove} />
          ))}
        </Section>
      ))}

      <AppText variant="bodyS" color="textTertiary" style={styles.credit}>
        {tr('countries.credit')}
      </AppText>
    </Screen>
  );
}

type RowProps = {
  pack: CountryPack;
  packs: PacksState;
  onRemove: (pack: CountryPack) => void;
  /** In the Suggested section: a Download button instead of the icon. */
  suggested?: boolean;
};

function CountryRow({ pack, packs, onRemove, suggested }: RowProps) {
  const { t: tr, lang } = useI18n();
  const name = countryName(tr, pack.id);
  const installed = packs.installed.find((p) => p.id === pack.id);
  const available = packs.available?.find((p) => p.id === pack.id);
  const job = packs.jobs[pack.id];
  const builtIn = pack.id === BUILT_IN_PACK;
  const update = hasUpdate(pack.id, packs);
  const failed = !!packs.failed[pack.id];
  const size = (bytes: number) => nbsp(formatBytes(bytes, lang));

  let status: string;
  let tone: ColorToken = 'textSecondary';
  if (builtIn) status = tr('countries.builtIn');
  else if (job?.phase === 'download') status = tr('countries.downloading', { percent: Math.floor(job.progress * 100) });
  else if (job) status = tr('countries.installing');
  else if (failed) {
    status = tr('countries.failed');
    tone = 'danger';
  } else if (update && available) {
    status = tr('countries.update', { size: size(available.bytes) });
    tone = 'primary';
  } else if (installed) status = tr('countries.installed', { count: formatCount(installed.count, lang), size: size(installed.dbBytes) });
  else if (available) status = tr('countries.download', { size: size(available.bytes) });
  else status = tr('countries.notYet');

  const canDownload = packsSupported && !!available && !job && (!installed || update);
  const removable = !!installed && !job && !update;

  let trailing = null;
  if (builtIn) trailing = <Icon name="check-circle" size={24} color="success" />;
  else if (suggested && canDownload)
    trailing = <Button label={tr('settings.countries.download')} variant="secondary" size="S" onPress={() => void installPack(pack.id)} />;
  else if (canDownload) trailing = <Icon name={update ? 'update' : 'download-outline'} size={24} color="primary" />;
  else if (removable)
    trailing = (
      <IconButton
        icon="delete-outline"
        color="textSecondary"
        accessibilityLabel={tr('settings.countries.removeA11y', { country: name })}
        onPress={() => onRemove(pack)}
        testID={`country-remove-${pack.id}`}
      />
    );

  return (
    <ListItem
      title={name}
      leading={
        <View style={styles.flag} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
          <AppText allowFontScaling={false} style={styles.flagText}>
            {pack.flag}
          </AppText>
        </View>
      }
      meta={
        <>
          <AppText variant="bodyS" color={tone} tabular style={styles.status}>
            {status}
          </AppText>
          {job?.phase === 'download' ? <ProgressBar progress={job.progress} style={styles.progress} /> : null}
          {job?.phase === 'install' ? <ProgressBar style={styles.progress} /> : null}
        </>
      }
      loading={!!job}
      trailing={trailing}
      onPress={canDownload && !suggested ? () => void installPack(pack.id) : undefined}
      accessible={!removable && !(suggested && canDownload)}
      accessibilityLabel={`${name}. ${status}`}
      testID={`country-${pack.id}`}
    />
  );
}

const styles = StyleSheet.create({
  intro: { paddingHorizontal: 16, paddingTop: 8, gap: 8 },
  banner: { marginHorizontal: 16, marginTop: 16 },
  flag: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  flagText: { fontSize: 28, lineHeight: 34 },
  status: { flexShrink: 1 },
  progress: { width: '100%', marginTop: 4 },
  credit: { paddingHorizontal: 32, paddingTop: 24 },
});
