import React from 'react';
import { View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

// Theme colors (using the blush accent for the default logo color)
const COLORS = {
  accentBlush: "#D8A39D",
};

/**
 * The new logo concept: A stylized 'M' mark, suggesting Momentum or Milestone.
 * @param {object} props
 * @param {number} props.size The height and width of the logo (default: 80).
 * @param {string} [props.color] Override the default accent color for the logo.
 */
export default function AppLogo({ size = 80, color = COLORS.accentBlush }) {
  // The SVG is based on a 100x100 viewBox, scaled by the 'size' prop.
  return (
    <View style={{ width: size, height: size }}>
      <Svg height={size} width={size} viewBox="0 0 100 100">
        {/* The 'M' symbol path */}
        <Path 
            d="M 15 75 L 35 45 L 50 65 L 65 35 L 85 75" 
            fill="none" 
            stroke={color} 
            strokeWidth="12" 
            strokeLinecap="round" 
            strokeLinejoin="round"
        />
        {/* Accent dot for the peak */}
        <Circle 
            cx="65" 
            cy="35" 
            r="5" 
            fill={color} 
        />
      </Svg>
    </View>
  );
}