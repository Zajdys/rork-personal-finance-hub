/**
 * Logo / monogram české banky (bez PNG assetů — barevný badge + zkratka).
 */
import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { extractCzBankCode } from '@/lib/cz-bank-codes';

type Brand = { bg: string; color: string; short: string };

const BY_NAME: Record<string, Brand> = {
  'komercni banka': { bg: '#004B87', color: '#FFFFFF', short: 'KB' },
  'csob': { bg: '#0099D8', color: '#FFFFFF', short: 'ČSOB' },
  'moneta money bank': { bg: '#00A651', color: '#FFFFFF', short: 'M' },
  'moneta': { bg: '#00A651', color: '#FFFFFF', short: 'M' },
  'ceska sporitelna': { bg: '#E30613', color: '#FFFFFF', short: 'ČS' },
  'fio banka': { bg: '#004E98', color: '#FFFFFF', short: 'Fio' },
  'fio': { bg: '#004E98', color: '#FFFFFF', short: 'Fio' },
  'air bank': { bg: '#78BE20', color: '#FFFFFF', short: 'AB' },
  'raiffeisenbank': { bg: '#FFE600', color: '#000000', short: 'R' },
  'mbank': { bg: '#DA2128', color: '#FFFFFF', short: 'm' },
  'unicredit bank': { bg: '#E2001A', color: '#FFFFFF', short: 'U' },
  'unicredit': { bg: '#E2001A', color: '#FFFFFF', short: 'U' },
  'banka creditas': { bg: '#003B5C', color: '#FFFFFF', short: 'C' },
  'creditas': { bg: '#003B5C', color: '#FFFFFF', short: 'C' },
  'revolut': { bg: '#0666EB', color: '#FFFFFF', short: 'Re' },
  'jt banka': { bg: '#1A1A1A', color: '#FFFFFF', short: 'JT' },
  'j&t banka': { bg: '#1A1A1A', color: '#FFFFFF', short: 'JT' },
  'ppf banka': { bg: '#003366', color: '#FFFFFF', short: 'PPF' },
  'max banka': { bg: '#1B4F72', color: '#FFFFFF', short: 'Max' },
  'ceska narodni banka': { bg: '#C8102E', color: '#FFFFFF', short: 'ČNB' },
};

const BY_CODE: Record<string, Brand> = {
  '0100': BY_NAME['komercni banka']!,
  '0300': BY_NAME['csob']!,
  '0600': BY_NAME['moneta']!,
  '0710': BY_NAME['ceska narodni banka']!,
  '0800': BY_NAME['ceska sporitelna']!,
  '2010': BY_NAME['fio']!,
  '2250': BY_NAME['creditas']!,
  '2700': BY_NAME['unicredit']!,
  '3030': BY_NAME['air bank']!,
  '4000': BY_NAME['max banka']!,
  '5500': BY_NAME['raiffeisenbank']!,
  '5800': BY_NAME['jt banka']!,
  '6000': BY_NAME['ppf banka']!,
  '6100': BY_NAME['raiffeisenbank']!,
  '6210': BY_NAME['mbank']!,
};

function nameKey(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function resolveBrand(bankName: string, accountNumber?: string | null): Brand {
  const code = extractCzBankCode(accountNumber ?? '');
  if (code && BY_CODE[code]) return BY_CODE[code]!;

  const key = nameKey(bankName);
  if (BY_NAME[key]) return BY_NAME[key]!;
  for (const [k, brand] of Object.entries(BY_NAME)) {
    if (key.includes(k) || k.includes(key)) return brand;
  }

  const letter = (bankName.trim().charAt(0) || '?').toUpperCase();
  return { bg: '#6B7280', color: '#FFFFFF', short: letter };
}

type Props = {
  bankName: string;
  /** Volitelně pro přesnější logo přes kód banky v čísle. */
  accountNumber?: string | null;
  size?: number;
};

export function BankLogo({ bankName, accountNumber, size = 36 }: Props) {
  const brand = useMemo(
    () => resolveBrand(bankName, accountNumber),
    [bankName, accountNumber],
  );
  const fontSize =
    brand.short.length >= 3 ? size * 0.28 : brand.short.length === 2 ? size * 0.34 : size * 0.42;

  return (
    <View
      style={[
        styles.box,
        {
          width: size,
          height: size,
          borderRadius: size * 0.22,
          backgroundColor: brand.bg,
        },
      ]}
      accessibilityLabel={bankName}
    >
      <Text
        style={{
          color: brand.color,
          fontSize,
          fontWeight: '800',
          textAlign: 'center',
        }}
        numberOfLines={1}
      >
        {brand.short}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default BankLogo;
