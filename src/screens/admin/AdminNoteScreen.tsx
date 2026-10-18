import { useState } from 'react';
import { View } from 'react-native';

import { adminApi, invalidateAdmin, useAdminQuery } from '../../api/admin';
import { useI18n } from '../../i18n';
import type { RootScreenProps } from '../../navigation/types';
import { AppText, Button, SkeletonCard, StickyFooter, TextField } from '../../ui';
import { AdminScreen, useAdminContext, withAdmin } from './components/AdminFrame';
import { USER_CHANGED, useAdminAction } from './components/actions';
import { formStyles, UserHeader } from './components/forms';
import { ErrorState } from './components/parts';

const NOTE_MAX = 2000;

/**
 * Route `AdminNote` (backend-spec 2.10 notes): a private note on a user, visible to every admin and
 * never to the user. With noteId it edits that note.
 */
function AdminNoteForm({ navigation, route }: RootScreenProps<'AdminNote'>) {
  const { t } = useI18n();
  const act = useAdminAction();
  const { offline } = useAdminContext();
  const ref = route.params.userId;
  const noteId = route.params.noteId ? Number(route.params.noteId) : null;
  const query = useAdminQuery(`user:${ref}`, () => adminApi.user(ref));
  const [text, setText] = useState<string | null>(null);
  const detail = query.data;

  if (!detail) {
    return (
      <AdminScreen title={noteId ? t('admin.note.editTitle') : t('admin.note.title')} presentation="modal" testID="screen-AdminNote">
        {query.error ? (
          <ErrorState error={query.error} title={t('admin.user.loadFailed')} onRetry={query.reload} onBack={() => navigation.goBack()} />
        ) : (
          <View style={formStyles.body}>
            <SkeletonCard />
          </View>
        )}
      </AdminScreen>
    );
  }

  const existing = noteId ? detail.notes.find((n) => n.id === noteId) : undefined;
  const body = text ?? existing?.body ?? '';
  const trimmed = body.trim();
  const unchanged = existing ? trimmed === existing.body.trim() : false;
  const missing = noteId !== null && !existing;

  const save = () => {
    if (!trimmed || unchanged) return;
    void act({
      title: existing ? t('admin.note.confirmEdit') : t('admin.note.confirmAdd'),
      message: t('admin.note.confirmBody'),
      confirmLabel: t('admin.note.save'),
      icon: 'note-text-outline',
      run: () => (existing ? adminApi.updateNote(existing.id, { body: trimmed }) : adminApi.addNote(detail.user.id, { body: trimmed })),
      success: () => (existing ? t('admin.note.updated') : t('admin.note.added')),
      after: () => {
        invalidateAdmin(...USER_CHANGED);
        navigation.goBack();
      },
    });
  };

  return (
    <AdminScreen
      title={existing ? t('admin.note.editTitle') : t('admin.note.title')}
      presentation="modal"
      keyboard
      footer={
        <StickyFooter helper={t('admin.note.private')}>
          <Button label={t('admin.note.save')} size="L" block onPress={save} disabled={offline || !trimmed || unchanged || missing} testID="admin-note-save" />
        </StickyFooter>
      }
      testID="screen-AdminNote">
      <View style={formStyles.body}>
        <UserHeader detail={detail} />
        {missing ? (
          <AppText variant="bodyM" color="danger">
            {t('admin.note.gone')}
          </AppText>
        ) : (
          <TextField
            label={t('admin.note.label')}
            value={body}
            onChangeText={setText}
            variant="multiline"
            maxLength={NOTE_MAX}
            placeholder={t('admin.note.placeholder')}
            autoFocus={!existing}
            autoCapitalize="sentences"
            testID="admin-note-body"
          />
        )}
      </View>
    </AdminScreen>
  );
}

export const AdminNoteScreen = withAdmin(AdminNoteForm);
