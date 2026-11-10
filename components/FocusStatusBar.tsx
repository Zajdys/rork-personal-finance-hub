import React from 'react';
import { StatusBar, type StatusBarStyle } from 'expo-status-bar';
import { useIsFocused } from '@react-navigation/native';

/**
 * StatusBar jen pro právě aktivní obrazovku.
 * Záložky zůstávají připojené i na pozadí — obyčejný <StatusBar> by „přetekl“ do jiné záložky
 * (např. bílé ikony stavového řádku na světlé Domácnosti na Androidu).
 */
export function FocusStatusBar({ style }: { style: StatusBarStyle }) {
  const focused = useIsFocused();
  return focused ? <StatusBar style={style} /> : null;
}
