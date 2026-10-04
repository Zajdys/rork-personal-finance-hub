import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import React, { type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';
import type { StyleProp, ViewStyle } from 'react-native';

const AnimatedLinearGradient = Animated.createAnimatedComponent(LinearGradient);

type Props = {
  heightStyle: StyleProp<ViewStyle>;
  gradientOpacityStyle: StyleProp<ViewStyle>;
  hairlineOpacityStyle: StyleProp<ViewStyle>;
  expandedOpacityStyle: StyleProp<ViewStyle>;
  collapsedOpacityStyle: StyleProp<ViewStyle>;
  insetsTop: number;
  backgroundColor: string;
  borderColor: string;
  gradientColors: readonly [string, string];
  collapsedTitle: string;
  expandedContent: ReactNode;
};

/** Absolute collapsing chrome (blur + gradient fade + hairline) shared by dashboard / profile. */
export function CollapsingGradientHeader({
  heightStyle,
  gradientOpacityStyle,
  hairlineOpacityStyle,
  expandedOpacityStyle,
  collapsedOpacityStyle,
  insetsTop,
  backgroundColor,
  borderColor,
  gradientColors,
  collapsedTitle,
  expandedContent,
}: Props) {
  return (
    <Animated.View style={[styles.root, heightStyle]}>
      <View
        pointerEvents="none"
        style={[StyleSheet.absoluteFillObject, { backgroundColor, opacity: 0.75 }]}
      />
      <BlurView tint="dark" intensity={64} style={StyleSheet.absoluteFillObject} />
      <AnimatedLinearGradient
        colors={[...gradientColors]}
        style={[StyleSheet.absoluteFillObject, gradientOpacityStyle]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        pointerEvents="none"
      />
      <Animated.View
        pointerEvents="none"
        style={[styles.hairline, { backgroundColor: borderColor }, hairlineOpacityStyle]}
      />
      <View style={[styles.inner, { paddingTop: insetsTop }]}>
        <View style={styles.bar}>
          <Animated.View style={[styles.compactWrap, collapsedOpacityStyle]} pointerEvents="none">
            <Text style={styles.compactTitle}>{collapsedTitle}</Text>
          </Animated.View>
          <Animated.View style={expandedOpacityStyle}>{expandedContent}</Animated.View>
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
    overflow: 'hidden',
  },
  hairline: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: StyleSheet.hairlineWidth,
    zIndex: 2,
  },
  inner: {
    flex: 1,
    zIndex: 1,
  },
  bar: {
    flex: 1,
    paddingHorizontal: 20,
    justifyContent: 'center',
    paddingBottom: 8,
  },
  compactWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  compactTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: 'white',
  },
});
