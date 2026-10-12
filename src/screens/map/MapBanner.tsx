import { StyleSheet, View } from 'react-native';

import type { Announcement } from '../../api/types';
import { useI18n, type Key } from '../../i18n';
import { formatBytes } from '../../lib/format';
import type { CountryPack } from '../../lib/stations/countries';
import { installPack, usePacks } from '../../lib/stations/packs';
import { ANNOUNCEMENT_TONE, AppText, Banner, Icon, OfflinePill, ProgressBar, useTheme } from '../../ui';
import { nbsp, type MapBannerKind } from './mapLogic';

type Props = {
  kind: MapBannerKind;
  pack: CountryPack | null;
  announcement: Announcement | null;
  onFixBattery: () => void;
  onDismissStopped: () => void;
  onUpdate: () => void;
  onDismissPack: () => void;
  onOpenAnnouncement: (url: string) => void;
  onDismissAnnouncement: () => void;
};

/**
 * The one banner the map shows (3.27, map variant: surface2, the tone only in the icon), chosen by
 * pickBanner(): stopped by the phone, update required, critical announcement, offline, country
 * pack, other announcements, zoom hint.
 */
export function MapBanner({
  kind,
  pack,
  announcement,
  onFixBattery,
  onDismissStopped,
  onUpdate,
  onDismissPack,
  onOpenAnnouncement,
  onDismissAnnouncement,
}: Props) {
  const t = useTheme();
  const { t: tr, lang } = useI18n();
  const packs = usePacks();

  switch (kind) {
    case 'stoppedByPhone':
      return (
        <Banner
          onMap
          tone="warning"
          testID="map-banner-stopped"
          title={tr('trip.phone.title')}
          body={tr('trip.phone.body')}
          action={{ label: tr('trip.phone.fix'), onPress: onFixBattery }}
          onClose={onDismissStopped}
        />
      );
    case 'updateRequired':
      return <Banner onMap tone="info" icon="update" body={tr('map.update.body')} action={{ label: tr('map.update.action'), onPress: onUpdate }} />;
    case 'criticalAnnouncement':
    case 'announcement': {
      if (!announcement) return null;
      const url = announcement.url;
      return (
        <Banner
          onMap
          tone={ANNOUNCEMENT_TONE[announcement.level]}
          icon={announcement.level === 'info' ? 'bullhorn-outline' : undefined}
          title={announcement.title ?? undefined}
          body={announcement.body}
          action={url ? { label: tr('map.announcement.open'), onPress: () => onOpenAnnouncement(url) } : undefined}
          onClose={announcement.dismissible && announcement.level !== 'critical' ? onDismissAnnouncement : undefined}
        />
      );
    }
    case 'offline':
      return <OfflinePill label={tr('map.offline')} />;
    case 'pack': {
      if (!pack) return null;
      const job = packs.jobs[pack.id];
      const entry = packs.available?.find((p) => p.id === pack.id);
      const country = tr(`country.${pack.id}` as Key);
      const title = tr('map.pack.title', { country, size: nbsp(formatBytes(entry?.bytes ?? 0, lang)) });
      if (job) {
        return (
          <View style={[styles.progress, { backgroundColor: t.color.surface2, borderRadius: t.radius.md }, t.elevation(1)]}>
            <AppText variant="labelM">{title}</AppText>
            <ProgressBar progress={job.phase === 'download' ? job.progress : undefined} accessibilityLabel={title} />
            <AppText variant="bodyS" color="textSecondary">
              {job.phase === 'download' ? tr('map.pack.downloading', { percent: Math.floor(job.progress * 100) }) : tr('map.pack.installing')}
            </AppText>
          </View>
        );
      }
      return (
        <Banner
          onMap
          tone="info"
          icon="download-outline"
          testID="map-banner-pack"
          title={title}
          body={tr(packs.failed[pack.id] ? 'map.pack.failed' : 'map.pack.body')}
          action={{ label: tr('map.pack.download'), onPress: () => void installPack(pack.id) }}
          onClose={onDismissPack}
        />
      );
    }
    case 'zoomHint':
      return (
        <View
          accessibilityRole="text"
          style={[styles.hint, { backgroundColor: t.color.surface2, borderRadius: t.radius.pill }, t.elevation(1)]}>
          <Icon name="magnify-plus-outline" size={16} color="textSecondary" />
          <AppText variant="labelM" color="textSecondary">
            {tr('map.zoomHint')}
          </AppText>
        </View>
      );
  }
}

const styles = StyleSheet.create({
  progress: { padding: 16, gap: 8 },
  hint: { alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 32, paddingHorizontal: 12, paddingVertical: 6 },
});
