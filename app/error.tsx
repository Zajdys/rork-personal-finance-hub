/**
 * Expo Router: pojmenovaný export ErrorBoundary obalí route při render crashi.
 * Root layout (`app/_layout.tsx`) re-exportuje stejný boundary + má class wrap celé appky.
 * Raw error jde jen do console — uživatel vidí přátelskou CS hlášku.
 */
import React from 'react';
import { router, type ErrorBoundaryProps } from 'expo-router';
import { FriendlyErrorFallback } from '@/components/FriendlyErrorFallback';

export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  console.log('[ExpoRouter ErrorBoundary] raw error:', error);
  return <FriendlyErrorFallback onRetry={() => { void retry(); }} />;
}

/** Volitelná obrazovka /error — stejné UI, tlačítko jde na kořen. */
export default function ErrorScreen() {
  return (
    <FriendlyErrorFallback
      onRetry={() => {
        router.replace('/');
      }}
    />
  );
}
