import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Eye, EyeOff, FileText } from 'lucide-react-native';
import type { Visibility } from '@/types/household';

interface VisibilityBadgeProps {
  visibility: Visibility;
  size?: 'small' | 'medium' | 'large';
}

export function VisibilityBadge({ visibility, size = 'medium' }: VisibilityBadgeProps) {
  const iconSize = size === 'small' ? 12 : size === 'large' ? 20 : 16;
  const fontSize = size === 'small' ? 10 : size === 'large' ? 14 : 12;

  const config = getVisibilityConfig(visibility);

  return (
    <View style={[styles.badge, { backgroundColor: config.bgColor }]}>
      {config.icon === 'eye' && (
        <Eye size={iconSize} color={config.color} strokeWidth={2} />
      )}
      {config.icon === 'eye-off' && (
        <EyeOff size={iconSize} color={config.color} strokeWidth={2} />
      )}
      {config.icon === 'file-text' && (
        <FileText size={iconSize} color={config.color} strokeWidth={2} />
      )}
      <Text style={[styles.text, { color: config.color, fontSize }]}>
        {config.label}
      </Text>
    </View>
  );
}

function getVisibilityConfig(visibility: Visibility): {
  label: string;
  color: string;
  bgColor: string;
  icon: 'eye' | 'eye-off' | 'file-text';
} {
  switch (visibility) {
    case 'SHARED':
      return {
        label: 'Sdílené',
        color: '#10B981',
        bgColor: '#D1FAE5',
        icon: 'eye',
      };
    case 'PRIVATE':
      return {
        label: 'Soukromé',
        color: '#EF4444',
        bgColor: '#FEE2E2',
        icon: 'eye-off',
      };
    case 'SUMMARY_ONLY':
      return {
        label: 'Jen součet',
        color: '#F59E0B',
        bgColor: '#FEF3C7',
        icon: 'file-text',
      };
  }
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  text: {
    fontWeight: '600' as const,
  },
});
