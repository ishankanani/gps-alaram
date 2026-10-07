import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LANGUAGES, useI18n, type Key, type Lang } from '../i18n';
import { Body, Button, Icon, Label, type IconName } from '../ui/components';
import { KIND_COLOR, radius, useTheme } from '../ui/theme';

type Props = {
  onLanguage: (lang: Lang) => void;
  onDone: () => void;
};

const STEPS: { icon: IconName; color: string; title: Key; body: Key }[] = [
  { icon: 'map-marker-radius', color: KIND_COLOR.ubahn, title: 'onb.how.1.title', body: 'onb.how.1.body' },
  { icon: 'clock-outline', color: KIND_COLOR.sbahn, title: 'onb.how.2.title', body: 'onb.how.2.body' },
  { icon: 'sleep', color: KIND_COLOR.bus, title: 'onb.how.3.title', body: 'onb.how.3.body' },
];

/** First launch: pick a language, see how it works, then the permission setup. */
export function OnboardingScreen({ onLanguage, onDone }: Props) {
  const t = useTheme();
  const { t: tr, lang } = useI18n();
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<0 | 1>(0);

  return (
    <ScrollView
      style={{ backgroundColor: t.background }}
      contentContainerStyle={[styles.root, { paddingTop: insets.top + 32, paddingBottom: insets.bottom + 24 }]}>
      {step === 0 ? (
        <>
          <View style={styles.hero}>
            <View style={[styles.heroRing, { backgroundColor: t.primarySoft }]}>
              <View style={[styles.heroCircle, { backgroundColor: t.primary }]}>
                <Icon name="alarm" size={64} color={t.onPrimary} />
              </View>
              <View style={[styles.heroBadge, styles.heroTrain, { backgroundColor: KIND_COLOR.train }]}>
                <Icon name="train" size={22} color="#FFFFFF" />
              </View>
              <View style={[styles.heroBadge, styles.heroBus, { backgroundColor: KIND_COLOR.bus }]}>
                <Icon name="bus" size={22} color="#FFFFFF" />
              </View>
              <View style={[styles.heroBadge, styles.heroTram, { backgroundColor: KIND_COLOR.tram }]}>
                <Icon name="tram" size={22} color="#FFFFFF" />
              </View>
            </View>
          </View>
          <Text style={[styles.brand, { color: t.primary }]}>{tr('app.name')}</Text>
          <Text style={[styles.headline, { color: t.text }]}>{tr('onb.welcome.title')}</Text>
          <Body muted center>
            {tr('onb.welcome.body')}
          </Body>

          <Label>{tr('onb.language')}</Label>
          <View style={styles.langs}>
            {LANGUAGES.map((l) => {
              const selected = l.code === lang;
              return (
                <Pressable
                  key={l.code}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  onPress={() => onLanguage(l.code)}
                  style={[
                    styles.lang,
                    { backgroundColor: selected ? t.primary : t.surface, borderColor: selected ? t.primary : t.border },
                  ]}>
                  <Text style={[styles.langText, { color: selected ? t.onPrimary : t.text }]}>{l.name}</Text>
                </Pressable>
              );
            })}
          </View>
          <Button title={tr('common.continue')} icon="arrow-right" onPress={() => setStep(1)} />
        </>
      ) : (
        <>
          <Text style={[styles.headline, { color: t.text }]}>{tr('onb.how.title')}</Text>
          {STEPS.map((s, i) => (
            <View key={s.title} style={[styles.step, { backgroundColor: t.surface, borderColor: t.border }]}>
              <View style={[styles.stepIcon, { backgroundColor: s.color }]}>
                <Icon name={s.icon} size={26} color="#FFFFFF" />
              </View>
              <View style={styles.stepText}>
                <Text style={[styles.stepNumber, { color: s.color }]}>{i + 1}</Text>
                <Text style={[styles.stepTitle, { color: t.text }]}>{tr(s.title)}</Text>
                <Body muted>{tr(s.body)}</Body>
              </View>
            </View>
          ))}
          <Button title={tr('onb.ready')} icon="shield-check" onPress={onDone} />
          <Button title={tr('common.back')} kind="ghost" onPress={() => setStep(0)} />
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { padding: 22, gap: 16 },
  hero: { alignItems: 'center', marginBottom: 8 },
  heroRing: { width: 200, height: 200, borderRadius: 100, alignItems: 'center', justifyContent: 'center' },
  heroCircle: { width: 128, height: 128, borderRadius: 64, alignItems: 'center', justifyContent: 'center' },
  heroBadge: {
    position: 'absolute',
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#FFFFFF',
  },
  heroTrain: { top: 14, right: 18 },
  heroBus: { bottom: 18, right: 6 },
  heroTram: { bottom: 26, left: 8 },
  brand: { fontSize: 15, fontWeight: '800', letterSpacing: 2, textTransform: 'uppercase', textAlign: 'center' },
  headline: { fontSize: 32, fontWeight: '900', letterSpacing: -0.8, textAlign: 'center' },
  langs: { flexDirection: 'row', gap: 10 },
  lang: { flex: 1, borderWidth: 2, borderRadius: radius.md, paddingVertical: 14, alignItems: 'center' },
  langText: { fontSize: 17, fontWeight: '700' },
  step: { flexDirection: 'row', gap: 14, padding: 16, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth },
  stepIcon: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  stepText: { flex: 1, gap: 2 },
  stepNumber: { fontSize: 13, fontWeight: '900' },
  stepTitle: { fontSize: 18, fontWeight: '800' },
});
