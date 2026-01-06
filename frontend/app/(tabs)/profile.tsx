import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Platform,
  Modal,
  Linking,
  TextInput,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../src/stores/authStore';
import { usePurchaseStore, formatPrice, ENTITLEMENTS } from '../../src/stores/purchaseStore';
import { Button } from '../../src/components/Button';
import { colors, spacing, borderRadius } from '../../src/utils/theme';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

interface PriceOption {
  price: number;
  yearly_total?: number;
  price_id: string;
  savings: string | null;
}

interface SubscriptionPrices {
  pro: { monthly: PriceOption; yearly: PriceOption };
  team: { monthly: PriceOption; yearly: PriceOption };
}

export default function ProfileScreen() {
  const router = useRouter();
  const { user, token, logout, refreshUser } = useAuthStore();
  const { 
    isInitialized, 
    packages, 
    isPro, 
    isTeam, 
    isLoading: purchaseLoading,
    initializePurchases,
    purchasePackage,
    restorePurchases,
  } = usePurchaseStore();
  const [upgrading, setUpgrading] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'yearly'>('yearly');
  const [prices, setPrices] = useState<SubscriptionPrices | null>(null);
  const [isMasterAdmin, setIsMasterAdmin] = useState(false);
  const [effectiveTier, setEffectiveTier] = useState<string>('free');
  
  // Username editing
  const [showEditUsername, setShowEditUsername] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [savingUsername, setSavingUsername] = useState(false);
  
  // New Season feature
  const [showNewSeasonModal, setShowNewSeasonModal] = useState(false);
  const [seasonName, setSeasonName] = useState('');
  const [applyToAllTeams, setApplyToAllTeams] = useState(true);
  const [selectedTeamIds, setSelectedTeamIds] = useState<string[]>([]);
  const [startingNewSeason, setStartingNewSeason] = useState(false);
  const [archivedSeasons, setArchivedSeasons] = useState<any[]>([]);
  const [showSeasonsHistory, setShowSeasonsHistory] = useState(false);
  const [teams, setTeams] = useState<any[]>([]);

  // Initialize RevenueCat when user is available
  useEffect(() => {
    if (user?.id && !isInitialized) {
      initializePurchases(user.id);
    }
  }, [user?.id, isInitialized]);

  // Fetch subscription prices and check master admin status
  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch prices
        const pricesRes = await fetch(`${API_URL}/api/subscriptions/prices`);
        if (pricesRes.ok) {
          const data = await pricesRes.json();
          setPrices(data);
        }
        
        // Fetch subscription status to check master admin
        if (token) {
          const statusRes = await fetch(`${API_URL}/api/subscriptions/status`, {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          if (statusRes.ok) {
            const statusData = await statusRes.json();
            setIsMasterAdmin(statusData.is_master || false);
            setEffectiveTier(statusData.effective_tier || 'free');
          }
          
          // Fetch archived seasons
          const seasonsRes = await fetch(`${API_URL}/api/seasons`, {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          if (seasonsRes.ok) {
            const seasonsData = await seasonsRes.json();
            setArchivedSeasons(seasonsData);
          }
          
          // Fetch teams for season management
          const teamsRes = await fetch(`${API_URL}/api/teams`, {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          if (teamsRes.ok) {
            const teamsData = await teamsRes.json();
            setTeams(teamsData);
          }
        }
      } catch (error) {
        console.error('Failed to fetch data:', error);
      }
    };
    fetchData();
  }, [token]);

  // Generate default season name based on current date
  const getDefaultSeasonName = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    // If we're in second half of year, use current-next year format
    if (month >= 6) {
      return `${year}-${year + 1} Season`;
    }
    return `${year - 1}-${year} Season`;
  };

  // Handle starting new season
  const handleStartNewSeason = async () => {
    if (!seasonName.trim()) {
      Alert.alert('Error', 'Please enter a season name');
      return;
    }
    
    setStartingNewSeason(true);
    try {
      const response = await fetch(`${API_URL}/api/seasons/new`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          season_name: seasonName.trim(),
          apply_to_all_teams: applyToAllTeams,
        }),
      });
      
      if (response.ok) {
        const data = await response.json();
        setShowNewSeasonModal(false);
        setSeasonName('');
        
        // Refresh archived seasons
        const seasonsRes = await fetch(`${API_URL}/api/seasons`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (seasonsRes.ok) {
          const seasonsData = await seasonsRes.json();
          setArchivedSeasons(seasonsData);
        }
        
        Alert.alert(
          'New Season Started! 🎉',
          `"${data.season_name}" has been archived.\n\n` +
          `Games archived: ${data.games_archived}\n` +
          `Players stats saved: ${data.players_archived}\n` +
          `Record: ${data.team_stats.wins}-${data.team_stats.losses}`,
          [{ text: 'OK' }]
        );
      } else {
        const error = await response.json();
        Alert.alert('Error', error.detail || 'Failed to start new season');
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to start new season');
    } finally {
      setStartingNewSeason(false);
    }
  };

  // Open new season modal
  const openNewSeasonModal = () => {
    setSeasonName(getDefaultSeasonName());
    setApplyToAllTeams(true);
    setShowNewSeasonModal(true);
  };

  // Master admin tier switch for testing
  const handleTestTierSwitch = async (tier: string) => {
    if (!isMasterAdmin) return;
    
    setUpgrading(true);
    try {
      const response = await fetch(`${API_URL}/api/subscriptions/test-upgrade?tier=${tier}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      
      if (response.ok) {
        // Refresh user data to get updated tier
        await refreshUser();
        
        // Also refresh the local effective tier state
        const statusRes = await fetch(`${API_URL}/api/subscriptions/status`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (statusRes.ok) {
          const statusData = await statusRes.json();
          setEffectiveTier(statusData.effective_tier || 'free');
        }
        
        Alert.alert('Tier Switched', `Now testing as ${tier.toUpperCase()} tier`);
      } else {
        const error = await response.json();
        Alert.alert('Error', error.detail || 'Failed to switch tier');
      }
    } catch (error: any) {
      console.error('Tier switch error:', error);
      Alert.alert('Error', error.message || 'Failed to switch tier');
    } finally {
      setUpgrading(false);
    }
  };

  const handlePurchase = async (packageIdentifier: string) => {
    const pkg = packages.find(p => p.identifier === packageIdentifier);
    if (!pkg) {
      // Fall back to test upgrade if no package found (for development)
      handleUpgrade(packageIdentifier.includes('team') ? 'team' : 'pro');
      return;
    }

    setUpgrading(true);
    try {
      const success = await purchasePackage(pkg);
      if (success) {
        await refreshUser();
        Alert.alert('Success', 'Thank you for your purchase!');
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Purchase failed');
    } finally {
      setUpgrading(false);
    }
  };

  const handleRestorePurchases = async () => {
    setUpgrading(true);
    try {
      await restorePurchases();
      await refreshUser();
      Alert.alert('Success', 'Purchases restored successfully!');
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to restore purchases');
    } finally {
      setUpgrading(false);
    }
  };

  const handleUpgrade = async (tier: 'pro' | 'team') => {
    setUpgrading(true);
    try {
      // Master admin uses test-upgrade endpoint (no Stripe needed)
      if (isMasterAdmin) {
        const response = await fetch(`${API_URL}/api/subscriptions/test-upgrade?tier=${tier}`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` },
        });
        
        if (response.ok) {
          await refreshUser();
          
          // Refresh the subscription status to update UI
          const statusRes = await fetch(`${API_URL}/api/subscriptions/status`, {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          if (statusRes.ok) {
            const statusData = await statusRes.json();
            setEffectiveTier(statusData.effective_tier || 'free');
          }
          
          Alert.alert('Success', `Switched to ${tier.toUpperCase()} tier for testing`);
        } else {
          const error = await response.json();
          Alert.alert('Error', error.detail || 'Failed to switch tier');
        }
        setUpgrading(false);
        return;
      }
      
      // Regular users use Stripe checkout
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
      
      if (response.ok) {
        const data = await response.json();
        if (data.checkout_url) {
          await Linking.openURL(data.checkout_url);
        }
      } else {
        const error = await response.json();
        Alert.alert('Error', error.detail || 'Failed to start checkout');
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to start subscription process');
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
                
                // Refresh the subscription status to update UI
                const statusRes = await fetch(`${API_URL}/api/subscriptions/status`, {
                  headers: { 'Authorization': `Bearer ${token}` }
                });
                if (statusRes.ok) {
                  const statusData = await statusRes.json();
                  setEffectiveTier(statusData.effective_tier || 'free');
                }
                
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

  const handleEditUsername = () => {
    setNewUsername(user?.username || '');
    setShowEditUsername(true);
  };

  const handleSaveUsername = async () => {
    if (!newUsername.trim()) {
      Alert.alert('Error', 'Username cannot be empty');
      return;
    }
    
    if (newUsername.trim() === user?.username) {
      setShowEditUsername(false);
      return;
    }
    
    setSavingUsername(true);
    try {
      const response = await fetch(`${API_URL}/api/auth/me`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username: newUsername.trim() }),
      });
      
      if (response.ok) {
        await refreshUser();
        setShowEditUsername(false);
        Alert.alert('Success', 'Username updated successfully');
      } else {
        const error = await response.json();
        Alert.alert('Error', error.detail || 'Failed to update username');
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to update username');
    } finally {
      setSavingUsername(false);
    }
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
        <View style={styles.usernameRow}>
          <Text style={styles.username}>{user?.username}</Text>
          <TouchableOpacity onPress={handleEditUsername} style={styles.editUsernameBtn}>
            <Ionicons name="pencil" size={16} color={colors.primary} />
          </TouchableOpacity>
        </View>
        <Text style={styles.email}>{user?.email}</Text>
        <View style={[styles.tierBadge, { backgroundColor: tierColors[user?.subscription_tier || 'free'] }]}>
          <Text style={styles.tierText}>{user?.subscription_tier?.toUpperCase() || 'FREE'}</Text>
        </View>
        {isMasterAdmin && (
          <View style={styles.masterBadge}>
            <Ionicons name="shield-checkmark" size={14} color={colors.text} />
            <Text style={styles.masterBadgeText}>MASTER ADMIN</Text>
          </View>
        )}
      </View>

      {/* Master Admin Tier Switcher */}
      {isMasterAdmin && (
        <View style={styles.masterSection}>
          <Text style={styles.masterSectionTitle}>
            <Ionicons name="settings" size={16} color={colors.warning} /> Test Subscription Tiers
          </Text>
          <Text style={styles.masterSectionSubtitle}>
            Switch tiers to test feature restrictions. You always have full access as master admin.
          </Text>
          <View style={styles.tierSwitcher}>
            <TouchableOpacity
              style={[styles.tierSwitchBtn, user?.subscription_tier === 'free' && styles.tierSwitchBtnActive]}
              onPress={() => handleTestTierSwitch('free')}
              disabled={upgrading}
            >
              <Text style={[styles.tierSwitchBtnText, user?.subscription_tier === 'free' && styles.tierSwitchBtnTextActive]}>Free</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tierSwitchBtn, user?.subscription_tier === 'pro' && styles.tierSwitchBtnActive]}
              onPress={() => handleTestTierSwitch('pro')}
              disabled={upgrading}
            >
              <Text style={[styles.tierSwitchBtnText, user?.subscription_tier === 'pro' && styles.tierSwitchBtnTextActive]}>Pro</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tierSwitchBtn, user?.subscription_tier === 'team' && styles.tierSwitchBtnActive]}
              onPress={() => handleTestTierSwitch('team')}
              disabled={upgrading}
            >
              <Text style={[styles.tierSwitchBtnText, user?.subscription_tier === 'team' && styles.tierSwitchBtnTextActive]}>Team</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Subscription Plans */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Subscription Plans</Text>
        
        {/* Billing Period Toggle */}
        <View style={styles.billingToggleContainer}>
          <View style={styles.billingToggle}>
            <TouchableOpacity
              style={[styles.billingBtn, billingPeriod === 'monthly' && styles.billingBtnActive]}
              onPress={() => setBillingPeriod('monthly')}
            >
              <Text style={[styles.billingBtnText, billingPeriod === 'monthly' && styles.billingBtnTextActive]}>
                Monthly
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.billingBtn, billingPeriod === 'yearly' && styles.billingBtnActive]}
              onPress={() => setBillingPeriod('yearly')}
            >
              <Text style={[styles.billingBtnText, billingPeriod === 'yearly' && styles.billingBtnTextActive]}>
                Yearly
              </Text>
              <View style={styles.saveBadge}>
                <Text style={styles.saveBadgeText}>SAVE</Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>
        
        {/* Restore Purchases Button */}
        <TouchableOpacity 
          style={styles.restoreButton}
          onPress={handleRestorePurchases}
          disabled={upgrading || purchaseLoading}
        >
          <Ionicons name="refresh" size={18} color={colors.primary} />
          <Text style={styles.restoreText}>Restore Purchases</Text>
        </TouchableOpacity>
        
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
            <PlanFeature text="AI summaries" />
            <PlanFeature text="PDF Export" />
            <PlanFeature text="Live Sharing" />
            <PlanFeature text="Team Mode" />
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
            <View style={styles.priceContainer}>
              <Text style={styles.planPrice}>
                ${prices?.pro[billingPeriod]?.price.toFixed(2) || (billingPeriod === 'monthly' ? '5.99' : '59.99')}
              </Text>
              <Text style={styles.planPeriod}>/{billingPeriod === 'monthly' ? 'mo' : 'yr'}</Text>
            </View>
          </View>
          {billingPeriod === 'monthly' && prices?.pro.monthly.yearly_total && (
            <Text style={styles.yearlyTotalText}>${prices.pro.monthly.yearly_total}/year if paid monthly</Text>
          )}
          {billingPeriod === 'yearly' && prices?.pro.yearly.savings && (
            <Text style={styles.savingsText}>{prices.pro.yearly.savings}</Text>
          )}
          <View style={styles.planFeatures}>
            <PlanFeature text="All stats tracking" included />
            <PlanFeature text="Unlimited game history" included />
            <PlanFeature text="AI game summaries" included />
            <PlanFeature text="PDF Export" included />
            <PlanFeature text="Live Sharing" included />
            <PlanFeature text="Season Stats" included />
            <PlanFeature text="Team Mode" />
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
              title={`Upgrade to Pro - $${prices?.pro[billingPeriod]?.price.toFixed(2) || '59.99'}/${billingPeriod === 'monthly' ? 'mo' : 'yr'}`}
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
            <View style={styles.priceContainer}>
              <Text style={styles.planPrice}>
                ${prices?.team[billingPeriod]?.price.toFixed(2) || (billingPeriod === 'monthly' ? '16.99' : '159.99')}
              </Text>
              <Text style={styles.planPeriod}>/{billingPeriod === 'monthly' ? 'mo' : 'yr'}</Text>
            </View>
          </View>
          {billingPeriod === 'monthly' && prices?.team.monthly.yearly_total && (
            <Text style={styles.yearlyTotalText}>${prices.team.monthly.yearly_total}/year if paid monthly</Text>
          )}
          {billingPeriod === 'yearly' && prices?.team.yearly.savings && (
            <Text style={styles.savingsText}>{prices.team.yearly.savings}</Text>
          )}
          <View style={styles.planFeatures}>
            <PlanFeature text="Everything in Pro" included />
            <PlanFeature text="Team Mode" included />
            <PlanFeature text="Full team roster management" included />
            <PlanFeature text="In/Out player tracking" included />
            <PlanFeature text="Team-wide statistics" included />
            <PlanFeature text="Priority support" included />
          </View>
          {user?.subscription_tier === 'team' ? (
            <View style={styles.currentPlan}>
              <Text style={styles.currentPlanText}>Current Plan</Text>
            </View>
          ) : (
            <Button
              title={`Upgrade to Team - $${prices?.team[billingPeriod]?.price.toFixed(2) || '159.99'}/${billingPeriod === 'monthly' ? 'mo' : 'yr'}`}
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
        
        <TouchableOpacity 
          style={styles.settingRow}
          onPress={() => Alert.alert('Notifications', 'Notification settings coming soon. You\'ll be able to configure game reminders, stat alerts, and more.')}
        >
          <Ionicons name="notifications" size={24} color={colors.text} />
          <Text style={styles.settingText}>Notifications</Text>
          <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.settingRow}
          onPress={() => Alert.alert('Export Data', 'Data export feature coming soon. You\'ll be able to export your game stats to CSV or PDF.')}
        >
          <Ionicons name="cloud-download" size={24} color={colors.text} />
          <Text style={styles.settingText}>Export Data</Text>
          <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.settingRow}
          onPress={() => Alert.alert('Help & Support', 'Need help? Contact us at support@hoopstats.app\n\nFAQ:\n• Tap stats to record them\n• Long-press to manually adjust\n• Use Team Mode for multiple players')}
        >
          <Ionicons name="help-circle" size={24} color={colors.text} />
          <Text style={styles.settingText}>Help & Support</Text>
          <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.settingRow}
          onPress={() => Alert.alert('Terms & Privacy', 'By using this app, you agree to our Terms of Service and Privacy Policy.\n\nYour data is stored securely and never shared with third parties without your consent.')}
        >
          <Ionicons name="document-text" size={24} color={colors.text} />
          <Text style={styles.settingText}>Terms & Privacy</Text>
          <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* Season Management - Pro+ only */}
      {(effectiveTier === 'pro' || effectiveTier === 'team' || isMasterAdmin) && (
        <View style={styles.seasonSection}>
          <Text style={styles.sectionTitle}>
            <Ionicons name="calendar" size={18} color={colors.primary} /> Season Management
          </Text>
          
          <TouchableOpacity 
            style={styles.newSeasonButton}
            onPress={openNewSeasonModal}
          >
            <Ionicons name="add-circle" size={24} color={colors.text} />
            <View style={styles.newSeasonTextContainer}>
              <Text style={styles.newSeasonTitle}>Start New Season</Text>
              <Text style={styles.newSeasonSubtitle}>Archive current stats and reset for new season</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
          </TouchableOpacity>
          
          {archivedSeasons.length > 0 && (
            <TouchableOpacity 
              style={styles.seasonsHistoryButton}
              onPress={() => setShowSeasonsHistory(!showSeasonsHistory)}
            >
              <Ionicons name="time" size={24} color={colors.text} />
              <View style={styles.newSeasonTextContainer}>
                <Text style={styles.newSeasonTitle}>Previous Seasons</Text>
                <Text style={styles.newSeasonSubtitle}>{archivedSeasons.length} season{archivedSeasons.length !== 1 ? 's' : ''} archived</Text>
              </View>
              <Ionicons name={showSeasonsHistory ? "chevron-up" : "chevron-down"} size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          )}
          
          {showSeasonsHistory && archivedSeasons.length > 0 && (
            <View style={styles.seasonsHistoryList}>
              {archivedSeasons.map((season) => (
                <View key={season.id} style={styles.seasonHistoryItem}>
                  <View style={styles.seasonHistoryHeader}>
                    <Text style={styles.seasonHistoryName}>{season.name}</Text>
                    <Text style={styles.seasonHistoryRecord}>
                      {season.team_stats?.wins || 0}-{season.team_stats?.losses || 0}
                    </Text>
                  </View>
                  <Text style={styles.seasonHistoryDetails}>
                    {season.games_count} games • {season.player_stats?.length || 0} players
                  </Text>
                  <Text style={styles.seasonHistoryDates}>
                    {new Date(season.start_date).toLocaleDateString()} - {new Date(season.end_date).toLocaleDateString()}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>
      )}

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

      {/* Edit Username Modal */}
      <Modal
        visible={showEditUsername}
        transparent
        animationType="fade"
        onRequestClose={() => setShowEditUsername(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Ionicons name="person-circle" size={48} color={colors.primary} style={{ marginBottom: spacing.md }} />
            <Text style={styles.modalTitle}>Edit Username</Text>
            <TextInput
              style={styles.usernameInput}
              value={newUsername}
              onChangeText={setNewUsername}
              placeholder="Enter new username"
              placeholderTextColor={colors.textSecondary}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity 
                style={[styles.modalButton, styles.modalButtonCancel]}
                onPress={() => setShowEditUsername(false)}
                disabled={savingUsername}
              >
                <Text style={styles.modalButtonTextCancel}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.modalButton, styles.modalButtonConfirm]}
                onPress={handleSaveUsername}
                disabled={savingUsername}
              >
                <Text style={styles.modalButtonTextConfirm}>
                  {savingUsername ? 'Saving...' : 'Save'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* New Season Modal */}
      <Modal
        visible={showNewSeasonModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowNewSeasonModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Ionicons name="calendar" size={48} color={colors.primary} style={{ marginBottom: spacing.md }} />
            <Text style={styles.modalTitle}>Start New Season</Text>
            <Text style={styles.modalMessage}>
              This will archive all current game statistics and start fresh. Your previous data will be saved and accessible.
            </Text>
            
            <Text style={styles.inputLabel}>Season Name</Text>
            <TextInput
              style={styles.usernameInput}
              value={seasonName}
              onChangeText={setSeasonName}
              placeholder="e.g., 2024-2025 Season"
              placeholderTextColor={colors.textSecondary}
            />
            
            {effectiveTier === 'team' && (
              <TouchableOpacity 
                style={styles.checkboxRow}
                onPress={() => setApplyToAllTeams(!applyToAllTeams)}
              >
                <View style={[styles.checkbox, applyToAllTeams && styles.checkboxChecked]}>
                  {applyToAllTeams && <Ionicons name="checkmark" size={16} color={colors.text} />}
                </View>
                <Text style={styles.checkboxLabel}>Apply to all teams</Text>
              </TouchableOpacity>
            )}
            
            <View style={styles.modalButtons}>
              <TouchableOpacity 
                style={[styles.modalButton, styles.modalButtonCancel]}
                onPress={() => setShowNewSeasonModal(false)}
                disabled={startingNewSeason}
              >
                <Text style={styles.modalButtonTextCancel}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.modalButton, styles.newSeasonConfirmBtn]}
                onPress={handleStartNewSeason}
                disabled={startingNewSeason}
              >
                <Text style={styles.modalButtonTextConfirm}>
                  {startingNewSeason ? 'Archiving...' : 'Start New Season'}
                </Text>
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
  usernameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  editUsernameBtn: {
    padding: spacing.xs,
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
  masterBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.warning,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    marginTop: spacing.sm,
  },
  masterBadgeText: {
    color: colors.text,
    fontWeight: 'bold',
    fontSize: 10,
  },
  masterSection: {
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.warning,
  },
  masterSectionTitle: {
    color: colors.warning,
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: spacing.xs,
  },
  masterSectionSubtitle: {
    color: colors.textSecondary,
    fontSize: 12,
    marginBottom: spacing.md,
  },
  tierSwitcher: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  tierSwitchBtn: {
    flex: 1,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surface,
    alignItems: 'center',
  },
  tierSwitchBtnActive: {
    backgroundColor: colors.warning,
  },
  tierSwitchBtnText: {
    color: colors.textSecondary,
    fontWeight: '600',
  },
  tierSwitchBtnTextActive: {
    color: colors.text,
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
  billingToggleContainer: {
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  billingToggle: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.full,
    padding: 4,
  },
  billingBtn: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.full,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  billingBtnActive: {
    backgroundColor: colors.primary,
  },
  billingBtnText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
  billingBtnTextActive: {
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
  restoreButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    marginBottom: spacing.md,
  },
  restoreText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '600',
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
  priceContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  yearlyTotalText: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: -spacing.sm,
    marginBottom: spacing.sm,
  },
  savingsText: {
    fontSize: 14,
    color: colors.success,
    fontWeight: '600',
    marginTop: -spacing.sm,
    marginBottom: spacing.sm,
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
  usernameInput: {
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    color: colors.text,
    fontSize: 16,
    width: '100%',
    marginBottom: spacing.lg,
  },
  // Season Management Styles
  seasonSection: {
    marginTop: spacing.lg,
    marginBottom: spacing.lg,
  },
  newSeasonButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginTop: spacing.sm,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  seasonsHistoryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginTop: spacing.sm,
  },
  newSeasonTextContainer: {
    flex: 1,
    marginLeft: spacing.md,
  },
  newSeasonTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  newSeasonSubtitle: {
    color: colors.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  seasonsHistoryList: {
    marginTop: spacing.sm,
  },
  seasonHistoryItem: {
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.xs,
  },
  seasonHistoryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  seasonHistoryName: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  seasonHistoryRecord: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: 'bold',
  },
  seasonHistoryDetails: {
    color: colors.textSecondary,
    fontSize: 12,
    marginTop: 4,
  },
  seasonHistoryDates: {
    color: colors.textSecondary,
    fontSize: 11,
    marginTop: 2,
  },
  inputLabel: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
    alignSelf: 'flex-start',
    marginBottom: spacing.xs,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
    width: '100%',
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: colors.textSecondary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  checkboxChecked: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  checkboxLabel: {
    color: colors.text,
    fontSize: 14,
  },
  newSeasonConfirmBtn: {
    backgroundColor: colors.primary,
  },
});
