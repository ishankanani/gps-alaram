import type { ReactNode } from 'react';

import { useI18n } from '../i18n';
import { EmptyState } from '../ui/components/EmptyState';
import { Screen } from '../ui/components/Screen';

type Props = {
  /** Tab roots get a LargeHeader with this title; other screens a TopBar. */
  title?: string;
  /** card: back arrow; modal: close; tab: a LargeHeader. */
  presentation?: 'card' | 'modal' | 'tab';
  /** Admin screens carry the "Admin" badge. */
  admin?: boolean;
  /** Extra content under the notice (the Account placeholder keeps its links here). */
  children?: ReactNode;
  testID: string;
};

/**
 * A route whose screen a later package builds (build-plan.md). It says "Coming soon" and keeps
 * the way back, so a build made now never dead-ends.
 */
export function PlaceholderScreen({ title, presentation = 'card', admin, children, testID }: Props) {
  const { t: tr } = useI18n();
  const notice = <EmptyState icon="progress-wrench" title={tr('nav.soon.title')} body={tr('nav.soon.body')} />;
  if (presentation === 'tab') {
    return (
      <Screen largeTitle={title} testID={testID}>
        {children}
        {notice}
      </Screen>
    );
  }
  return (
    <Screen topBar={{ title, leading: presentation === 'modal' ? 'close' : 'back', admin }} testID={testID}>
      {children}
      {notice}
    </Screen>
  );
}
