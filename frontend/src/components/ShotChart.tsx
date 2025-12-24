import React, { useRef, useState } from 'react';
import { View, StyleSheet, Pressable, LayoutChangeEvent, GestureResponderEvent, Text } from 'react-native';
import Svg, { Rect, Circle, Line, Path, G, Defs, RadialGradient, Stop } from 'react-native-svg';
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
  shots = [],
  onCourtPress,
  width = 300,
  height = 280,
  interactive = false,
}) => {
  const containerRef = useRef<View>(null);
  const [layout, setLayout] = useState({ x: 0, y: 0, width: width, height: height });

  const handleLayout = (event: LayoutChangeEvent) => {
    const { x, y, width: w, height: h } = event.nativeEvent.layout;
    setLayout({ x, y, width: w, height: h });
  };

  const handlePress = (event: GestureResponderEvent) => {
    if (!interactive || !onCourtPress) return;
    
    const { locationX, locationY } = event.nativeEvent;
    
    // Calculate normalized coordinates (0-1 range)
    let x: number, y: number;
    
    if (typeof locationX === 'number' && typeof locationY === 'number' && locationX >= 0 && locationY >= 0) {
      // Mobile - use locationX/Y directly
      x = locationX / layout.width;
      y = locationY / layout.height;
    } else {
      // Web fallback - use pageX/Y minus element position
      const { pageX, pageY } = event.nativeEvent;
      x = pageX / layout.width;
      y = pageY / layout.height;
    }
    
    // Clamp values between 0 and 1
    x = Math.max(0, Math.min(1, x));
    y = Math.max(0, Math.min(1, y));
    
    console.log('[ShotChart] Shot recorded at:', { x: x.toFixed(3), y: y.toFixed(3) });
    onCourtPress(x, y);
  };

  // SVG viewBox dimensions
  const viewBoxWidth = 100;
  const viewBoxHeight = 94;

  // Convert normalized coordinates (0-1) to viewBox coordinates
  const toSvgX = (x: number) => x * viewBoxWidth;
  const toSvgY = (y: number) => y * viewBoxHeight;

  return (
    <View 
      ref={containerRef} 
      onLayout={handleLayout}
      style={styles.container}
    >
      <Pressable
        onPress={interactive ? handlePress : undefined}
        disabled={!interactive}
        style={({ pressed }) => [
          styles.pressable,
          interactive && pressed && styles.pressed,
        ]}
      >
        <Svg width={width} height={height} viewBox={`0 0 ${viewBoxWidth} ${viewBoxHeight}`}>
          <Defs>
            <RadialGradient id="courtGradient" cx="50%" cy="0%" r="100%">
              <Stop offset="0%" stopColor={colors.court} />
              <Stop offset="100%" stopColor={colors.courtDark || '#2a2a2a'} />
            </RadialGradient>
          </Defs>
          
          {/* Court background */}
          <Rect x="0" y="0" width={viewBoxWidth} height={viewBoxHeight} fill="url(#courtGradient)" />
          
          {/* Court outline */}
          <Rect 
            x="0.5" y="0.5" 
            width={viewBoxWidth - 1} 
            height={viewBoxHeight - 1} 
            fill="none" 
            stroke={colors.courtLines} 
            strokeWidth="0.8" 
          />
          
          {/* Paint/Key area */}
          <Rect x="31" y="0" width="38" height="19" fill="none" stroke={colors.courtLines} strokeWidth="0.5" />
          
          {/* Restricted area arc */}
          <Path
            d="M 46 5.25 A 4 4 0 0 0 54 5.25"
            fill="none"
            stroke={colors.courtLines}
            strokeWidth="0.4"
          />
          
          {/* Free throw circle */}
          <Circle cx="50" cy="19" r="6" fill="none" stroke={colors.courtLines} strokeWidth="0.5" />
          
          {/* Basket */}
          <Rect x="47" y="4" width="6" height="0.4" fill={colors.courtLines} />
          <Circle cx="50" cy="5.25" r="0.9" fill="none" stroke={colors.primary} strokeWidth="0.5" />
          
          {/* Backboard */}
          <Line x1="44" y1="4" x2="56" y2="4" stroke={colors.courtLines} strokeWidth="0.6" />
          
          {/* Three point line */}
          <Path
            d="M 3 0 L 3 14 Q 3 42 50 42 Q 97 42 97 14 L 97 0"
            fill="none"
            stroke={colors.courtLines}
            strokeWidth="0.6"
          />
          
          {/* Half court line */}
          <Line x1="0" y1={viewBoxHeight - 0.5} x2={viewBoxWidth} y2={viewBoxHeight - 0.5} stroke={colors.courtLines} strokeWidth="0.8" />
          
          {/* Center circle (half) */}
          <Path
            d="M 38 94 A 12 12 0 0 1 62 94"
            fill="none"
            stroke={colors.courtLines}
            strokeWidth="0.5"
          />
          
          {/* Shot markers - render all shots */}
          {shots && shots.length > 0 && shots.map((shot, index) => {
            const svgX = toSvgX(shot.x);
            const svgY = toSvgY(shot.y);
            const isMade = shot.made;
            
            return (
              <G key={`shot-${index}`}>
                {/* Outer glow for visibility */}
                <Circle
                  cx={svgX}
                  cy={svgY}
                  r="3"
                  fill={isMade ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}
                />
                {/* Main shot marker */}
                <Circle
                  cx={svgX}
                  cy={svgY}
                  r="2"
                  fill={isMade ? colors.success : colors.error}
                  stroke={isMade ? '#059669' : '#dc2626'}
                  strokeWidth="0.4"
                />
                {/* X mark for misses */}
                {!isMade && (
                  <>
                    <Line
                      x1={svgX - 1.2}
                      y1={svgY - 1.2}
                      x2={svgX + 1.2}
                      y2={svgY + 1.2}
                      stroke="white"
                      strokeWidth="0.6"
                    />
                    <Line
                      x1={svgX + 1.2}
                      y1={svgY - 1.2}
                      x2={svgX - 1.2}
                      y2={svgY + 1.2}
                      stroke="white"
                      strokeWidth="0.6"
                    />
                  </>
                )}
                {/* Checkmark for makes */}
                {isMade && (
                  <Path
                    d={`M ${svgX - 1} ${svgY} L ${svgX - 0.3} ${svgY + 0.8} L ${svgX + 1} ${svgY - 0.8}`}
                    fill="none"
                    stroke="white"
                    strokeWidth="0.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                )}
              </G>
            );
          })}
        </Svg>
      </Pressable>
      
      {/* Legend */}
      {shots && shots.length > 0 && (
        <View style={styles.legend}>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: colors.success }]} />
            <Text style={styles.legendText}>Made ({shots.filter(s => s.made).length})</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: colors.error }]} />
            <Text style={styles.legendText}>Missed ({shots.filter(s => !s.made).length})</Text>
          </View>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
  },
  pressable: {
    borderRadius: 8,
    overflow: 'hidden',
  },
  pressed: {
    opacity: 0.9,
  },
  legend: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 8,
    gap: 16,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendText: {
    color: colors.textSecondary,
    fontSize: 12,
  },
});
