import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthStore } from '../src/stores/authStore';
import { Button } from '../src/components/Button';
import { colors, spacing } from '../src/utils/theme';
import { Ionicons } from '@expo/vector-icons';

export default function Index() {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuthStore();

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.replace('/(tabs)');
    }
  }, [isAuthenticated, isLoading]);

  if (isLoading) {
    return null;
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.iconContainer}>
          <Ionicons name="basketball" size={80} color={colors.primary} />
        </View>
        <Text style={styles.title}>HoopStats</Text>
        <Text style={styles.subtitle}>Track. Record. Highlight.</Text>
      </View>

      <View style={styles.features}>
        <FeatureItem icon="stats-chart" text="Track all game stats" />
        <FeatureItem icon="camera" text="Capture photos & videos" />
        <FeatureItem icon="sparkles" text="AI-powered highlights" />
        <FeatureItem icon="people" text="Individual & team tracking" />
      </View>

      <View style={styles.buttons}>
        <Button
          title="Get Started"
          onPress={() => router.push('/auth/register')}
          size="large"
        />
        <Button
          title="I already have an account"
          onPress={() => router.push('/auth/login')}
          variant="ghost"
        />
      </View>

      <View style={styles.tiers}>
        <Text style={styles.tiersTitle}>Subscription Plans</Text>
        <View style={styles.tierRow}>
          <TierBadge title="Free" price="$0" features={['Basic stats', 'Last 2 games', 'Photos only']} />
          <TierBadge title="Pro" price="$69.99/yr" features={['All stats', 'Unlimited history', 'Video + Highlights']} highlight />
          <TierBadge title="Team" price="$199.99/yr" features={['Team roster', 'Full analytics', 'Everything in Pro']} />
        </View>
      </View>
    </View>
  );
}

const FeatureItem = ({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) => (
  <View style={styles.featureItem}>
    <Ionicons name={icon} size={24} color={colors.primary} />
    <Text style={styles.featureText}>{text}</Text>
  </View>
);

const TierBadge = ({ title, price, features, highlight }: { title: string; price: string; features: string[]; highlight?: boolean }) => (
  <View style={[styles.tierBadge, highlight && styles.tierHighlight]}>
    <Text style={styles.tierTitle}>{title}</Text>
    <Text style={styles.tierPrice}>{price}</Text>
    {features.map((f, i) => (
      <Text key={i} style={styles.tierFeature}>{f}</Text>
    ))}
  </View>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: spacing.lg,
    justifyContent: 'space-between',
  },
  header: {
    alignItems: 'center',
    marginTop: spacing.xxl,
  },
  iconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  title: {
    fontSize: 40,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: spacing.xs,
  },
  subtitle: {
    fontSize: 18,
    color: colors.textSecondary,
  },
  features: {
    marginVertical: spacing.lg,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  featureText: {
    color: colors.text,
    fontSize: 16,
    marginLeft: spacing.md,
  },
  buttons: {
    gap: spacing.md,
  },
  tiers: {
    marginTop: spacing.lg,
  },
  tiersTitle: {
    color: colors.textSecondary,
    fontSize: 14,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  tierRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  tierBadge: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: spacing.sm,
    alignItems: 'center',
  },
  tierHighlight: {
    backgroundColor: colors.primary,
    transform: [{ scale: 1.05 }],
  },
  tierTitle: {
    color: colors.text,
    fontWeight: 'bold',
    fontSize: 14,
  },
  tierPrice: {
    color: colors.text,
    fontSize: 12,
    marginVertical: 2,
  },
  tierFeature: {
    color: colors.textSecondary,
    fontSize: 9,
    textAlign: 'center',
  },
});
