import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useLanguageStore } from '@/store/language-store';

type Props = {
  onRetry: () => void;
  /** Volitelná krátká nápověda pod titulkem (bez raw error.message). */
  hint?: string;
};

/**
 * Společné přátelské UI pro root / route ErrorBoundary.
 * Raw chybu sem neposílej — jen loguj mimo.
 */
export function FriendlyErrorFallback({ onRetry, hint }: Props) {
  const { t } = useLanguageStore();
  return (
    <View style={styles.container} testID="friendly-error-fallback">
      <Text style={styles.title}>{t('errorBoundaryTitle')}</Text>
      <Text style={styles.message}>{hint ?? t('errorBoundaryHint')}</Text>
      <TouchableOpacity
        style={styles.button}
        onPress={onRetry}
        accessibilityRole="button"
        testID="friendly-error-retry"
      >
        <Text style={styles.buttonText}>{t('errorBoundaryTryAgain')}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#F9FAFB',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 10,
    textAlign: 'center',
  },
  message: {
    fontSize: 15,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 22,
  },
  button: {
    backgroundColor: '#0D9488',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
