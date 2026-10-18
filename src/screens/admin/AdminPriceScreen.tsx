import { useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { adminApi, invalidateAdmin, refreshConfigAfterAdminSave, useAdminQuery } from '../../api/admin';
import type { AdminPriceRow, PriceFormat, PriceRow } from '../../api/types';
import { useI18n } from '../../i18n';
import { createRequest } from '../../navigation/results';
import type { RootScreenProps } from '../../navigation/types';
import {
  AppText,
  Banner,
  Button,
  Card,
  Chip,
  ChipRow,
  ChipWrap,
  Icon,
  ListItem,
  Section,
  SegmentedControl,
  SkeletonCard,
  StickyFooter,
  SwitchRow,
  TextField,
} from '../../ui';
import { AdminScreen, useAdminContext, withAdmin } from './components/AdminFrame';
import { useAdminAction } from './components/actions';
import { formStyles } from './components/forms';
import { ErrorState, FlagBox } from './components/parts';
import { countryName } from './lib/countries';
import { currencyDecimals, minorToInput, parseMoney, type MoneyError } from './lib/money';
import {
  defaultFormat,
  genericFormat,
  KNOWN_CURRENCIES,
  priceBody,
  priceKeyName,
  priceWarnings,
  rowSummary,
  sameFormat,
  yearlyPreview,
} from './lib/prices';
import type { AdminKey } from './lib/text';

const TRIALS: (number | null)[] = [null, 0, 3, 7, 14, 30];
const GROUPS: { value: string; label: AdminKey }[] = [
  { value: ',', label: 'admin.price.group.comma' },
  { value: '.', label: 'admin.price.group.dot' },
  { value: ' ', label: 'admin.price.group.space' },
  { value: ' ', label: 'admin.price.group.thin' },
  { value: '’', label: 'admin.price.group.apostrophe' },
];
const MONEY_ERROR: Record<MoneyError, AdminKey> = {
  empty: 'admin.price.error.empty',
  invalid: 'admin.price.error.invalid',
  tooManyDecimals: 'admin.price.error.decimals',
  outOfRange: 'admin.price.error.range',
};
const AMOUNTS = ['monthly', 'yearly', 'lifetime'] as const;
type Amount = (typeof AMOUNTS)[number];

/**
 * Route `AdminPrice` (backend-spec 2.10 PUT/DELETE /prices/:country, 5.4): monthly, yearly and
 * lifetime typed as decimals and saved as minor units, a trial override, the currency and (under
 * Advanced) the format, with live previews in English and native style. Without a country it adds
 * one.
 */
function AdminPrice({ navigation, route }: RootScreenProps<'AdminPrice'>) {
  const { t } = useI18n();
  const query = useAdminQuery('prices', () => adminApi.prices());
  const [country, setCountry] = useState<string | null>(route.params?.country ?? null);
  const adding = !route.params?.country;
  const data = query.data;

  const pickCountry = async () => {
    const { requestId, result } = createRequest<string[]>();
    navigation.navigate('CountryPicker', { requestId, selected: country ? [country] : [], title: t('admin.price.pickCountry') });
    const picked = await result;
    if (picked?.[0]) setCountry(picked[0]);
  };

  const title = country ? `${priceKeyName(country, t)}` : t('admin.price.addTitle');

  if (!data) {
    return (
      <AdminScreen title={title} presentation="modal" testID="screen-AdminPrice">
        {query.error ? (
          <ErrorState error={query.error} title={t('admin.prices.loadFailed')} onRetry={query.reload} onBack={() => navigation.goBack()} />
        ) : (
          <View style={formStyles.body}>
            <SkeletonCard />
            <SkeletonCard />
          </View>
        )}
      </AdminScreen>
    );
  }

  const row = country ? data.items.find((r) => r.country === country) ?? null : null;
  const picker = adding ? (
    <Section style={styles.flushSection}>
      <ListItem
        title={t('admin.price.country')}
        leading={<FlagBox country={country} size={32} />}
        leadingWidth={32}
        value={country ? countryName(country) : t('admin.price.choose')}
        chevron
        onPress={() => void pickCountry()}
        testID="admin-price-country"
      />
    </Section>
  ) : null;

  return (
    <PriceEditor
      key={country ?? 'none'}
      country={country}
      row={row}
      adding={adding}
      defaultTrialDays={data.defaultTrialDays}
      title={title}
      picker={picker}
      navigation={navigation}
    />
  );
}

function PriceEditor({
  country,
  row,
  adding,
  defaultTrialDays,
  title,
  picker,
  navigation,
}: {
  country: string | null;
  row: AdminPriceRow | null;
  adding: boolean;
  defaultTrialDays: number;
  title: string;
  picker: ReactNode;
  navigation: RootScreenProps<'AdminPrice'>['navigation'];
}) {
  const { t } = useI18n();
  const act = useAdminAction();
  const { offline } = useAdminContext();
  const startCurrency = row?.currency ?? 'EUR';
  const startDecimals = currencyDecimals(startCurrency);
  const [currency, setCurrency] = useState(startCurrency);
  const [amounts, setAmounts] = useState<Record<Amount, string>>({
    monthly: row ? minorToInput(row.monthly, startDecimals) : '',
    yearly: row ? minorToInput(row.yearly, startDecimals) : '',
    lifetime: row ? minorToInput(row.lifetime, startDecimals) : '',
  });
  const [trial, setTrial] = useState<number | null>(row?.trialDays ?? null);
  const [format, setFormat] = useState<PriceFormat>(
    () => row?.format ?? defaultFormat(country ?? '', startCurrency) ?? genericFormat(startCurrency),
  );
  const [formatTouched, setFormatTouched] = useState(() => !!row && !sameFormat(row.format, defaultFormat(row.country, row.currency)));
  const [advanced, setAdvanced] = useState(formatTouched);
  const [tried, setTried] = useState(false);

  const decimals = currencyDecimals(currency);
  const currencyOk = /^[A-Z]{3}$/.test(currency);
  const fallbackFormat = currencyOk ? defaultFormat(country ?? '', currency) : null;
  const effectiveFormat: PriceFormat = { ...(formatTouched || !fallbackFormat ? format : fallbackFormat), decimals };
  const parsed = Object.fromEntries(AMOUNTS.map((k) => [k, parseMoney(amounts[k], decimals)])) as Record<Amount, ReturnType<typeof parseMoney>>;
  const minor = (k: Amount) => ('minor' in parsed[k] ? (parsed[k] as { minor: number }).minor : null);
  const allAmounts = AMOUNTS.every((k) => minor(k) !== null);
  const symbolOk = effectiveFormat.symbol.trim().length >= 1 && [...effectiveFormat.symbol].length <= 8 && effectiveFormat.symbol.trim() === effectiveFormat.symbol;
  const groupOk = effectiveFormat.group !== effectiveFormat.decimal;
  const valid = !!country && currencyOk && allAmounts && symbolOk && groupOk;
  const preview: PriceRow | null = allAmounts
    ? { country: country ?? '', currency, monthly: minor('monthly')!, yearly: minor('yearly')!, lifetime: minor('lifetime')!, trialDays: trial, format: effectiveFormat }
    : null;
  const warnings = preview ? priceWarnings(preview) : [];

  const changeCurrency = (next: string) => {
    const c = next.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3);
    setCurrency(c);
    if (/^[A-Z]{3}$/.test(c) && !formatTouched) setFormat(defaultFormat(country ?? '', c) ?? genericFormat(c));
  };
  const editFormat = (patch: Partial<PriceFormat>) => {
    setFormat({ ...effectiveFormat, ...patch });
    setFormatTouched(true);
  };

  const save = () => {
    setTried(true);
    if (!valid || !preview || !country) return;
    const body = priceBody(country, preview);
    void act({
      title: t('admin.price.confirmTitle', { name: priceKeyName(country, t) }),
      message: [rowSummary(preview, 'en', t), ...warnings.map((w) => t(`admin.price.warn.${w}`)), t('admin.price.confirmPlay')].join('\n'),
      confirmLabel: t('admin.common.save'),
      icon: 'cash-multiple',
      run: () => adminApi.putPrice(country, body),
      success: (r) =>
        r.warnings.length ? t('admin.price.savedWarn', { name: priceKeyName(country, t) }) : t('admin.price.saved', { name: priceKeyName(country, t) }),
      after: () => {
        invalidateAdmin('prices', 'audit');
        refreshConfigAfterAdminSave();
        navigation.goBack();
      },
    });
  };

  const reset = () => {
    if (!country) return;
    void act({
      title: t('admin.price.resetTitle', { name: priceKeyName(country, t) }),
      message: row?.builtin ? t('admin.price.resetBuiltin', { prices: rowSummary(row.builtin, 'en', t) }) : t('admin.price.resetAdded'),
      confirmLabel: t('admin.common.resetDefault'),
      tone: 'danger',
      icon: 'restore',
      run: () => adminApi.deletePrice(country),
      success: () => t('admin.price.resetDone', { name: priceKeyName(country, t) }),
      after: () => {
        invalidateAdmin('prices', 'audit');
        refreshConfigAfterAdminSave();
        navigation.goBack();
      },
    });
  };

  const fieldError = (k: Amount) => {
    const p = parsed[k];
    if (!tried && amounts[k] === '') return null;
    return 'error' in p ? t(MONEY_ERROR[p.error], { decimals }) : null;
  };

  return (
    <AdminScreen
      title={adding && !row ? t('admin.price.addTitle') : `${title} · ${currency || '—'}`}
      presentation="modal"
      keyboard
      footer={
        <StickyFooter>
          <Button label={t('admin.price.save')} size="L" block onPress={save} disabled={offline || (tried && !valid)} testID="admin-price-save" />
        </StickyFooter>
      }
      testID="screen-AdminPrice">
      <View style={formStyles.body}>
        {picker}
        {adding && row ? <Banner tone="info" body={t('admin.price.exists')} /> : null}
        {!country && tried ? (
          <AppText variant="bodyS" color="danger">
            {t('admin.price.error.country')}
          </AppText>
        ) : null}

        <View style={formStyles.block}>
          <TextField
            label={t('admin.price.currency')}
            value={currency}
            onChangeText={changeCurrency}
            autoCapitalize="characters"
            maxLength={3}
            helper={decimals === 0 ? t('admin.price.noDecimals') : t('admin.price.twoDecimals')}
            error={tried && !currencyOk ? t('admin.price.error.currency') : null}
            testID="admin-price-currency"
          />
          <ChipRow style={styles.flushChips}>
            {KNOWN_CURRENCIES.map((c) => (
              <Chip key={c} label={c} selected={currency === c} onPress={() => changeCurrency(c)} />
            ))}
          </ChipRow>
        </View>

        {AMOUNTS.map((k) => (
          <TextField
            key={k}
            label={t(`admin.price.${k}`)}
            value={amounts[k]}
            onChangeText={(text) => setAmounts((a) => ({ ...a, [k]: text }))}
            variant="decimal"
            unit={currency}
            placeholder={decimals === 0 ? '300' : '1.99'}
            error={fieldError(k)}
            helper={row?.builtin && row.overridden ? t('admin.price.builtin', { price: rowSummaryOne(row.builtin, k) }) : undefined}
            testID={`admin-price-${k}`}
          />
        ))}

        <View style={formStyles.block}>
          <AppText variant="labelM" color="textSecondary">
            {t('admin.price.trial')}
          </AppText>
          <ChipWrap radio accessibilityLabel={t('admin.price.trial')}>
            {TRIALS.map((d) => (
              <Chip
                key={String(d)}
                label={d === null ? t('admin.price.trialDefault', { days: defaultTrialDays }) : t('admin.price.trialDays', { days: d })}
                selected={trial === d}
                onPress={() => setTrial(d)}
              />
            ))}
          </ChipWrap>
          <AppText variant="bodyS" color="textTertiary">
            {t('admin.price.trialHelp')}
          </AppText>
        </View>

        <Card title={t('admin.price.preview')} testID="admin-price-preview">
          {preview ? (
            <>
              <PreviewLine label={t('admin.price.english')} text={rowSummary(preview, 'en', t)} sub={yearlyPreview(preview, 'en', t)} />
              <PreviewLine label={t('admin.price.native')} text={rowSummary(preview, 'native', t)} sub={yearlyPreview(preview, 'native', t)} />
            </>
          ) : (
            <AppText variant="bodyM" color="textTertiary">
              {t('admin.price.previewEmpty')}
            </AppText>
          )}
          {country && country !== 'DEFAULT' ? (
            <Button label={t('admin.price.paywall')} icon="eye-outline" variant="secondary" size="M" onPress={() => navigation.navigate('Paywall', { previewRegion: country })} />
          ) : null}
        </Card>

        {warnings.map((w) => (
          <Banner key={w} tone="warning" body={t(`admin.price.warn.${w}`)} />
        ))}
        <Banner tone="info" icon="google-play" body={t('admin.price.playBanner')} />

        <Section style={styles.flushSection}>
          <ListItem
            icon="tune-variant"
            title={t('admin.price.advanced')}
            subtitle={formatTouched ? t('admin.price.formatCustom') : fallbackFormat ? t('admin.price.formatDefault') : t('admin.price.formatNeeded')}
            trailing={<Icon name={advanced ? 'chevron-up' : 'chevron-down'} size={20} color="textTertiary" />}
            onPress={() => setAdvanced((a) => !a)}
            accessibilityHint={advanced ? t('admin.price.advancedHide') : t('admin.price.advancedShow')}
          />
        </Section>
        {advanced || (!fallbackFormat && currencyOk) ? (
          <View style={formStyles.block}>
            <TextField
              label={t('admin.price.symbol')}
              value={effectiveFormat.symbol}
              onChangeText={(symbol) => editFormat({ symbol })}
              maxLength={8}
              error={!symbolOk ? t('admin.price.error.symbol') : null}
            />
            <SegmentedControl
              options={[
                { value: 'before' as const, label: t('admin.price.before') },
                { value: 'after' as const, label: t('admin.price.after') },
              ]}
              value={effectiveFormat.position}
              onChange={(position) => editFormat({ position })}
              accessibilityLabel={t('admin.price.position')}
            />
            <SegmentedControl
              options={[
                { value: '.' as const, label: t('admin.price.decimalDot') },
                { value: ',' as const, label: t('admin.price.decimalComma') },
              ]}
              value={effectiveFormat.decimal}
              onChange={(decimal) => editFormat({ decimal })}
              accessibilityLabel={t('admin.price.decimal')}
            />
            <AppText variant="labelM" color="textSecondary">
              {t('admin.price.group')}
            </AppText>
            <ChipWrap radio accessibilityLabel={t('admin.price.group')}>
              {GROUPS.map((g) => (
                <Chip key={g.value} label={t(g.label)} selected={effectiveFormat.group === g.value} onPress={() => editFormat({ group: g.value })} />
              ))}
            </ChipWrap>
            {!groupOk ? (
              <AppText variant="bodyS" color="danger">
                {t('admin.price.error.group')}
              </AppText>
            ) : null}
            <SegmentedControl
              options={[
                { value: 'standard' as const, label: t('admin.price.groupingStandard') },
                { value: 'indian' as const, label: t('admin.price.groupingIndian') },
              ]}
              value={effectiveFormat.grouping}
              onChange={(grouping) => editFormat({ grouping })}
              accessibilityLabel={t('admin.price.grouping')}
            />
            <Section style={styles.flushSection}>
              <SwitchRow title={t('admin.price.space')} value={effectiveFormat.space} onValueChange={(space) => editFormat({ space })} />
              <SwitchRow title={t('admin.price.trimWhole')} subtitle={t('admin.price.trimWholeHelp')} value={effectiveFormat.trimWhole} onValueChange={(trimWhole) => editFormat({ trimWhole })} />
              <SwitchRow title={t('admin.price.wordSymbol')} subtitle={t('admin.price.wordSymbolHelp')} value={effectiveFormat.wordSymbol} onValueChange={(wordSymbol) => editFormat({ wordSymbol })} />
            </Section>
            {formatTouched && fallbackFormat ? (
              <Button
                label={t('admin.price.formatReset')}
                variant="ghost"
                size="S"
                onPress={() => {
                  setFormat(fallbackFormat);
                  setFormatTouched(false);
                }}
                style={styles.left}
              />
            ) : null}
          </View>
        ) : null}

        {row?.overridden ? (
          <Button label={row.builtin ? t('admin.common.resetDefault') : t('admin.price.remove')} icon="restore" variant="dangerOutline" size="M" onPress={reset} disabled={offline} testID="admin-price-reset" />
        ) : null}
      </View>
    </AdminScreen>
  );

  function rowSummaryOne(r: PriceRow, k: Amount): string {
    return minorToInput(r[k], currencyDecimals(r.currency)) + ` ${r.currency}`;
  }
}

function PreviewLine({ label, text, sub }: { label: string; text: string; sub: string }) {
  return (
    <View style={styles.previewLine}>
      <AppText variant="labelS" color="textSecondary">
        {label}
      </AppText>
      <AppText variant="bodyM" tabular>
        {text}
      </AppText>
      <AppText variant="bodyS" color="textSecondary" tabular>
        {sub}
      </AppText>
    </View>
  );
}

export const AdminPriceScreen = withAdmin(AdminPrice);

const styles = StyleSheet.create({
  flushSection: { marginHorizontal: -16 },
  flushChips: { marginHorizontal: -16 },
  previewLine: { gap: 2 },
  left: { alignSelf: 'flex-start' },
});
