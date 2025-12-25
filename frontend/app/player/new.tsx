import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useAuthStore } from '../../src/stores/authStore';
import { useGameStore } from '../../src/stores/gameStore';
import { Button } from '../../src/components/Button';
import { Input } from '../../src/components/Input';
import { colors, spacing, borderRadius } from '../../src/utils/theme';

const POSITIONS = ['PG', 'SG', 'SF', 'PF', 'C'];

export default function NewPlayerScreen() {
  const router = useRouter();
  const { token } = useAuthStore();
  const { createPlayer } = useGameStore();

  const [name, setName] = useState('');
  const [number, setNumber] = useState('');
  const [position, setPosition] = useState('');
  const [height, setHeight] = useState('');
  const [weight, setWeight] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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

  const handleCreatePlayer = async () => {
    if (!name.trim()) {
      Alert.alert('Error', 'Please enter player name');
      return;
    }

    setLoading(true);
    try {
      await createPlayer(
        {
          name: name.trim(),
          number: number ? parseInt(number, 10) : undefined,
          position: position || undefined,
          height: height || undefined,
          weight: weight ? parseInt(weight, 10) : undefined,
          photo: photo || undefined,
        },
        token!
      );
      router.back();
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to create player');
    } finally {
      setLoading(false);
    }
  };

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
            <Text style={styles.label}>Physical Attributes</Text>
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

        {/* Preview */}
        <View style={styles.preview}>
          <Text style={styles.previewTitle}>Preview</Text>
          <View style={styles.previewCard}>
            <View style={styles.previewAvatar}>
              <Text style={styles.previewAvatarText}>
                {name.charAt(0).toUpperCase() || '?'}
              </Text>
              {number && (
                <View style={styles.previewNumber}>
                  <Text style={styles.previewNumberText}>#{number}</Text>
                </View>
              )}
            </View>
            <Text style={styles.previewName}>{name || 'Player Name'}</Text>
            {position && <Text style={styles.previewPosition}>{position}</Text>}
          </View>
        </View>
      </ScrollView>

      {/* Create Button */}
      <View style={styles.footer}>
        <Button
          title="Add Player"
          onPress={handleCreatePlayer}
          loading={loading}
          disabled={!name.trim()}
          size="large"
          icon={<Ionicons name="person-add" size={20} color={colors.text} />}
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
    paddingBottom: 100,
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
  physicalRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  physicalField: {
    flex: 1,
  },
  preview: {
    marginBottom: spacing.lg,
  },
  previewTitle: {
    color: colors.textSecondary,
    fontSize: 12,
    marginBottom: spacing.sm,
  },
  previewCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    alignItems: 'center',
  },
  previewAvatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    marginBottom: spacing.sm,
  },
  previewAvatarText: {
    fontSize: 32,
    fontWeight: 'bold',
    color: colors.text,
  },
  previewNumber: {
    position: 'absolute',
    bottom: -4,
    right: -4,
    backgroundColor: colors.secondary,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
    borderWidth: 2,
    borderColor: colors.surface,
  },
  previewNumberText: {
    color: colors.text,
    fontSize: 10,
    fontWeight: 'bold',
  },
  previewName: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '600',
  },
  previewPosition: {
    color: colors.textSecondary,
    fontSize: 14,
    marginTop: 2,
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
