import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Linking,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuthStore } from '../src/stores/authStore';
import { colors, spacing, borderRadius } from '../src/utils/theme';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

interface PriceOption {
  price: number;
  yearly_total?: number;
  price_id: string;
  savings: string | null;
}

interface TierPricing {
  monthly: PriceOption;
  yearly: PriceOption;
}

interface SubscriptionPrices {
  pro: TierPricing;
  team: TierPricing;
}

export default function SubscriptionScreen() {
  const router = useRouter();
  const { token } = useAuthStore();
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'yearly'>('yearly');
  const [prices, setPrices] = useState<SubscriptionPrices | null>(null);
  const [currentTier, setCurrentTier] = useState<string>('free');
  const [currentBillingPeriod, setCurrentBillingPeriod] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, [token]);

  const fetchData = async () => {
    try {
      // Fetch prices
      const pricesRes = await fetch(`${API_URL}/api/subscriptions/prices`);
      if (pricesRes.ok) {
        const pricesData = await pricesRes.json();
        setPrices(pricesData);
      }

      // Fetch current subscription status
      if (token) {
        const statusRes = await fetch(`${API_URL}/api/subscriptions/status`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (statusRes.ok) {
          const statusData = await statusRes.json();
          setCurrentTier(statusData.effective_tier || statusData.tier || 'free');
          setCurrentBillingPeriod(statusData.billing_period || '');
        }
      }
    } catch (error) {
      console.error('Failed to fetch subscription data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubscribe = async (tier: string) => {
    if (!token) {
      Alert.alert('Login Required', 'Please log in to subscribe.');
      router.push('/auth/login');
      return;
    }

    setPurchasing(tier);
    try {
      const response = await fetch(`${API_URL}/api/subscriptions/create-checkout`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tier,
          billing_period: billingPeriod,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        Alert.alert('Error', error.detail || 'Failed to create checkout session');
        return;
      }

      const data = await response.json();
      if (data.checkout_url) {
        await Linking.openURL(data.checkout_url);
      }
    } catch (error) {
      console.error('Subscription error:', error);
      Alert.alert('Error', 'Failed to start subscription process');
    } finally {
      setPurchasing(null);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const proPrice = prices?.pro[billingPeriod];
  const teamPrice = prices?.team[billingPeriod];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Choose Your Plan</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Current Plan Badge */}
      {currentTier !== 'free' && (
        <View style={styles.currentPlanBadge}>
          <Ionicons name="checkmark-circle" size={16} color={colors.success} />
          <Text style={styles.currentPlanText}>
            Current Plan: {currentTier.charAt(0).toUpperCase() + currentTier.slice(1)} ({currentBillingPeriod})
          </Text>
        </View>
      )}

      {/* Billing Period Toggle */}
      <View style={styles.periodToggleContainer}>
        <View style={styles.periodToggle}>
          <TouchableOpacity
            style={[styles.periodBtn, billingPeriod === 'monthly' && styles.periodBtnActive]}
            onPress={() => setBillingPeriod('monthly')}
          >
            <Text style={[styles.periodBtnText, billingPeriod === 'monthly' && styles.periodBtnTextActive]}>
              Monthly
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.periodBtn, billingPeriod === 'yearly' && styles.periodBtnActive]}
            onPress={() => setBillingPeriod('yearly')}
          >
            <Text style={[styles.periodBtnText, billingPeriod === 'yearly' && styles.periodBtnTextActive]}>
              Yearly
            </Text>
            <View style={styles.saveBadge}>
              <Text style={styles.saveBadgeText}>SAVE</Text>
            </View>
          </TouchableOpacity>
        </View>
      </View>

      {/* Pricing Cards */}
      <View style={styles.plansContainer}>
        {/* Free Plan */}
        <View style={[styles.planCard, currentTier === 'free' && styles.planCardCurrent]}>
          <Text style={styles.planName}>Free</Text>
          <View style={styles.priceContainer}>
            <Text style={styles.price}>$0</Text>
            <Text style={styles.pricePeriod}>/forever</Text>
          </View>
          <View style={styles.featuresContainer}>
            <FeatureItem text="Track 2 games" included />
            <FeatureItem text="Basic stats tracking" included />
            <FeatureItem text="Shot charts" included />
            <FeatureItem text="AI Game Summaries" included={false} />
            <FeatureItem text="PDF Export" included={false} />
            <FeatureItem text="Live Sharing" included={false} />
            <FeatureItem text="Season Stats" included={false} />
            <FeatureItem text="Team Mode" included={false} />
          </View>
          {currentTier === 'free' && (
            <View style={styles.currentPlanButton}>
              <Text style={styles.currentPlanButtonText}>Current Plan</Text>
            </View>
          )}
        </View>

        {/* Pro Plan */}
        <LinearGradient
          colors={['#2D1B69', '#1A1A2E']}
          style={[styles.planCard, styles.planCardPro, currentTier === 'pro' && styles.planCardCurrent]}
        >
          <View style={styles.popularBadge}>
            <Text style={styles.popularBadgeText}>MOST POPULAR</Text>
          </View>
          <Text style={styles.planName}>Pro</Text>
          <View style={styles.priceContainer}>
            <Text style={styles.price}>${proPrice?.price.toFixed(2)}</Text>
            <Text style={styles.pricePeriod}>/{billingPeriod === 'monthly' ? 'mo' : 'yr'}</Text>
          </View>
          {billingPeriod === 'monthly' && proPrice?.yearly_total && (
            <Text style={styles.yearlyTotal}>${proPrice.yearly_total}/year if paid monthly</Text>
          )}
          {billingPeriod === 'yearly' && (
            <Text style={styles.savingsText}>{prices?.pro.yearly.savings}</Text>
          )}
          <View style={styles.featuresContainer}>
            <FeatureItem text="Unlimited games" included />
            <FeatureItem text="All basic features" included />
            <FeatureItem text="AI Game Summaries" included />
            <FeatureItem text="PDF Export" included />
            <FeatureItem text="Live Sharing" included />
            <FeatureItem text="Season Stats" included />
            <FeatureItem text="Edit completed games" included />
            <FeatureItem text="Team Mode" included={false} />
          </View>
          {currentTier === 'pro' ? (
            <View style={styles.currentPlanButton}>
              <Text style={styles.currentPlanButtonText}>Current Plan</Text>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.subscribeBtn}
              onPress={() => handleSubscribe('pro')}
              disabled={purchasing === 'pro'}
            >
              {purchasing === 'pro' ? (
                <ActivityIndicator color={colors.text} />
              ) : (
                <Text style={styles.subscribeBtnText}>
                  {currentTier === 'team' ? 'Downgrade to Pro' : 'Upgrade to Pro'}
                </Text>
              )}
            </TouchableOpacity>
          )}
        </LinearGradient>

        {/* Team Plan */}
        <LinearGradient
          colors={['#1B4D3E', '#1A1A2E']}
          style={[styles.planCard, styles.planCardTeam, currentTier === 'team' && styles.planCardCurrent]}
        >
          <Text style={styles.planName}>Team</Text>
          <View style={styles.priceContainer}>
            <Text style={styles.price}>${teamPrice?.price.toFixed(2)}</Text>
            <Text style={styles.pricePeriod}>/{billingPeriod === 'monthly' ? 'mo' : 'yr'}</Text>
          </View>
          {billingPeriod === 'monthly' && teamPrice?.yearly_total && (
            <Text style={styles.yearlyTotal}>${teamPrice.yearly_total}/year if paid monthly</Text>
          )}
          {billingPeriod === 'yearly' && (
            <Text style={styles.savingsText}>{prices?.team.yearly.savings}</Text>
          )}
          <View style={styles.featuresContainer}>
            <FeatureItem text="Everything in Pro" included />
            <FeatureItem text="Team Mode" included />
            <FeatureItem text="Multiple players tracking" included />
            <FeatureItem text="Lineup management" included />
            <FeatureItem text="Team statistics" included />
            <FeatureItem text="In/Out player tracking" included />
          </View>
          {currentTier === 'team' ? (
            <View style={styles.currentPlanButton}>
              <Text style={styles.currentPlanButtonText}>Current Plan</Text>
            </View>
          ) : (
            <TouchableOpacity
              style={[styles.subscribeBtn, styles.subscribeBtnTeam]}
              onPress={() => handleSubscribe('team')}
              disabled={purchasing === 'team'}
            >
              {purchasing === 'team' ? (
                <ActivityIndicator color={colors.text} />
              ) : (
                <Text style={styles.subscribeBtnText}>Upgrade to Team</Text>
              )}
            </TouchableOpacity>
          )}
        </LinearGradient>
      </View>

      {/* Price Comparison */}
      {billingPeriod === 'yearly' && (
        <View style={styles.comparisonCard}>
          <Ionicons name="cash-outline" size={24} color={colors.success} />
          <View style={styles.comparisonContent}>
            <Text style={styles.comparisonTitle}>Save with Yearly Billing</Text>
            <Text style={styles.comparisonText}>
              Pro: Save ${((prices?.pro.monthly.yearly_total || 0) - (prices?.pro.yearly.price || 0)).toFixed(2)}/year
            </Text>
            <Text style={styles.comparisonText}>
              Team: Save ${((prices?.team.monthly.yearly_total || 0) - (prices?.team.yearly.price || 0)).toFixed(2)}/year
            </Text>
          </View>
        </View>
      )}

      {/* Footer */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>
          Cancel anytime. Subscriptions auto-renew until canceled.
        </Text>
      </View>
    </ScrollView>
  );
}

