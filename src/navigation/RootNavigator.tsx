import { createNativeStackNavigator, type NativeStackNavigationOptions } from '@react-navigation/native-stack';
import type { ReactElement } from 'react';
import { Platform } from 'react-native';

import { ChangePasswordScreen } from '../screens/account/ChangePasswordScreen';
import { DeleteAccountScreen } from '../screens/account/DeleteAccountScreen';
import { EditProfileScreen } from '../screens/account/EditProfileScreen';
import { TripDetailScreen } from '../screens/activity/TripDetailScreen';
import { AdminAuditEntryScreen } from '../screens/admin/AdminAuditEntryScreen';
import { AdminAuditScreen } from '../screens/admin/AdminAuditScreen';
import { AdminChangePlanScreen } from '../screens/admin/AdminChangePlanScreen';
import { AdminEditUserScreen } from '../screens/admin/AdminEditUserScreen';
import { AdminExtendScreen } from '../screens/admin/AdminExtendScreen';
import { AdminGrantScreen } from '../screens/admin/AdminGrantScreen';
import { AdminHomeScreen } from '../screens/admin/AdminHomeScreen';
import { AdminNoteScreen } from '../screens/admin/AdminNoteScreen';
import { AdminPriceScreen } from '../screens/admin/AdminPriceScreen';
import { AdminPricesScreen } from '../screens/admin/AdminPricesScreen';
import { AdminPromoCodeScreen } from '../screens/admin/AdminPromoCodeScreen';
import { AdminPromoCodesScreen } from '../screens/admin/AdminPromoCodesScreen';
import { AdminPromoNewScreen } from '../screens/admin/AdminPromoNewScreen';
import { AdminSettingsScreen } from '../screens/admin/AdminSettingsScreen';
import { AdminStoreEventScreen } from '../screens/admin/AdminStoreEventScreen';
import { AdminStoreEventsScreen } from '../screens/admin/AdminStoreEventsScreen';
import { AdminUserScreen } from '../screens/admin/AdminUserScreen';
import { AdminUsersScreen } from '../screens/admin/AdminUsersScreen';
import { CountryPickerScreen } from '../screens/admin/CountryPickerScreen';
import { ForgotPasswordScreen } from '../screens/auth/ForgotPasswordScreen';
import { SignInScreen } from '../screens/auth/SignInScreen';
import { SignUpScreen } from '../screens/auth/SignUpScreen';
import { OnboardingScreen } from '../screens/onboarding/OnboardingScreen';
import { PaywallScreen } from '../screens/paywall/PaywallScreen';
import { RedeemScreen } from '../screens/paywall/RedeemScreen';
import { RenameFavouriteScreen } from '../screens/saved/RenameFavouriteScreen';
import { AboutScreen } from '../screens/settings/AboutScreen';
import { AlarmDefaultsScreen } from '../screens/settings/AlarmDefaultsScreen';
import { CountriesScreen } from '../screens/settings/CountriesScreen';
import { HelpArticleScreen } from '../screens/settings/HelpArticleScreen';
import { HelpScreen } from '../screens/settings/HelpScreen';
import { LanguageScreen } from '../screens/settings/LanguageScreen';
import { LegalScreen } from '../screens/settings/LegalScreen';
import { LicencesScreen } from '../screens/settings/LicencesScreen';
import { OfflineMapsScreen } from '../screens/settings/OfflineMapsScreen';
import { SettingsScreen } from '../screens/settings/SettingsScreen';
import { SetupScreen } from '../screens/setup/SetupScreen';
import { ArrivedScreen } from '../screens/trip/ArrivedScreen';
import { TripScreen } from '../screens/trip/TripScreen';
import { useIsAdmin } from '../state/session';
import { ToastHost } from '../ui/components/Toast';
import { useTheme } from '../ui/theme';
import { ModalSheetScreen, SHEET_SCROLL_AFTER } from './ModalSheetScreen';
import { premiumOnly } from './premiumOnly';
import { TabNavigator } from './TabNavigator';
import type { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

/** Pro screens: closed again while the app is free for everyone (src/lib/monetization.ts). */
const Paywall = premiumOnly(PaywallScreen);
const Redeem = premiumOnly(RedeemScreen);

/** Modals: full screen sliding up on Android (they hold forms; sheets never do). */
const MODAL: NativeStackNavigationOptions = {
  presentation: 'modal',
  animation: Platform.OS === 'android' ? 'slide_from_bottom' : undefined,
};

/**
 * iOS shows modals above the root view, where the root toast host can't be seen: each modal
 * gets its own (passive) host (3.19). Android keeps the single root host.
 */
const modalLayout =
  Platform.OS === 'ios'
    ? ({ children }: { children: ReactElement }) => (
        <>
          {children}
          <ToastHost passive />
        </>
      )
    : undefined;

/**
 * The root stack (ui-direction-a 4.1): Tabs as one route, pushed screens covering the tab bar,
 * Trip and Arrived as full-screen modals, pickers in a native formSheet, and the admin group,
 * which exists only while the session's role is admin (so admin links do nothing for others).
 */
export function RootNavigator({ initialRouteName }: { initialRouteName: 'Onboarding' | 'Tabs' }) {
  const t = useTheme();
  const admin = useIsAdmin();
  return (
    <Stack.Navigator
      initialRouteName={initialRouteName}
      screenOptions={{ headerShown: false, contentStyle: { backgroundColor: t.color.bg } }}>
      <Stack.Screen name="Onboarding" component={OnboardingScreen} options={{ gestureEnabled: false }} />
      <Stack.Screen name="Tabs" component={TabNavigator} />
      <Stack.Screen name="Setup" component={SetupScreen} />

      <Stack.Screen
        name="Trip"
        component={TripScreen}
        options={{ presentation: 'fullScreenModal', gestureEnabled: false, animation: 'slide_from_bottom' }}
      />
      <Stack.Screen
        name="Arrived"
        component={ArrivedScreen}
        options={{ presentation: 'fullScreenModal', gestureEnabled: false, animation: 'fade' }}
      />
      <Stack.Screen name="TripDetail" component={TripDetailScreen} />

      <Stack.Group screenOptions={MODAL} screenLayout={modalLayout}>
        <Stack.Screen name="Paywall" component={Paywall} />
        <Stack.Screen name="Redeem" component={Redeem} />
        <Stack.Screen name="SignIn" component={SignInScreen} />
        <Stack.Screen name="SignUp" component={SignUpScreen} />
        <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
        <Stack.Screen name="RenameFavourite" component={RenameFavouriteScreen} />
        <Stack.Screen name="CountryPicker" component={CountryPickerScreen} />
      </Stack.Group>

      <Stack.Screen name="EditProfile" component={EditProfileScreen} />
      <Stack.Screen name="ChangePassword" component={ChangePasswordScreen} />
      <Stack.Screen name="DeleteAccount" component={DeleteAccountScreen} />

      <Stack.Screen name="Settings" component={SettingsScreen} />
      <Stack.Screen name="AlarmDefaults" component={AlarmDefaultsScreen} />
      <Stack.Screen
        name="Language"
        component={LanguageScreen}
        options={({ route }) => (route.params?.presentation === 'modal' ? MODAL : {})}
      />
      <Stack.Screen name="Countries" component={CountriesScreen} />
      <Stack.Screen name="OfflineMaps" component={OfflineMapsScreen} />
      <Stack.Screen name="Help" component={HelpScreen} />
      <Stack.Screen name="HelpArticle" component={HelpArticleScreen} />
      <Stack.Screen name="Legal" component={LegalScreen} />
      <Stack.Screen name="Licences" component={LicencesScreen} />
      <Stack.Screen name="About" component={AboutScreen} />

      <Stack.Screen
        name="ModalSheet"
        component={ModalSheetScreen}
        options={({ route }) => ({
          presentation: 'formSheet',
          sheetAllowedDetents: route.params.options.length > SHEET_SCROLL_AFTER ? [0.5, 1] : 'fitToContents',
          sheetCornerRadius: t.radius.xl,
          sheetGrabberVisible: true,
          contentStyle: { backgroundColor: t.color.surface3 },
        })}
      />

      {admin ? (
        <Stack.Group navigationKey="admin">
          <Stack.Screen name="AdminHome" component={AdminHomeScreen} />
          <Stack.Screen name="AdminUsers" component={AdminUsersScreen} />
          <Stack.Screen name="AdminUser" component={AdminUserScreen} />
          <Stack.Screen name="AdminPromoCodes" component={AdminPromoCodesScreen} />
          <Stack.Screen name="AdminPromoCode" component={AdminPromoCodeScreen} />
          <Stack.Screen name="AdminPrices" component={AdminPricesScreen} />
          <Stack.Screen name="AdminSettings" component={AdminSettingsScreen} />
          <Stack.Screen name="AdminAudit" component={AdminAuditScreen} />
          <Stack.Screen name="AdminStoreEvents" component={AdminStoreEventsScreen} />
          <Stack.Screen name="AdminStoreEvent" component={AdminStoreEventScreen} />
          <Stack.Group screenOptions={MODAL} screenLayout={modalLayout}>
            <Stack.Screen name="AdminEditUser" component={AdminEditUserScreen} />
            <Stack.Screen name="AdminGrant" component={AdminGrantScreen} />
            <Stack.Screen name="AdminChangePlan" component={AdminChangePlanScreen} />
            <Stack.Screen name="AdminExtend" component={AdminExtendScreen} />
            <Stack.Screen name="AdminNote" component={AdminNoteScreen} />
            <Stack.Screen name="AdminPromoNew" component={AdminPromoNewScreen} />
            <Stack.Screen name="AdminPrice" component={AdminPriceScreen} />
            <Stack.Screen name="AdminAuditEntry" component={AdminAuditEntryScreen} />
          </Stack.Group>
        </Stack.Group>
      ) : null}
    </Stack.Navigator>
  );
}
