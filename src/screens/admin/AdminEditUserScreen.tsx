import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { adminApi, invalidateAdmin, toAdminError, useAdminQuery } from '../../api/admin';
import type { AdminUpdateUserRequest, ApiLang } from '../../api/types';
import { useI18n } from '../../i18n';
import { createRequest } from '../../navigation/results';
import { openSheet } from '../../navigation/sheet';
import type { RootScreenProps } from '../../navigation/types';
import { AppText, Button, ListItem, Section, SkeletonCard, StickyFooter, TextField } from '../../ui';
import { AdminScreen, useAdminContext, withAdmin } from './components/AdminFrame';
import { errorText, USER_CHANGED, useAdminAction } from './components/actions';
import { formStyles, UserHeader } from './components/forms';
import { ErrorState, FlagBox, FormError } from './components/parts';
import { countryName } from './lib/countries';
import { isEmail, LANGUAGE_NAMES } from './lib/settings';

const LANGS: ApiLang[] = ['da', 'de', 'en', 'fi', 'fr', 'hi', 'it', 'ja', 'nb', 'nl', 'sv'];

type Form = { displayName: string; email: string; country: string | null; language: ApiLang | null };

/**
 * Route `AdminEditUser` (backend-spec 2.10 PATCH /admin/users/:id): name, email (accounts only; a
 * new email needs verifying again), country and app language. Only changed fields are sent.
 */
function AdminEditUserForm({ navigation, route }: RootScreenProps<'AdminEditUser'>) {
  const { t } = useI18n();
  const act = useAdminAction();
  const { offline } = useAdminContext();
  const ref = route.params.userId;
  const query = useAdminQuery(`user:${ref}`, () => adminApi.user(ref));
  const [form, setForm] = useState<Form | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof Form, string>>>({});
  const [error, setError] = useState<string | null>(null);
  const detail = query.data;

  if (!detail) {
    return (
      <AdminScreen title={t('admin.edit.title')} presentation="modal" testID="screen-AdminEditUser">
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

  const u = detail.user;
  const initial: Form = { displayName: u.displayName ?? '', email: u.email ?? '', country: u.country, language: u.language };
  const current = form ?? initial;
  const set = (patch: Partial<Form>) => {
    setForm({ ...current, ...patch });
    setFieldErrors({});
    setError(null);
  };

  const body: AdminUpdateUserRequest = {};
  const name = current.displayName.trim().replace(/\s+/g, ' ');
  if (name !== (u.displayName ?? '')) body.displayName = name || null;
  if (u.kind === 'account' && current.email.trim().toLowerCase() !== (u.email ?? '').toLowerCase()) body.email = current.email.trim();
  if (current.country !== u.country) body.country = current.country;
  if (current.language !== u.language) body.language = current.language;
  const changed = Object.keys(body) as (keyof AdminUpdateUserRequest)[];

  const pickCountry = async () => {
    const { requestId, result } = createRequest<string[]>();
    navigation.navigate('CountryPicker', { requestId, selected: current.country ? [current.country] : [], title: t('admin.edit.country') });
    const picked = await result;
    if (picked) set({ country: picked[0] ?? null });
  };

  const pickLanguage = async () => {
    const id = await openSheet({
      title: t('admin.edit.language'),
      options: [
        { id: 'none', label: t('admin.common.notSet'), selected: current.language === null },
        ...LANGS.map((l) => ({ id: l, label: t(LANGUAGE_NAMES[l]), selected: current.language === l })),
      ],
    });
    if (id) set({ language: id === 'none' ? null : (id as ApiLang) });
  };

  const save = () => {
    if (body.email !== undefined && !isEmail(body.email)) {
      setFieldErrors({ email: t('admin.settings.error.email') });
      return;
    }
    if (name.length > 60) {
      setFieldErrors({ displayName: t('admin.edit.nameLong') });
      return;
    }
    void act({
      title: t('admin.edit.confirmTitle', { who: u.email ?? u.publicId }),
      message: t('admin.edit.confirmBody', { fields: changed.map((f) => t(`admin.edit.field.${f}`)).join(', ') }),
      confirmLabel: t('admin.common.save'),
      icon: 'account-edit-outline',
      run: async () => {
        try {
          return await adminApi.updateUser(u.id, body);
        } catch (e) {
          const err = toAdminError(e);
          if (err.code === 'email_taken') setFieldErrors({ email: t('admin.error.emailTaken') });
          else if (err.fields) {
            const next: Partial<Record<keyof Form, string>> = {};
            for (const key of Object.keys(err.fields)) if (key in initial) next[key as keyof Form] = errorText(err, t);
            setFieldErrors(next);
          } else setError(errorText(err, t));
          throw err;
        }
      },
      success: () => t('admin.edit.done'),
      after: () => {
        invalidateAdmin(...USER_CHANGED);
        navigation.goBack();
      },
    });
  };

  return (
    <AdminScreen
      title={t('admin.edit.title')}
      presentation="modal"
      keyboard
      footer={
        <StickyFooter>
          <Button label={t('admin.edit.save')} size="L" block onPress={save} disabled={offline || changed.length === 0 || u.status === 'merged'} testID="admin-edit-save" />
        </StickyFooter>
      }
      testID="screen-AdminEditUser">
      <View style={formStyles.body}>
        <UserHeader detail={detail} />
        <TextField
          label={t('admin.edit.name')}
          value={current.displayName}
          onChangeText={(displayName) => set({ displayName })}
          kind="name"
          placeholder={t('admin.common.notSet')}
          error={fieldErrors.displayName}
          clearable
          testID="admin-edit-name"
        />
        {u.kind === 'account' ? (
          <TextField
            label={t('admin.edit.email')}
            value={current.email}
            onChangeText={(email) => set({ email })}
            kind="email"
            helper={t('admin.edit.emailHelper')}
            error={fieldErrors.email}
            testID="admin-edit-email"
          />
        ) : (
          <AppText variant="bodyS" color="textSecondary">
            {t('admin.edit.guestNoEmail')}
          </AppText>
        )}
        <Section style={styles.flush}>
          <ListItem
            title={t('admin.edit.country')}
            leading={<FlagBox country={current.country} size={32} />}
            leadingWidth={32}
            value={current.country ? countryName(current.country) : t('admin.common.notSet')}
            chevron
            onPress={() => void pickCountry()}
          />
          <ListItem
            icon="translate"
            title={t('admin.edit.language')}
            value={current.language ? t(LANGUAGE_NAMES[current.language]) : t('admin.common.notSet')}
            chevron
            onPress={() => void pickLanguage()}
          />
        </Section>
        <AppText variant="bodyS" color="textTertiary">
          {t('admin.edit.languageHint')}
        </AppText>
      </View>
      <FormError message={error} />
    </AdminScreen>
  );
}

export const AdminEditUserScreen = withAdmin(AdminEditUserForm);

const styles = StyleSheet.create({
  flush: { marginHorizontal: -16 },
});
