import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Platform,
  Modal,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../src/stores/authStore';
import { Button } from '../../src/components/Button';
import { colors, spacing, borderRadius } from '../../src/utils/theme';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

export default function ProfileScreen() {
  const router = useRouter();
  const { user, token, logout, refreshUser } = useAuthStore();
  const [upgrading, setUpgrading] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);

  const handleUpgrade = async (tier: 'pro' | 'team') => {
    setUpgrading(true);
    try {
      // For testing, use the test upgrade endpoint
      const response = await fetch(`${API_URL}/api/subscriptions/test-upgrade?tier=${tier}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      
      if (response.ok) {
        await refreshUser();
        Alert.alert('Success', `Upgraded to ${tier.toUpperCase()} tier!`);
      } else {
        const error = await response.json();
        Alert.alert('Error', error.detail || 'Failed to upgrade');
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to upgrade subscription');
    } finally {
      setUpgrading(false);
    }
  };

  const handleDowngrade = async (tier: 'free' | 'pro') => {
    const tierName = tier === 'free' ? 'Free' : 'Pro';
    Alert.alert(
      'Downgrade Subscription',
      `Are you sure you want to downgrade to ${tierName}? You will lose access to premium features.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Downgrade',
          style: 'destructive',
          onPress: async () => {
            setUpgrading(true);
            try {
              const response = await fetch(`${API_URL}/api/subscriptions/test-upgrade?tier=${tier}`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` },
              });
              
              if (response.ok) {
                await refreshUser();
                Alert.alert('Success', `Downgraded to ${tierName} tier`);
              } else {
                const error = await response.json();
                Alert.alert('Error', error.detail || 'Failed to downgrade');
              }
            } catch (error) {
              Alert.alert('Error', 'Failed to downgrade subscription');
            } finally {
              setUpgrading(false);
            }
          },
        },
      ]
    );
  };

  const handleLogout = () => {
    // Use custom modal for web compatibility
    if (Platform.OS === 'web') {
      setShowLogoutModal(true);
    } else {
      Alert.alert(
        'Logout',
        'Are you sure you want to logout?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Logout',
            style: 'destructive',
            onPress: performLogout,
          },
        ]
      );
    }
  };

  const performLogout = async () => {
    setShowLogoutModal(false);
    await logout();
    // Navigate to the auth/login screen or root welcome screen
    // Using '../' to go up from tabs, or direct path to index
    router.replace('/auth/login');
  };

  const tierColors = {
    free: colors.textSecondary,
    pro: colors.primary,
    team: colors.warning,
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Profile Header */}
      <View style={styles.header}>
        <View style={styles.avatar}>
          <Ionicons name="person" size={48} color={colors.text} />
        </View>
        <Text style={styles.username}>{user?.username}</Text>
        <Text style={styles.email}>{user?.email}</Text>
        <View style={[styles.tierBadge, { backgroundColor: tierColors[user?.subscription_tier || 'free'] }]}>
          <Text style={styles.tierText}>{user?.subscription_tier?.toUpperCase() || 'FREE'}</Text>
        </View>
      </View>

      {/* Subscription Plans */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Subscription Plans</Text>
        
        {/* Free Plan */}
        <View style={[styles.planCard, user?.subscription_tier === 'free' && styles.planActive]}>
          <View style={styles.planHeader}>
            <Text style={styles.planName}>Free</Text>
            <Text style={styles.planPrice}>$0</Text>
          </View>
          <View style={styles.planFeatures}>
            <PlanFeature text="Basic stats tracking" included />
            <PlanFeature text="Last 2 completed games" included />
            <PlanFeature text="Photo capture" included />
            <PlanFeature text="Video recording" />
            <PlanFeature text="AI summaries" />
            <PlanFeature text="Highlight reels" />
          </View>
          {user?.subscription_tier === 'free' ? (
            <View style={styles.currentPlan}>
              <Text style={styles.currentPlanText}>Current Plan</Text>
            </View>
          ) : (
            <Button
              title="Downgrade to Free"
              onPress={() => handleDowngrade('free')}
              variant="ghost"
              loading={upgrading}
              style={{ marginTop: spacing.md }}
            />
          )}
        </View>

        {/* Pro Plan */}
        <View style={[styles.planCard, styles.planHighlight, user?.subscription_tier === 'pro' && styles.planActive]}>
          <View style={styles.popularBadge}>
            <Text style={styles.popularText}>MOST POPULAR</Text>
          </View>
          <View style={styles.planHeader}>
            <Text style={styles.planName}>Pro</Text>
            <Text style={styles.planPrice}>$69.99<Text style={styles.planPeriod}>/year</Text></Text>
          </View>
          <View style={styles.planFeatures}>
            <PlanFeature text="All stats tracking" included />
            <PlanFeature text="Unlimited game history" included />
            <PlanFeature text="Photo & video capture" included />
            <PlanFeature text="AI game summaries" included />
            <PlanFeature text="Highlight reel creation" included />
            <PlanFeature text="Shot charts & analytics" included />
            <PlanFeature text="Team roster management" />
          </View>
          {user?.subscription_tier === 'pro' ? (
            <View style={styles.currentPlan}>
              <Text style={styles.currentPlanText}>Current Plan</Text>
            </View>
          ) : user?.subscription_tier === 'team' ? (
            <Button
              title="Downgrade to Pro"
              onPress={() => handleDowngrade('pro')}
              variant="ghost"
              loading={upgrading}
              style={{ marginTop: spacing.md }}
            />
          ) : (
            <Button
              title="Upgrade to Pro"
              onPress={() => handleUpgrade('pro')}
              loading={upgrading}
              style={{ marginTop: spacing.md }}
            />
          )}
        </View>

        {/* Team Plan */}
        <View style={[styles.planCard, user?.subscription_tier === 'team' && styles.planActive]}>
          <View style={styles.planHeader}>
            <Text style={styles.planName}>Team</Text>
            <Text style={styles.planPrice}>$199.99<Text style={styles.planPeriod}>/year</Text></Text>
          </View>
          <View style={styles.planFeatures}>
            <PlanFeature text="Everything in Pro" included />
            <PlanFeature text="Full team roster management" included />
            <PlanFeature text="Team-wide statistics" included />
            <PlanFeature text="Season highlight compilations" included />
            <PlanFeature text="Export & sharing tools" included />
            <PlanFeature text="Priority support" included />
          </View>
          {user?.subscription_tier === 'team' ? (
            <View style={styles.currentPlan}>
              <Text style={styles.currentPlanText}>Current Plan</Text>
            </View>
          ) : (
            <Button
              title="Upgrade to Team"
              onPress={() => handleUpgrade('team')}
              variant="outline"
              loading={upgrading}
              style={{ marginTop: spacing.md }}
            />
          )}
        </View>
      </View>

      {/* Settings */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Settings</Text>
        
        <TouchableOpacity style={styles.settingRow}>
          <Ionicons name="notifications" size={24} color={colors.text} />
          <Text style={styles.settingText}>Notifications</Text>
          <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
        </TouchableOpacity>

        <TouchableOpacity style={styles.settingRow}>
          <Ionicons name="cloud-download" size={24} color={colors.text} />
          <Text style={styles.settingText}>Export Data</Text>
          <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
        </TouchableOpacity>

        <TouchableOpacity style={styles.settingRow}>
          <Ionicons name="help-circle" size={24} color={colors.text} />
          <Text style={styles.settingText}>Help & Support</Text>
          <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
        </TouchableOpacity>

        <TouchableOpacity style={styles.settingRow}>
          <Ionicons name="document-text" size={24} color={colors.text} />
          <Text style={styles.settingText}>Terms & Privacy</Text>
          <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* Logout */}
      <Button
        title="Logout"
        onPress={handleLogout}
        variant="outline"
        style={{ marginTop: spacing.lg }}
        icon={<Ionicons name="log-out" size={20} color={colors.primary} />}
      />

      <Text style={styles.version}>Version 1.0.0</Text>

      {/* Logout Confirmation Modal (Web compatible) */}
      <Modal
        visible={showLogoutModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowLogoutModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Ionicons name="log-out" size={48} color={colors.primary} style={{ marginBottom: spacing.md }} />
            <Text style={styles.modalTitle}>Logout</Text>
            <Text style={styles.modalMessage}>Are you sure you want to logout?</Text>
            <View style={styles.modalButtons}>
              <TouchableOpacity 
                style={[styles.modalButton, styles.modalButtonCancel]}
                onPress={() => setShowLogoutModal(false)}
              >
                <Text style={styles.modalButtonTextCancel}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.modalButton, styles.modalButtonConfirm]}
                onPress={performLogout}
              >
                <Text style={styles.modalButtonTextConfirm}>Logout</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const PlanFeature = ({ text, included }: { text: string; included?: boolean }) => (
  <View style={styles.featureRow}>
    <Ionicons
      name={included ? 'checkmark-circle' : 'close-circle'}
      size={18}
      color={included ? colors.success : colors.textSecondary}
    />
    <Text style={[styles.featureText, !included && styles.featureDisabled]}>{text}</Text>
  </View>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.md,
    paddingBottom: spacing.xxl,
  },
  header: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  username: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text,
  },
  email: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  tierBadge: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    marginTop: spacing.md,
  },
  tierText: {
    color: colors.text,
    fontWeight: 'bold',
    fontSize: 12,
  },
  section: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: spacing.md,
  },
  planCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  planHighlight: {
    borderColor: colors.primary,
  },
  planActive: {
    borderColor: colors.success,
  },
  popularBadge: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
    alignSelf: 'flex-start',
    marginBottom: spacing.sm,
  },
  popularText: {
    color: colors.text,
    fontSize: 10,
    fontWeight: 'bold',
  },
  planHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  planName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text,
  },
  planPrice: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.primary,
  },
  planPeriod: {
    fontSize: 14,
    fontWeight: 'normal',
    color: colors.textSecondary,
  },
  planFeatures: {
    gap: spacing.xs,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  featureText: {
    color: colors.text,
    fontSize: 14,
  },
  featureDisabled: {
    color: colors.textSecondary,
  },
  currentPlan: {
    backgroundColor: colors.success,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    marginTop: spacing.md,
    alignItems: 'center',
  },
  currentPlanText: {
    color: colors.text,
    fontWeight: 'bold',
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  settingText: {
    flex: 1,
    color: colors.text,
    fontSize: 16,
    marginLeft: spacing.md,
  },
  version: {
    textAlign: 'center',
    color: colors.textSecondary,
    fontSize: 12,
    marginTop: spacing.lg,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.xl,
    width: '80%',
    maxWidth: 320,
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: spacing.sm,
  },
  modalMessage: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: spacing.md,
    width: '100%',
  },
  modalButton: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  modalButtonCancel: {
    backgroundColor: colors.surfaceLight,
  },
  modalButtonConfirm: {
    backgroundColor: colors.error,
  },
  modalButtonTextCancel: {
    color: colors.text,
    fontWeight: '600',
  },
  modalButtonTextConfirm: {
    color: colors.text,
    fontWeight: '600',
  },
});
