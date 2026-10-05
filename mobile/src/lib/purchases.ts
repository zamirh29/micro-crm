import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Linking from 'expo-linking';
import { Platform } from 'react-native';
import Purchases, {
  LOG_LEVEL,
  type CustomerInfo,
  type PurchasesOffering,
  type PurchasesPackage,
} from 'react-native-purchases';

/**
 * Entitlement identifier in the RevenueCat dashboard that grants Pro.
 * Must match REVENUECAT_PRO_ENTITLEMENT_ID on the backend.
 */
export const PRO_ENTITLEMENT = 'pro';

function apiKey(): string | undefined {
  if (Platform.OS === 'ios') return process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY;
  if (Platform.OS === 'android') {
    return process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY;
  }
  return undefined;
}

/**
 * `react-native-purchases` contains native code, so it is absent from Expo Go and
 * from any build made before the dependency was added. Every entry point below
 * degrades to a no-op rather than throwing, so the rest of the app keeps working.
 */
export function isPurchasesSupported(): boolean {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return false;
  if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) {
    return false;
  }
  return Boolean(apiKey());
}

let currentAppUserId: string | null = null;

/**
 * Configures the SDK once and keeps RevenueCat identified with the signed-in
 * Supabase user, so purchases land on the same customer that the backend reads.
 */
export async function initializePurchases(
  userId: string | null,
): Promise<CustomerInfo | null> {
  if (!isPurchasesSupported()) return null;

  const key = apiKey();
  if (!key) return null;

  const configured = await Purchases.isConfigured();

  if (!configured) {
    Purchases.setLogLevel(__DEV__ ? LOG_LEVEL.DEBUG : LOG_LEVEL.INFO);
    Purchases.configure(userId ? { apiKey: key, appUserID: userId } : { apiKey: key });
    currentAppUserId = userId;
  } else if (userId && currentAppUserId !== userId) {
    await Purchases.logIn(userId);
    currentAppUserId = userId;
  }

  return Purchases.getCustomerInfo();
}

/** Detaches the RevenueCat identity when the user signs out of the app. */
export async function signOutFromPurchases(): Promise<void> {
  currentAppUserId = null;
  if (!isPurchasesSupported()) return;
  if (!(await Purchases.isConfigured())) return;
  try {
    await Purchases.logOut();
  } catch {
    // Signing out of RevenueCat must never block signing out of the app.
  }
}

export function hasProEntitlement(customerInfo: CustomerInfo | null): boolean {
  return Boolean(customerInfo?.entitlements.active[PRO_ENTITLEMENT]);
}

function errorCode(error: unknown): string | undefined {
  return (error as { code?: string } | null)?.code;
}

function describeError(error: unknown): string {
  const message =
    (error as { message?: string } | null)?.message ?? 'Purchase failed';
  return message;
}

function isCancellation(error: unknown): boolean {
  return (
    errorCode(error) ===
    Purchases.PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR
  );
}

async function currentOffering(): Promise<PurchasesOffering | null> {
  if (!isPurchasesSupported()) return null;
  if (!(await Purchases.isConfigured())) return null;

  const offerings = await Purchases.getOfferings();
  return offerings.current ?? Object.values(offerings.all)[0] ?? null;
}

/** Resolves the Pro package from the current RevenueCat offering. */
export async function getProPackage(): Promise<PurchasesPackage | null> {
  const offering = await currentOffering();
  if (!offering) return null;
  return offering.monthly ?? offering.availablePackages[0] ?? null;
}

export type PurchaseResult = {
  status: 'success' | 'cancelled' | 'error' | 'unavailable';
  message?: string;
  customerInfo: CustomerInfo | null;
};

export async function purchasePro(): Promise<PurchaseResult> {
  const storeProduct = await getProPackage();
  if (!storeProduct) {
    return {
      status: 'unavailable',
      message: 'The subscription is not available on this device yet.',
      customerInfo: null,
    };
  }

  try {
    const result = await Purchases.purchasePackage(storeProduct);
    return { status: 'success', customerInfo: result.customerInfo };
  } catch (error) {
    if (isCancellation(error)) {
      return { status: 'cancelled', customerInfo: null };
    }
    return {
      status: 'error',
      message: describeError(error),
      customerInfo: null,
    };
  }
}

/** Re-attaches purchases made on another device or before a reinstall. */
export async function restorePro(): Promise<PurchaseResult> {
  if (!isPurchasesSupported()) {
    return { status: 'unavailable', customerInfo: null };
  }
  if (!(await Purchases.isConfigured())) {
    return { status: 'unavailable', customerInfo: null };
  }

  try {
    const customerInfo = await Purchases.restorePurchases();
    return {
      status: hasProEntitlement(customerInfo) ? 'success' : 'error',
      message: hasProEntitlement(customerInfo)
        ? undefined
        : 'No active subscription was found.',
      customerInfo,
    };
  } catch (error) {
    return {
      status: 'error',
      message: describeError(error),
      customerInfo: null,
    };
  }
}

/** True when the store reports it can take payments for this account. */
export async function canMakePayments(): Promise<boolean> {
  if (!isPurchasesSupported()) return false;
  if (!(await Purchases.isConfigured())) return false;
  try {
    return await Purchases.canMakePayments();
  } catch {
    return false;
  }
}

/**
 * Opens the store's subscription management screen.
 *
 * `showManageSubscriptions` is iOS-only, so Android (and the web bundle) use the
 * RevenueCat management URL, which points at the matching Play subscription.
 */
export async function openSubscriptionManagement(
  customerInfo: CustomerInfo | null,
): Promise<void> {
  if (!isPurchasesSupported()) return;

  if (Platform.OS === 'ios' && (await Purchases.isConfigured())) {
    try {
      await Purchases.showManageSubscriptions();
      return;
    } catch {
      // Fall through to the management URL.
    }
  }

  const url = customerInfo?.managementURL;
  if (url) await Linking.openURL(url);
}