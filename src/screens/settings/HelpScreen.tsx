import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';
import { Linking, Platform } from 'react-native';

import { TripAlarm } from '../../../modules/trip-alarm/src';
import { useI18n } from '../../i18n';
import type { RootScreenProps } from '../../navigation/types';
import { Icon, ListItem, Screen, Section, useToast } from '../../ui';
import { batteryHelpUrl } from '../setup/checklist';
import { openPage, useAppLinks, versionInfo } from './appLinks';

/** The phone's brand and Android version, for the support mail and the battery page. */
function deviceInfo(): { manufacturer: string; android: string } {
  let manufacturer = '';
  try {
    manufacturer = TripAlarm?.getSetupStatus().manufacturer ?? '';
  } catch {
    manufacturer = '';
  }
  return { manufacturer, android: String(Platform.Version) };
}

/**
 * Help & support (ui-direction-a 4.3 Settings): fix an alarm that didn't ring, battery savers by
 * brand, how the alarm decides, and email support with the user's ID in the subject.
 */
export function HelpScreen({ navigation }: RootScreenProps<'Help'>) {
  const { t: tr } = useI18n();
  const toast = useToast();
  const links = useAppLinks();
  const [device] = useState(deviceInfo);

  async function email() {
    const to = links.supportEmail;
    if (!to) return;
    const { version, build } = versionInfo();
    const subject = links.publicId ? tr('settings.help.mailSubject', { id: links.publicId }) : tr('settings.help.mailSubjectNoId');
    const body = `\n\n—\nStopWake ${version}${build ? ` (${build})` : ''} · Android ${device.android}${device.manufacturer ? ` · ${device.manufacturer}` : ''}${links.publicId ? ` · ${links.publicId}` : ''}`;
    const url = `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    try {
      await Linking.openURL(url);
    } catch {
      toast.show({ id: 'no-mail', message: tr('settings.help.noEmailApp', { email: to }) });
    }
  }

  async function copyId() {
    if (!links.publicId) return;
    await Clipboard.setStringAsync(links.publicId).catch(() => {});
    toast.show({ id: 'id-copied', message: tr('settings.help.idCopied'), icon: 'content-copy' });
  }

  return (
    <Screen topBar={{ title: tr('settings.help.title') }} testID="screen-Help">
      <Section title={tr('settings.help.problems')} first>
        <ListItem
          icon="alarm-off"
          title={tr('settings.help.didntRing')}
          subtitle={tr('settings.help.didntRingBody')}
          chevron
          onPress={() => navigation.navigate('Setup', { entry: 'settings' })}
          testID="help-didnt-ring"
        />
        <ListItem
          icon="battery-heart-variant"
          title={tr('settings.help.battery')}
          subtitle={tr('settings.help.batteryBody')}
          subtitleLines={2}
          accessibilityHint={tr('settings.opensBrowser')}
          onPress={() => void openPage(batteryHelpUrl(device.manufacturer))}
          testID="help-battery"
        />
      </Section>

      <Section title={tr('settings.help.learn')}>
        <ListItem
          icon="map-marker-radius-outline"
          title={tr('settings.help.howItRings')}
          titleLines={2}
          chevron
          onPress={() => navigation.navigate('HelpArticle', { article: 'when-it-rings' })}
          testID="help-how-it-rings"
        />
      </Section>

      {links.supportEmail || links.publicId ? (
        <Section title={tr('settings.help.contact')}>
          {links.supportEmail ? (
            <ListItem
              icon="email-outline"
              title={tr('settings.help.email')}
              subtitle={links.supportEmail}
              onPress={() => void email()}
              testID="help-email"
            />
          ) : null}
          {links.publicId ? (
            <ListItem
              icon="card-account-details-outline"
              title={tr('settings.help.yourId')}
              value={links.publicId}
              trailing={<Icon name="content-copy" size={20} color="textTertiary" />}
              onPress={() => void copyId()}
              accessibilityHint={tr('ui.copy')}
              testID="help-id"
            />
          ) : null}
        </Section>
      ) : null}
    </Screen>
  );
}
