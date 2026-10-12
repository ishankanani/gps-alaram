import { StyleSheet, View } from 'react-native';

import { AppText, Banner, Button, Card, PlanBadge, Skeleton } from '../../ui';
import type { PlanAction, PlanStatus } from './planStatus';

type Props = {
  status: PlanStatus;
  onAction: (action: PlanAction) => void;
  busy?: boolean;
};

/**
 * The plan card of the Account tab (4.3): outlined, 1.5 px accent border for Pro, the PlanBadge,
 * a status line by source and one action. "Get Pro" is the screen's only primary button.
 */
export function PlanStatusCard({ status, onAction, busy }: Props) {
  const pro = status.badge !== 'free';
  const action = status.action;
  return (
    <Card
      variant="outlined"
      borderColor={pro ? 'accent' : undefined}
      borderWidth={pro ? 1.5 : undefined}
      style={styles.card}
      testID="account-plan">
      <View style={styles.header} accessible accessibilityLabel={`${status.title}. ${status.line}`}>
        <PlanBadge variant={status.badge} size="lg" />
        <AppText variant="titleS">{status.title}</AppText>
        <AppText variant="bodyM" color="textSecondary">
          {status.line}
        </AppText>
        {status.note ? (
          <AppText variant="bodyS" color="textTertiary">
            {status.note}
          </AppText>
        ) : null}
      </View>
      {status.warning ? <Banner tone="warning" body={status.warning} /> : null}
      {action ? (
        <Button
          label={action.label}
          size="M"
          block
          loading={busy}
          variant={action.kind === 'getPro' ? 'primary' : action.kind === 'seePlans' ? 'ghost' : 'secondary'}
          onPress={() => onAction(action.kind)}
          testID={`account-plan-${action.kind}`}
        />
      ) : null}
    </Card>
  );
}

export function PlanStatusSkeleton() {
  return (
    <Card variant="outlined" style={styles.card}>
      <Skeleton width={64} height={28} shape="block" />
      <Skeleton width="40%" height={17} />
      <Skeleton width="75%" height={15} />
      <Skeleton height={48} shape="block" />
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { marginHorizontal: 16 },
  header: { gap: 6, alignItems: 'flex-start' },
});
