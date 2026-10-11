// The StopWake 1.0 design system (docs/design/ui-direction-a.md sections 2 and 3). Screens import
// from here: `import { Button, ListItem, Screen, useTheme } from '../../ui'`. The pre-1.0 UI lives
// in ./legacy until the screens that use it are rebuilt.

// Tokens and theme
export * from './tokens';
export { BADGE_COLOR, BADGE_SHAPE, CHART_COLORS, KIND_COLOR, KIND_ICON, MAP_COLORS } from './colors';
export type { ChartPalette, MapPalette } from './colors';
export { applyAppearance, ThemeProvider, useTheme } from './theme';
export type { AppearancePreference, ElevationOptions, Theme } from './theme';
export { easing as easings, durations, isReduceMotion, useReducedMotion } from './motion';
export { haptics } from './haptics';
export { contrastRatio } from './contrast';
export { initialsOf, textStyle, usesLatinCase } from './typography';
export type { FontWeightName } from './fonts';
export { daysBetween, dateFromParts } from './dateParts';
export { settleSnap, sheetGeometry, SNAP_ORDER, stepSnap } from './sheetGeometry';
export type { SheetGeometry, SheetSnap } from './sheetGeometry';

// Components (section 3)
export { AlarmCard } from './components/AlarmCard';
export { AppText, type AppTextProps } from './components/AppText';
export { Avatar, type AvatarSize } from './components/Avatar';
export { Badge, BADGE_TONES, DotBadge, type BadgeTone } from './components/Badge';
export { ANNOUNCEMENT_TONE, Banner, OfflinePill, type BannerTone } from './components/Banner';
export { Button, type ButtonProps, type ButtonSize, type ButtonVariant } from './components/Button';
export { Card, type CardProps } from './components/Card';
export { Chip, ChipRow, ChipWrap, type ChipProps, type ChipVariant } from './components/Chip';
export { ComparisonTable, type ComparisonCell, type ComparisonRow } from './components/ComparisonTable';
export {
  ConfirmDialog,
  DialogProvider,
  useDialogs,
  type AlertRequest,
  type ConfirmDialogProps,
  type ConfirmRequest,
  type ConfirmValues,
  type DialogsApi,
} from './components/ConfirmDialog';
export { DateField } from './components/DateField';
export { DestinationCard } from './components/DestinationCard';
export { Dialog, ToneIcon, type DialogProps } from './components/Dialog';
export { EmptyState } from './components/EmptyState';
export { Icon, type IconName } from './components/Icon';
export { IconButton, type IconButtonProps, type IconButtonVariant } from './components/IconButton';
export { KeyValueRow } from './components/KeyValueRow';
export { KindIcon } from './components/KindIcon';
export { LargeHeader } from './components/LargeHeader';
export { ListItem, RowPositionContext, type ListItemProps, type RowPosition } from './components/ListItem';
export { MapControl, type LocateState } from './components/MapControl';
export { MapSheet, useSheetGeometry, type MapSheetProps } from './components/MapSheet';
export { badgeSpoken, badgeText, ModeBadge, ModeBadgeRow, type ModeBadgeSize } from './components/ModeBadge';
export { useAnyOverlayOpen, useOverlayOpen } from './components/overlay';
export { PlanBadge, type PlanBadgeVariant } from './components/PlanBadge';
export { PlanCard } from './components/PlanCard';
export { ProgressBar } from './components/ProgressBar';
export { Screen, StickyFooter, type ScreenProps } from './components/Screen';
export { SearchField, type SearchFieldProps } from './components/SearchField';
export { Section, type SectionAction } from './components/Section';
export { SectionHeader, type SectionHeaderProps } from './components/SectionHeader';
export { SegmentedControl, type SegmentOption } from './components/SegmentedControl';
export { ModalSheetContent, SheetGrabber, SheetOption } from './components/Sheet';
export { Skeleton, SkeletonCard, SkeletonRow, SkeletonTile, useSkeletonDelay } from './components/Skeleton';
export { StatTile } from './components/StatTile';
export { Stepper } from './components/Stepper';
export { StopPin } from './components/StopPin';
export { SwitchRow } from './components/SwitchRow';
export { TabBar, type TabItem } from './components/TabBar';
export { TextField, type TextFieldKind, type TextFieldProps, type TextFieldVariant } from './components/TextField';
export { ToastHost, ToastProvider, useToast, useToastInset, type ToastApi, type ToastInput } from './components/Toast';
export { TopBar, type TopBarProps } from './components/TopBar';
export { Touchable, type TouchableProps } from './components/Touchable';
export { TrialTimeline } from './components/TrialTimeline';
export { TripBar } from './components/TripBar';
