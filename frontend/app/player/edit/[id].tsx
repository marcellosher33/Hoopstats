import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Modal,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useAuthStore } from '../../../src/stores/authStore';
import { useGameStore } from '../../../src/stores/gameStore';
import { Button } from '../../../src/components/Button';
import { Input } from '../../../src/components/Input';
import { colors, spacing, borderRadius } from '../../../src/utils/theme';

const POSITIONS = ['PG', 'SG', 'SF', 'PF', 'C'];

export default function EditPlayerScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { token } = useAuthStore();
  const { players, teams, updatePlayer, deletePlayer, fetchPlayers, fetchTeams } = useGameStore();

  const player = players.find(p => p.id === id);

  const [name, setName] = useState('');
  const [number, setNumber] = useState('');
  const [position, setPosition] = useState('');
  const [height, setHeight] = useState('');
  const [weight, setWeight] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [teamId, setTeamId] = useState<string | null>(null);
  const [showTeamModal, setShowTeamModal] = useState(false);

  useEffect(() => {
    if (token) {
      fetchTeams(token);
    }
  }, [token]);

  useEffect(() => {
    if (player) {
      setName(player.name);
      setNumber(player.number?.toString() || '');
      setPosition(player.position || '');
      setHeight(player.height || '');
      setWeight(player.weight?.toString() || '');
      setTeamId(player.team_id || null);
      setPhoto(player.photo || null);
    }
  }, [player]);

  const handlePickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.5,
      base64: true,
    });

    if (!result.canceled && result.assets[0].base64) {
      setPhoto(`data:image/jpeg;base64,${result.assets[0].base64}`);
    }
  };

  const handleUpdatePlayer = async () => {
    if (!name.trim()) {
      Alert.alert('Error', 'Please enter player name');
      return;
    }

    setLoading(true);
    try {
      await updatePlayer(
        id!,
        {
          name: name.trim(),
          number: number ? parseInt(number, 10) : undefined,
          position: position || undefined,
          height: height || undefined,
          weight: weight ? parseInt(weight, 10) : undefined,
          photo: photo || undefined,
          team_id: teamId || undefined,
        },
        token!
      );
      router.back();
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to update player');
    } finally {
      setLoading(false);
    }
  };

  const handleDeletePlayer = () => {
    Alert.alert(
      'Delete Player',
      `Are you sure you want to delete ${player?.name}? This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deletePlayer(id!, token!);
              router.replace('/(tabs)/players');
            } catch (error: any) {
              Alert.alert('Error', error.message || 'Failed to delete player');
            }
          },
        },
      ]
    );
  };

  if (!player) {
    return (
      <View style={styles.loading}>
        <Text style={styles.loadingText}>Loading player...</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <ScrollView contentContainerStyle={styles.content}>
        {/* Photo */}
        <View style={styles.photoSection}>
          <TouchableOpacity style={styles.photoContainer} onPress={handlePickImage}>
            {photo ? (
              <View style={styles.photoPreview}>
                <View style={styles.photoAvatar}>
                  <Text style={styles.avatarText}>{name.charAt(0).toUpperCase() || '?'}</Text>
                </View>
              </View>
            ) : (
              <View style={styles.photoPlaceholder}>
                <Ionicons name="camera" size={40} color={colors.textSecondary} />
                <Text style={styles.photoPlaceholderText}>Add Photo</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* Form */}
        <View style={styles.form}>
          <Input
            label="Player Name *"
            value={name}
            onChangeText={setName}
            placeholder="Enter player name"
            autoCapitalize="words"
          />

          <Input
            label="Jersey Number"
            value={number}
            onChangeText={(text) => setNumber(text.replace(/[^0-9]/g, ''))}
            placeholder="e.g., 23"
            keyboardType="numeric"
            maxLength={2}
          />

          <View style={styles.positionSection}>
            <Text style={styles.label}>Position</Text>
            <View style={styles.positionGrid}>
              {POSITIONS.map((pos) => (
                <TouchableOpacity
                  key={pos}
                  style={[
                    styles.positionBtn,
                    position === pos && styles.positionBtnActive,
                  ]}
                  onPress={() => setPosition(position === pos ? '' : pos)}
                >
                  <Text style={[
                    styles.positionBtnText,
                    position === pos && styles.positionBtnTextActive,
                  ]}>
                    {pos}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Physical Attributes */}
          <View style={styles.physicalSection}>
            <Text style={styles.sectionTitle}>Physical Attributes</Text>
            <View style={styles.physicalRow}>
              <View style={styles.physicalField}>
                <Input
                  label="Height"
                  value={height}
                  onChangeText={setHeight}
                  placeholder="e.g., 6'2&quot;"
                />
              </View>
              <View style={styles.physicalField}>
                <Input
                  label="Weight (lbs)"
                  value={weight}
                  onChangeText={(text) => setWeight(text.replace(/[^0-9]/g, ''))}
                  placeholder="e.g., 185"
                  keyboardType="numeric"
                  maxLength={3}
                />
              </View>
            </View>
          </View>
        </View>

        {/* Delete Button */}
        <TouchableOpacity style={styles.deleteButton} onPress={handleDeletePlayer}>
          <Ionicons name="trash-outline" size={20} color={colors.error} />
          <Text style={styles.deleteButtonText}>Delete Player</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Save Button */}
      <View style={styles.footer}>
        <Button
          title="Save Changes"
          onPress={handleUpdatePlayer}
          loading={loading}
          disabled={!name.trim()}
          size="large"
          icon={<Ionicons name="checkmark" size={20} color={colors.text} />}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.md,
    paddingBottom: 120,
  },
  loading: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    color: colors.text,
  },
  photoSection: {
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  photoContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    overflow: 'hidden',
  },
  photoPreview: {
    width: '100%',
    height: '100%',
  },
  photoAvatar: {
    width: '100%',
    height: '100%',
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 48,
    fontWeight: 'bold',
    color: colors.text,
  },
  photoPlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.surfaceLight,
    borderStyle: 'dashed',
    borderRadius: 60,
  },
  photoPlaceholderText: {
    color: colors.textSecondary,
    marginTop: spacing.xs,
    fontSize: 12,
  },
  form: {
    marginBottom: spacing.lg,
  },
  label: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '500',
    marginBottom: spacing.sm,
  },
  positionSection: {
    marginBottom: spacing.md,
  },
  positionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  positionBtn: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.surface,
    minWidth: 60,
    alignItems: 'center',
  },
  positionBtnActive: {
    backgroundColor: colors.primary,
  },
  positionBtnText: {
    color: colors.textSecondary,
    fontWeight: '600',
  },
  positionBtnTextActive: {
    color: colors.text,
  },
  physicalSection: {
    marginTop: spacing.md,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
    marginBottom: spacing.md,
  },
  physicalRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  physicalField: {
    flex: 1,
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  deleteButtonText: {
    color: colors.error,
    fontSize: 16,
    fontWeight: '600',
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.background,
    padding: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.surfaceLight,
  },
});