// Feature Item Component
const FeatureItem = ({ text, included }: { text: string; included: boolean }) => (
  <View style={styles.featureItem}>
    <Ionicons
      name={included ? 'checkmark-circle' : 'close-circle'}
      size={18}
      color={included ? colors.success : colors.textSecondary}
    />
    <Text style={[styles.featureText, !included && styles.featureTextDisabled]}>
      {text}
    </Text>
  </View>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingBottom: 40,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
    paddingTop: 60,
  },
  backBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text,
  },
  currentPlanBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    backgroundColor: 'rgba(34, 197, 94, 0.2)',
    paddingVertical: spacing.sm,
    marginHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    marginBottom: spacing.md,
  },
  currentPlanText: {
    color: colors.success,
    fontSize: 14,
    fontWeight: '600',
  },
  periodToggleContainer: {
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  periodToggle: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.full,
    padding: 4,
  },
  periodBtn: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xl,
    borderRadius: borderRadius.full,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  periodBtnActive: {
    backgroundColor: colors.primary,
  },
  periodBtnText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
  periodBtnTextActive: {
    color: colors.text,
  },
  saveBadge: {
    backgroundColor: colors.success,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
  },
  saveBadgeText: {
    color: colors.text,
    fontSize: 10,
    fontWeight: 'bold',
  },
  plansContainer: {
    paddingHorizontal: spacing.md,
    gap: spacing.md,
  },
  planCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  planCardPro: {
    borderColor: colors.primary,
  },
  planCardTeam: {
    borderColor: colors.success,
  },
  planCardCurrent: {
    borderColor: colors.success,
    borderWidth: 3,
  },
  popularBadge: {
    position: 'absolute',
    top: -12,
    alignSelf: 'center',
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderRadius: borderRadius.full,
  },
  popularBadgeText: {
    color: colors.text,
    fontSize: 10,
    fontWeight: 'bold',
  },
  planName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: spacing.sm,
    marginTop: spacing.sm,
  },
  priceContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: spacing.xs,
  },
  price: {
    fontSize: 36,
    fontWeight: 'bold',
    color: colors.text,
  },
  pricePeriod: {
    fontSize: 16,
    color: colors.textSecondary,
    marginLeft: 4,
  },
  yearlyTotal: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  savingsText: {
    fontSize: 14,
    color: colors.success,
    fontWeight: '600',
    marginBottom: spacing.sm,
  },
  featuresContainer: {
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  featureText: {
    color: colors.text,
    fontSize: 14,
  },
  featureTextDisabled: {
    color: colors.textSecondary,
  },
  subscribeBtn: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    marginTop: spacing.lg,
  },
  subscribeBtnTeam: {
    backgroundColor: colors.success,
  },
  subscribeBtnText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: 'bold',
  },
  currentPlanButton: {
    backgroundColor: colors.surfaceLight,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    marginTop: spacing.lg,
  },
  currentPlanButtonText: {
    color: colors.textSecondary,
    fontSize: 16,
    fontWeight: '600',
  },
  comparisonCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(34, 197, 94, 0.1)',
    marginHorizontal: spacing.md,
    marginTop: spacing.lg,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    gap: spacing.md,
  },
  comparisonContent: {
    flex: 1,
  },
  comparisonTitle: {
    color: colors.success,
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: spacing.xs,
  },
  comparisonText: {
    color: colors.text,
    fontSize: 13,
  },
  footer: {
    padding: spacing.lg,
    alignItems: 'center',
  },
  footerText: {
    color: colors.textSecondary,
    fontSize: 12,
    textAlign: 'center',
  },
});
