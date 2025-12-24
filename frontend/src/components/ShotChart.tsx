import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import Svg, { Rect, Circle, Line, Path, G } from 'react-native-svg';
import { colors } from '../utils/theme';
import { ShotAttempt } from '../types';

interface ShotChartProps {
  shots: ShotAttempt[];
  onCourtPress?: (x: number, y: number) => void;
  width?: number;
  height?: number;
  interactive?: boolean;
}

export const ShotChart: React.FC<ShotChartProps> = ({
  shots,
  onCourtPress,
  width = 300,
  height = 280,
  interactive = false,
}) => {
  const handlePress = (event: any) => {
    if (!interactive || !onCourtPress) return;
    
    const { locationX, locationY } = event.nativeEvent;
    const x = (locationX / width) * 100;
    const y = (locationY / height) * 100;
    onCourtPress(x, y);
  };

  return (
    <TouchableOpacity
      onPress={interactive ? handlePress : undefined}
      activeOpacity={interactive ? 0.9 : 1}
      disabled={!interactive}
    >
      <Svg width={width} height={height} viewBox="0 0 100 94">
        {/* Court background */}
        <Rect x="0" y="0" width="100" height="94" fill={colors.court} />
        
        {/* Court outline */}
        <Rect x="0" y="0" width="100" height="94" fill="none" stroke={colors.courtLines} strokeWidth="0.5" />
        
        {/* Paint/Key */}
        <Rect x="31" y="0" width="38" height="19" fill="none" stroke={colors.courtLines} strokeWidth="0.5" />
        
        {/* Free throw circle */}
        <Circle cx="50" cy="19" r="6" fill="none" stroke={colors.courtLines} strokeWidth="0.5" />
        
        {/* Basket */}
        <Circle cx="50" cy="5.25" r="0.75" fill={colors.primary} />
        <Rect x="44" y="4" width="12" height="0.5" fill={colors.courtLines} />
        
        {/* Three point line */}
        <Path
          d="M 3 0 L 3 14 Q 3 40 50 40 Q 97 40 97 14 L 97 0"
          fill="none"
          stroke={colors.courtLines}
          strokeWidth="0.5"
        />
        
        {/* Half court line */}
        <Line x1="0" y1="94" x2="100" y2="94" stroke={colors.courtLines} strokeWidth="0.5" />
        
        {/* Center circle (partial) */}
        <Path
          d="M 38 94 A 12 12 0 0 1 62 94"
          fill="none"
          stroke={colors.courtLines}
          strokeWidth="0.5"
        />
        
        {/* Shots */}
        {shots.map((shot, index) => (
          <Circle
            key={index}
            cx={shot.x}
            cy={shot.y}
            r="2"
            fill={shot.made ? colors.shotMade : colors.shotMissed}
            opacity={0.8}
          />
        ))}
      </Svg>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
