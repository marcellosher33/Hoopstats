import React, { useRef } from 'react';
import { View, StyleSheet, Pressable, LayoutChangeEvent, GestureResponderEvent } from 'react-native';
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
  const containerRef = useRef<View>(null);
  const layoutRef = useRef({ x: 0, y: 0, width: width, height: height });

  const handleLayout = (event: LayoutChangeEvent) => {
    layoutRef.current = event.nativeEvent.layout;
  };

  const handlePress = (event: GestureResponderEvent) => {
    if (!interactive || !onCourtPress) return;
    
    // Get the touch position relative to the component
    const { locationX, locationY, pageX, pageY } = event.nativeEvent;
    
    let x: number, y: number;
    
    // Use locationX/Y if available (mobile), otherwise calculate from pageX/Y (web)
    if (typeof locationX === 'number' && typeof locationY === 'number') {
      x = locationX / width;
      y = locationY / height;
    } else {
      // For web, we need to calculate relative position
      x = (pageX - layoutRef.current.x) / layoutRef.current.width;
      y = (pageY - layoutRef.current.y) / layoutRef.current.height;
    }
    
    // Clamp values between 0 and 1
    x = Math.max(0, Math.min(1, x));
    y = Math.max(0, Math.min(1, y));
    
    console.log('[ShotChart] Press detected:', { x, y, locationX, locationY });
    onCourtPress(x, y);
  };

  // Convert shot coordinates (0-1) to viewBox coordinates (0-100)
  const toViewBoxX = (x: number) => x * 100;
  const toViewBoxY = (y: number) => y * 94;

  return (
    <View ref={containerRef} onLayout={handleLayout}>
      <Pressable
        onPress={interactive ? handlePress : undefined}
        disabled={!interactive}
        style={{ opacity: interactive ? 1 : 1 }}
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
          
          {/* Shots - convert from 0-1 range to viewBox coordinates */}
          {shots.map((shot, index) => (
            <Circle
              key={index}
              cx={toViewBoxX(shot.x)}
              cy={toViewBoxY(shot.y)}
              r="2"
              fill={shot.made ? colors.shotMade : colors.shotMissed}
              opacity={0.8}
            />
          ))}
        </Svg>
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
