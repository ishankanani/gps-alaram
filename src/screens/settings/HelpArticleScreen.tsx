import { StyleSheet, View } from 'react-native';

import { useI18n, type Key } from '../../i18n';
import type { RootScreenProps } from '../../navigation/types';
import { AppText, Card, EmptyState, Screen, useTheme } from '../../ui';

type Article = {
  title: Key;
  intro: Key;
  /** Numbered rules. */
  steps: Key[];
  /** Further paragraphs with a heading. */
  sections: { title: Key; body: Key }[];
};

/** In-app help texts (static, from the README's trigger rules). */
const ARTICLES: Record<string, Article> = {
  'when-it-rings': {
    title: 'settings.article.rings.title',
    intro: 'settings.article.rings.intro',
    steps: [
      'settings.article.rings.rule1',
      'settings.article.rings.rule2',
      'settings.article.rings.rule3',
      'settings.article.rings.rule4',
      'settings.article.rings.rule5',
    ],
    sections: [
      { title: 'settings.article.rings.backstopTitle', body: 'settings.article.rings.backstopBody' },
      { title: 'settings.article.rings.batteryTitle', body: 'settings.article.rings.batteryBody' },
      { title: 'settings.article.rings.safetyTitle', body: 'settings.article.rings.safetyBody' },
    ],
  },
};

/** HelpArticle (ui-direction-a 4.3 Settings › Help): a static in-app text. */
export function HelpArticleScreen({ navigation, route }: RootScreenProps<'HelpArticle'>) {
  const { t: tr } = useI18n();
  const theme = useTheme();
  const article = ARTICLES[route.params.article];

  if (!article) {
    return (
      <Screen topBar={{ title: tr('settings.help.title') }} testID="screen-HelpArticle">
        <EmptyState
          icon="file-question-outline"
          title={tr('settings.article.missing.title')}
          body={tr('settings.article.missing.body')}
          action={{ label: tr('common.back'), onPress: () => navigation.goBack() }}
        />
      </Screen>
    );
  }

  return (
    <Screen topBar={{ title: tr('settings.help.title') }} testID="screen-HelpArticle">
      <View style={styles.body}>
        <AppText variant="titleM">{tr(article.title)}</AppText>
        <AppText variant="bodyL" color="textSecondary">
          {tr(article.intro)}
        </AppText>
        <Card>
          {article.steps.map((step, i) => (
            <View key={step} style={styles.step}>
              <View style={[styles.number, { backgroundColor: theme.color.primarySoft }]}>
                <AppText variant="labelM" color="onPrimarySoft" tabular>
                  {String(i + 1)}
                </AppText>
              </View>
              <AppText variant="bodyM" style={styles.stepText}>
                {tr(step)}
              </AppText>
            </View>
          ))}
        </Card>
        {article.sections.map((section) => (
          <View key={section.title} style={styles.section}>
            <AppText variant="titleS">{tr(section.title)}</AppText>
            <AppText variant="bodyM" color="textSecondary">
              {tr(section.body)}
            </AppText>
          </View>
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: 16, paddingTop: 8, gap: 16 },
  step: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  number: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  stepText: { flex: 1, paddingTop: 4 },
  section: { gap: 4, paddingTop: 8 },
});
