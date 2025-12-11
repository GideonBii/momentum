// ./screens/SplashScreen.js
import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Dimensions,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { G, Path, Svg } from 'react-native-svg';

const { width, height } = Dimensions.get('window');

const COLORS = {
  background: "#3e2a24", // Dark brown background (inverted)
  card: "#4A3228", // Slightly lighter dark brown
  warm: "#A98467", // Original warm color
  blush: "#D8A39D", // Original blush
  text: "#FCF7F5", // Light text (inverted)
  softText: "#EFE6E2", // Light soft text
  border: "#5C443A", // Dark border
  accent: "#4A3228", // Dark accent
};

export default function SplashScreen({ onLoadingComplete }) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.9)).current;
  const slideUpAnim = useRef(new Animated.Value(20)).current;

  // 5 chevrons for clean progression
  const chevronAnims = useRef(
    Array.from({ length: 5 }, () => new Animated.Value(0))
  ).current;

  // Connection line animations between chevrons
  const connectionAnims = useRef(
    Array.from({ length: 4 }, () => new Animated.Value(0))
  ).current;

  useEffect(() => {
    // Main animations with 3.5 second total duration
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }),
      Animated.timing(scaleAnim, {
        toValue: 1,
        duration: 1000,
        useNativeDriver: true,
      }),
      Animated.timing(slideUpAnim, {
        toValue: 0,
        duration: 1000,
        useNativeDriver: true,
      }),
    ]).start();

    // Animate chevrons sequentially - now synced to 3.5 seconds
    const chevronDelay = 3500 / 5; // 700ms between each chevron
    
    const chevronAnimations = chevronAnims.map((anim, index) =>
      Animated.sequence([
        Animated.delay(index * chevronDelay), // Stagger each chevron by 700ms
        Animated.parallel([
          Animated.timing(anim, {
            toValue: 1,
            duration: 500,
            useNativeDriver: true,
          }),
          // Scale effect when activating
          Animated.sequence([
            Animated.timing(anim, {
              toValue: 1.2,
              duration: 200,
              useNativeDriver: true,
            }),
            Animated.timing(anim, {
              toValue: 1,
              duration: 300,
              useNativeDriver: true,
            }),
          ]),
        ]),
      ])
    );

    // Animate connection lines after each chevron activates
    const connectionAnimations = connectionAnims.map((anim, index) =>
      Animated.sequence([
        Animated.delay((index + 1) * chevronDelay), // Start after corresponding chevron
        Animated.timing(anim, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }),
      ])
    );

    // Start all animations
    Animated.parallel([
      ...chevronAnimations,
      ...connectionAnimations,
    ]).start();

    // Complete loading after 3.5 seconds
    const timer = setTimeout(() => {
      onLoadingComplete();
    }, 3500);

    return () => {
      clearTimeout(timer);
    };
  }, [fadeAnim, scaleAnim, slideUpAnim, chevronAnims, connectionAnims, onLoadingComplete]);

  // Chevron Progress Bar Component
  const ChevronProgressBar = () => {
    const chevronCount = 5;
    const chevronSize = 24;
    const spacing = 40;
    const totalWidth = (chevronCount * chevronSize) + ((chevronCount - 1) * spacing);

    return (
      <View style={styles.chevronContainer}>
        <Svg width={totalWidth} height="60" viewBox={`0 0 ${totalWidth} 60`}>
          <G>
            {Array.from({ length: chevronCount }).map((_, index) => (
              <G key={index} x={index * (chevronSize + spacing)}>
                {/* Connection line (before each chevron except first) */}
                {index > 0 && (
                  <AnimatedPath
                    d={`M-${spacing/2},30 L0,30`}
                    stroke={COLORS.warm}
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeDasharray="40"
                    strokeDashoffset={connectionAnims[index - 1].interpolate({
                      inputRange: [0, 1],
                      outputRange: [40, 0]
                    })}
                    opacity={connectionAnims[index - 1]}
                  />
                )}
                
                {/* Chevron Outline (always visible) */}
                <Path
                  d="M2,30 L12,15 L22,30 L12,45 Z"
                  stroke={COLORS.border}
                  strokeWidth="2"
                  fill="none"
                  strokeLinejoin="round"
                />
                
                {/* Animated Chevron Fill */}
                <AnimatedPath
                  d="M2,30 L12,15 L22,30 L12,45 Z"
                  fill={COLORS.warm}
                  stroke={COLORS.warm}
                  strokeWidth="2"
                  strokeLinejoin="round"
                  opacity={chevronAnims[index]}
                  transform={chevronAnims[index].interpolate({
                    inputRange: [0, 0.5, 1],
                    outputRange: [
                      'scale(1)',
                      'scale(1.15)',
                      'scale(1)'
                    ]
                  })}
                />
              </G>
            ))}
          </G>
        </Svg>
      </View>
    );
  };

  const AnimatedPath = Animated.createAnimatedComponent(Path);

  return (
    <View style={[styles.container, { backgroundColor: COLORS.background }]}>
      <Animated.View
        style={[
          styles.content,
          {
            opacity: fadeAnim,
            transform: [
              { scale: scaleAnim },
              { translateY: slideUpAnim }
            ],
          },
        ]}
      >
        {/* App Name */}
        <Text style={[styles.appName, { color: COLORS.text }]}>
          Momentum
        </Text>
        
        {/* Tagline */}
        <Text style={[styles.tagline, { color: COLORS.softText }]}>
          Progress together
        </Text>

        {/* Main Chevron Progress Bar - Centered */}
        <View style={styles.mainProgressContainer}>
          <ChevronProgressBar />
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  mainProgressContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 40, // Added some spacing from the tagline
  },
  chevronContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  appName: {
    fontSize: 42,
    fontWeight: '800',
    marginBottom: 12,
    letterSpacing: -0.5,
    textAlign: 'center',
  },
  tagline: {
    fontSize: 16,
    fontWeight: '500',
    opacity: 0.8,
    letterSpacing: 0.5,
    textAlign: 'center',
  },
});