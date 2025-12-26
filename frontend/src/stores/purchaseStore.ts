import { create } from 'zustand';
import { Platform } from 'react-native';
import Purchases, { 
  PurchasesPackage, 
  CustomerInfo, 
  PurchasesOffering,
  LOG_LEVEL 
} from 'react-native-purchases';

// RevenueCat API Keys - Replace with your actual keys
// For testing, you can use these placeholder keys
const REVENUECAT_API_KEY_IOS = 'appl_YOUR_IOS_KEY_HERE';
const REVENUECAT_API_KEY_ANDROID = 'goog_YOUR_ANDROID_KEY_HERE';

// Product identifiers matching your RevenueCat dashboard
export const PRODUCT_IDS = {
  PRO_MONTHLY: 'pro_monthly',
  PRO_YEARLY: 'pro_yearly',
  TEAM_MONTHLY: 'team_monthly',
  TEAM_YEARLY: 'team_yearly',
};

// Entitlement identifiers
export const ENTITLEMENTS = {
  PRO: 'pro',
  TEAM: 'team',
};

interface PurchaseState {
  isInitialized: boolean;
  customerInfo: CustomerInfo | null;
  offerings: PurchasesOffering | null;
  packages: PurchasesPackage[];
  isPro: boolean;
  isTeam: boolean;
  isLoading: boolean;
  error: string | null;
  
  // Actions
  initializePurchases: (userId?: string) => Promise<void>;
  fetchOfferings: () => Promise<void>;
  purchasePackage: (pkg: PurchasesPackage) => Promise<boolean>;
  restorePurchases: () => Promise<void>;
  checkSubscriptionStatus: () => Promise<void>;
  logout: () => Promise<void>;
}

export const usePurchaseStore = create<PurchaseState>((set, get) => ({
  isInitialized: false,
  customerInfo: null,
  offerings: null,
  packages: [],
  isPro: false,
  isTeam: false,
  isLoading: false,
  error: null,

  initializePurchases: async (userId?: string) => {
    try {
      set({ isLoading: true, error: null });
      
      // Configure RevenueCat
      Purchases.setLogLevel(LOG_LEVEL.DEBUG);
      
      const apiKey = Platform.OS === 'ios' 
        ? REVENUECAT_API_KEY_IOS 
        : REVENUECAT_API_KEY_ANDROID;
      
      await Purchases.configure({ apiKey });
      
      // If we have a user ID, identify them
      if (userId) {
        await Purchases.logIn(userId);
      }
      
      set({ isInitialized: true });
      
      // Fetch initial data
      await get().fetchOfferings();
      await get().checkSubscriptionStatus();
      
    } catch (error: any) {
      console.error('Failed to initialize purchases:', error);
      set({ error: error.message || 'Failed to initialize purchases' });
    } finally {
      set({ isLoading: false });
    }
  },

  fetchOfferings: async () => {
    try {
      set({ isLoading: true, error: null });
      
      const offerings = await Purchases.getOfferings();
      
      if (offerings.current) {
        set({ 
          offerings: offerings.current,
          packages: offerings.current.availablePackages,
        });
      }
    } catch (error: any) {
      console.error('Failed to fetch offerings:', error);
      set({ error: error.message || 'Failed to fetch offerings' });
    } finally {
      set({ isLoading: false });
    }
  },

  purchasePackage: async (pkg: PurchasesPackage) => {
    try {
      set({ isLoading: true, error: null });
      
      const { customerInfo } = await Purchases.purchasePackage(pkg);
      
      // Check entitlements after purchase
      const isPro = typeof customerInfo.entitlements.active[ENTITLEMENTS.PRO] !== 'undefined';
      const isTeam = typeof customerInfo.entitlements.active[ENTITLEMENTS.TEAM] !== 'undefined';
      
      set({ 
        customerInfo,
        isPro,
        isTeam,
      });
      
      return true;
    } catch (error: any) {
      if (error.userCancelled) {
        // User cancelled, not an error
        return false;
      }
      console.error('Purchase failed:', error);
      set({ error: error.message || 'Purchase failed' });
      return false;
    } finally {
      set({ isLoading: false });
    }
  },

  restorePurchases: async () => {
    try {
      set({ isLoading: true, error: null });
      
      const customerInfo = await Purchases.restorePurchases();
      
      const isPro = typeof customerInfo.entitlements.active[ENTITLEMENTS.PRO] !== 'undefined';
      const isTeam = typeof customerInfo.entitlements.active[ENTITLEMENTS.TEAM] !== 'undefined';
      
      set({ 
        customerInfo,
        isPro,
        isTeam,
      });
    } catch (error: any) {
      console.error('Restore failed:', error);
      set({ error: error.message || 'Failed to restore purchases' });
    } finally {
      set({ isLoading: false });
    }
  },

  checkSubscriptionStatus: async () => {
    try {
      const customerInfo = await Purchases.getCustomerInfo();
      
      const isPro = typeof customerInfo.entitlements.active[ENTITLEMENTS.PRO] !== 'undefined';
      const isTeam = typeof customerInfo.entitlements.active[ENTITLEMENTS.TEAM] !== 'undefined';
      
      set({ 
        customerInfo,
        isPro,
        isTeam,
      });
    } catch (error: any) {
      console.error('Failed to check subscription:', error);
    }
  },

  logout: async () => {
    try {
      await Purchases.logOut();
      set({
        customerInfo: null,
        isPro: false,
        isTeam: false,
      });
    } catch (error: any) {
      console.error('Failed to logout from purchases:', error);
    }
  },
}));

// Helper function to format price
export const formatPrice = (pkg: PurchasesPackage): string => {
  return pkg.product.priceString;
};

// Helper to get package by identifier
export const getPackageByIdentifier = (
  packages: PurchasesPackage[], 
  identifier: string
): PurchasesPackage | undefined => {
  return packages.find(p => p.identifier === identifier);
};
