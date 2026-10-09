import type { AlarmStrength } from '../../modules/trip-alarm/src';
import { useI18n } from '../i18n';
import { effectiveStrength, strengthAllowed } from '../lib/plans';
import { usePro } from '../lib/pro';
import { Segmented } from './components';

/** Gentle, Normal or Heavy sleeper. Heavy sleeper is Pro: without it, tapping it opens the paywall. */
export function StrengthPicker({
  value,
  onChange,
  onNeedPro,
}: {
  value: AlarmStrength;
  onChange: (strength: AlarmStrength) => void;
  onNeedPro: () => void;
}) {
  const { t: tr } = useI18n();
  const { isPro } = usePro();
  return (
    <Segmented<AlarmStrength>
      value={effectiveStrength(value, isPro)}
      onChange={(strength) => (strengthAllowed(strength, isPro) ? onChange(strength) : onNeedPro())}
      options={[
        { value: 'gentle', label: tr('strength.gentle') },
        { value: 'normal', label: tr('strength.normal') },
        { value: 'heavy', label: tr('strength.heavy'), icon: isPro ? undefined : 'lock' },
      ]}
    />
  );
}
