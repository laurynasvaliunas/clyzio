import React from 'react';
import { StyleSheet, ViewStyle, View } from 'react-native';
import { BlurView } from 'expo-blur';

interface GlassViewProps {
  children: React.ReactNode;
  intensity?: number;
  tint?: 'light' | 'dark' | 'default';
  style?: ViewStyle;
}

export default function GlassView({ 
  children, 
  intensity = 80, 
  tint = 'light',
  style,
}: GlassViewProps) {
  return (
    <View style={[styles.container, style]}>
      <BlurView 
        intensity={intensity} 
        tint={tint}
        style={styles.blur}
      >
        {children}
      </BlurView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
  },
  blur: {
    overflow: 'hidden',
  },
});

