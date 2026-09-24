/**
 * Univerzální sheet: ruční přidání transakce (akcie i krypto).
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  Switch,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import type { ThemeColors } from '@/constants/theme-colors';
import type { InvestmentBroker, InvestmentPortfolio } from '@/lib/investment-portfolios';
import {
  insertManualInvestmentTransaction,
  type ManualTransactionFormKind,
} from '@/lib/investment-transactions';
import { fetchHistoricalPrice } from '@/lib/historical-price';

const CRYPTO_ASSETS = ['BTC', 'ETH'] as const;
const FIAT = ['CZK', 'EUR', 'USD'] as const;

const KIND_OPTIONS: { id: ManualTransactionFormKind; cs: string; en: string }[] = [
  { id: 'buy', cs: 'Nákup', en: 'Buy' },
  { id: 'sell', cs: 'Prodej', en: 'Sell' },
  { id: 'dividend', cs: 'Dividenda', en: 'Dividend' },
  { id: 'deposit', cs: 'Vklad', en: 'Deposit' },
  { id: 'withdraw', cs: 'Výběr', en: 'Withdraw' },
  { id: 'gift', cs: 'Příjem (dar)', en: 'Gift' },
];

/** Lokální dnešek → ISO YYYY-MM-DD (bez UTC posunu). */
function todayIso(): string {
  return dateToIso(new Date());
}

function dateToIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function isoToLocalDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return new Date();
  return new Date(y, m - 1, d);
}

/** Zobrazení DD.MM.YYYY. */
function formatDateCs(iso: string): string {
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return iso;
  return `${d}.${m}.${y}`;
}

function parseNum(raw: string): number | null {
  const n = Number(String(raw).trim().replace(',', '.').replace(/\s/g, ''));
  return Number.isFinite(n) ? n : null;
}

function formatPriceForInput(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '';
  if (n >= 1000) return (Math.round(n * 100) / 100).toFixed(2);
  if (n >= 1) return String(Math.round(n * 1e4) / 1e4);
  return String(Math.round(n * 1e8) / 1e8);
}

function isCryptoPortfolio(broker: InvestmentBroker): boolean {
  return broker === 'anycoin';
}

function ChipRow({
  options,
  value,
  onChange,
  colors,
}: {
  options: { id: string; label: string }[];
  value: string;
  onChange: (id: string) => void;
  colors: ThemeColors;
}) {
  return (
    <View style={styles.chipRow}>
      {options.map((o) => {
        const active = value === o.id;
        return (
          <TouchableOpacity
            key={o.id}
            style={[
              styles.chip,
              { backgroundColor: colors.muted, borderColor: colors.border },
              active && { backgroundColor: colors.primary, borderColor: colors.primary },
            ]}
            onPress={() => onChange(o.id)}
          >
            <Text
              style={[
                styles.chipText,
                { color: colors.textSecondary },
                active && { color: colors.onPrimary, fontWeight: '700' },
              ]}
            >
              {o.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export function AddInvestmentTransactionSheet({
  visible,
  onClose,
  onSaved,
  portfolio,
  colors,
  locale,
  labels,
}: {
  visible: boolean;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
  portfolio: InvestmentPortfolio | null;
  colors: ThemeColors;
  locale: string;
  labels: {
    title: string;
    type: string;
    asset: string;
    ticker: string;
    isin: string;
    units: string;
    pricePerUnit: string;
    amount: string;
    currency: string;
    date: string;
    note: string;
    notePlaceholder: string;
    save: string;
    cancel: string;
    pickPortfolio: string;
  };
}) {
  const crypto = portfolio ? isCryptoPortfolio(portfolio.broker) : false;

  const [kind, setKind] = useState<ManualTransactionFormKind>('buy');
  const [ticker, setTicker] = useState(crypto ? 'BTC' : '');
  const [isin, setIsin] = useState('');
  const [units, setUnits] = useState('');
  const [pricePerUnit, setPricePerUnit] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('CZK');
  const [date, setDate] = useState(todayIso());
  const [datePickerVisible, setDatePickerVisible] = useState(false);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  /** Default zapnuto: nákup + vklad ve stejný den. */
  const [pairedDepositWithBuy, setPairedDepositWithBuy] = useState(true);
  const [priceManuallyEdited, setPriceManuallyEdited] = useState(false);
  const [histPriceLoading, setHistPriceLoading] = useState(false);
  const [histPriceHint, setHistPriceHint] = useState<string | null>(null);
  const priceManualRef = useRef(false);
  priceManualRef.current = priceManuallyEdited;

  useEffect(() => {
    if (!visible || !portfolio) return;
    setKind('buy');
    setTicker(isCryptoPortfolio(portfolio.broker) ? 'BTC' : '');
    setIsin('');
    setUnits('');
    setPricePerUnit('');
    setAmount('');
    setCurrency(
      portfolio.broker === 'anycoin'
        ? 'CZK'
        : portfolio.broker === 'etoro'
          ? 'USD'
          : portfolio.currency?.toUpperCase() || 'EUR',
    );
    setDate(todayIso());
    setDatePickerVisible(false);
    setNote('');
    setPriceManuallyEdited(false);
    setHistPriceLoading(false);
    setHistPriceHint(null);
    setPairedDepositWithBuy(true);
  }, [visible, portfolio?.id]);

  const showUnits = kind === 'buy' || kind === 'sell' || kind === 'gift' || kind === 'withdraw';
  const showPrice = kind === 'buy' || kind === 'sell';
  const showAmount =
    kind === 'deposit' || kind === 'dividend' || (kind === 'withdraw' && !crypto);
  const showAsset =
    kind === 'buy' ||
    kind === 'sell' ||
    kind === 'gift' ||
    kind === 'dividend' ||
    (kind === 'withdraw' && crypto);
  const showIsin = showAsset && !crypto && kind !== 'dividend';
  const showCurrency = showPrice || showAmount;

  const isCs = locale.toLowerCase().startsWith('cs');
  const kindOptions = useMemo(
    () => KIND_OPTIONS.map((o) => ({ id: o.id, label: isCs ? o.cs : o.en })),
    [isCs],
  );

  useEffect(() => {
    if (!visible || !showPrice) {
      setHistPriceLoading(false);
      return;
    }
    const t = ticker.trim();
    if (!t || !date) {
      setHistPriceHint(null);
      setHistPriceLoading(false);
      return;
    }
    if (priceManuallyEdited) return;

    let cancelled = false;
    const timer = setTimeout(() => {
      void (async () => {
        setHistPriceLoading(true);
        setHistPriceHint(null);
        try {
          const res = await fetchHistoricalPrice(t, date, {
            isin: showIsin ? isin || null : null,
            targetCurrency: currency,
          });
          if (cancelled || priceManualRef.current) return;
          if (!res) {
            setHistPriceHint(
              isCs
                ? 'Cenu se nepodařilo načíst, zadej ručně'
                : 'Could not load price — enter manually',
            );
            return;
          }
          const useTarget = res.priceInTarget != null && res.priceInTarget > 0;
          const fill = useTarget ? res.priceInTarget! : res.price;
          if (!(fill > 0)) {
            setHistPriceHint(
              isCs
                ? 'Cenu se nepodařilo načíst, zadej ručně'
                : 'Could not load price — enter manually',
            );
            return;
          }
          setPricePerUnit(formatPriceForInput(fill));
          const asOfLabel = formatDateCs(res.asOfDate);
          setHistPriceHint(
            isCs
              ? `Cena k ${asOfLabel} podle Yahoo — můžeš přepsat`
              : `Price as of ${asOfLabel} from Yahoo — you can override`,
          );
        } catch {
          if (!cancelled) {
            setHistPriceHint(
              isCs
                ? 'Cenu se nepodařilo načíst, zadej ručně'
                : 'Could not load price — enter manually',
            );
          }
        } finally {
          if (!cancelled) setHistPriceLoading(false);
        }
      })();
    }, 450);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [
    visible,
    showPrice,
    showIsin,
    ticker,
    isin,
    date,
    currency,
    priceManuallyEdited,
    isCs,
  ]);

  const onDateChange = (_event: unknown, selected?: Date) => {
    if (Platform.OS === 'android') setDatePickerVisible(false);
    if (!selected) return;
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    const clamped = selected.getTime() > today.getTime() ? new Date() : selected;
    setDate(dateToIso(clamped));
    // Nové datum → znovu dovolit Yahoo autofill (ruční cena platila jen pro staré datum).
    setPriceManuallyEdited(false);
  };

  const handleSave = async () => {
    if (!portfolio) {
      Alert.alert(labels.title, labels.pickPortfolio);
      return;
    }
    setSaving(true);
    try {
      const { error } = await insertManualInvestmentTransaction({
        portfolioId: portfolio.id,
        broker: portfolio.broker,
        kind,
        ticker: showAsset ? ticker : null,
        isin: showIsin ? isin || null : null,
        units: showUnits ? parseNum(units) : null,
        pricePerUnit: showPrice ? parseNum(pricePerUnit) : null,
        amount: showAmount ? parseNum(amount) : null,
        currency,
        date,
        note: note || null,
        pairedDepositWithBuy: kind === 'buy' ? pairedDepositWithBuy : false,
      });
      if (error) {
        Alert.alert(labels.title, error.message);
        return;
      }
      await onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const inputStyle = [
    styles.input,
    { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface },
  ];

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.overlay}
      >
        <View style={[styles.sheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.title, { color: colors.text }]}>{labels.title}</Text>
          {portfolio ? (
            <Text style={[styles.sub, { color: colors.textSecondary }]}>
              {portfolio.name} · {portfolio.broker}
            </Text>
          ) : null}

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={[styles.label, { color: colors.textSecondary }]}>{labels.type}</Text>
            <ChipRow
              options={kindOptions}
              value={kind}
              onChange={(id) => setKind(id as ManualTransactionFormKind)}
              colors={colors}
            />

            {showAsset ? (
              <>
                <Text style={[styles.label, { color: colors.textSecondary }]}>
                  {crypto ? labels.asset : labels.ticker}
                </Text>
                {crypto ? (
                  <ChipRow
                    options={CRYPTO_ASSETS.map((c) => ({ id: c, label: c }))}
                    value={ticker}
                    onChange={(id) => {
                      setTicker(id);
                      setPriceManuallyEdited(false);
                    }}
                    colors={colors}
                  />
                ) : (
                  <TextInput
                    style={inputStyle}
                    value={ticker}
                    onChangeText={(v) => {
                      setTicker(v.toUpperCase());
                      setPriceManuallyEdited(false);
                    }}
                    autoCapitalize="characters"
                    placeholder="AAPL"
                    placeholderTextColor={colors.textSecondary}
                  />
                )}
              </>
            ) : null}

            {showIsin ? (
              <>
                <Text style={[styles.label, { color: colors.textSecondary }]}>{labels.isin}</Text>
                <TextInput
                  style={inputStyle}
                  value={isin}
                  onChangeText={(v) => setIsin(v.toUpperCase())}
                  autoCapitalize="characters"
                  placeholder="US0378331005"
                  placeholderTextColor={colors.textSecondary}
                />
              </>
            ) : null}

            {showUnits ? (
              <>
                <Text style={[styles.label, { color: colors.textSecondary }]}>{labels.units}</Text>
                <TextInput
                  style={inputStyle}
                  value={units}
                  onChangeText={setUnits}
                  keyboardType="decimal-pad"
                  placeholder="0"
                  placeholderTextColor={colors.textSecondary}
                />
              </>
            ) : null}

            {showPrice ? (
              <>
                <Text style={[styles.label, { color: colors.textSecondary }]}>
                  {labels.pricePerUnit}
                </Text>
                <View style={styles.priceRow}>
                  <TextInput
                    style={[inputStyle, styles.priceInput]}
                    value={pricePerUnit}
                    onChangeText={(v) => {
                      setPriceManuallyEdited(true);
                      setPricePerUnit(v);
                      setHistPriceHint(null);
                    }}
                    keyboardType="decimal-pad"
                    placeholder="0"
                    placeholderTextColor={colors.textSecondary}
                  />
                  {histPriceLoading ? (
                    <ActivityIndicator
                      color={colors.primary}
                      style={styles.priceSpinner}
                    />
                  ) : null}
                </View>
                {histPriceHint ? (
                  <Text style={[styles.histHint, { color: colors.textSecondary }]}>
                    {histPriceHint}
                  </Text>
                ) : null}
              </>
            ) : null}

            {showAmount ? (
              <>
                <Text style={[styles.label, { color: colors.textSecondary }]}>{labels.amount}</Text>
                <TextInput
                  style={inputStyle}
                  value={amount}
                  onChangeText={setAmount}
                  keyboardType="decimal-pad"
                  placeholder="0"
                  placeholderTextColor={colors.textSecondary}
                />
              </>
            ) : null}

            {showCurrency ? (
              <>
                <Text style={[styles.label, { color: colors.textSecondary }]}>
                  {labels.currency}
                </Text>
                <ChipRow
                  options={FIAT.map((c) => ({ id: c, label: c }))}
                  value={currency}
                  onChange={(id) => {
                    setCurrency(id);
                    setPriceManuallyEdited(false);
                  }}
                  colors={colors}
                />
              </>
            ) : null}

            {kind === 'buy' ? (
              <TouchableOpacity
                style={styles.pairedRow}
                onPress={() => setPairedDepositWithBuy((v) => !v)}
                activeOpacity={0.85}
              >
                <Switch
                  value={pairedDepositWithBuy}
                  onValueChange={setPairedDepositWithBuy}
                  trackColor={{ false: colors.border, true: colors.primary }}
                  thumbColor="#FFFFFF"
                />
                <Text style={[styles.pairedLabel, { color: colors.text }]}>
                  {isCs
                    ? 'Peníze jsem na účet poslal zároveň s nákupem'
                    : 'I deposited cash together with this buy'}
                </Text>
              </TouchableOpacity>
            ) : null}

            <Text style={[styles.label, { color: colors.textSecondary }]}>{labels.date}</Text>
            <TouchableOpacity
              style={[
                styles.dateBtn,
                {
                  borderColor: colors.border,
                  backgroundColor: colors.surface,
                },
              ]}
              onPress={() => setDatePickerVisible((v) => !v)}
              activeOpacity={0.85}
            >
              <Text style={[styles.dateBtnText, { color: colors.text }]}>
                {formatDateCs(date)}
              </Text>
            </TouchableOpacity>

            {datePickerVisible && Platform.OS === 'ios' ? (
              <View style={styles.iosInlinePicker}>
                <DateTimePicker
                  value={isoToLocalDate(date)}
                  mode="date"
                  display="spinner"
                  maximumDate={new Date()}
                  onChange={onDateChange}
                  style={{ height: 180 }}
                />
                <TouchableOpacity
                  style={styles.iosInlineDone}
                  onPress={() => setDatePickerVisible(false)}
                >
                  <Text style={[styles.iosPickerDone, { color: colors.primary }]}>
                    {isCs ? 'Hotovo' : 'Done'}
                  </Text>
                </TouchableOpacity>
              </View>
            ) : null}

            {datePickerVisible && Platform.OS !== 'ios' ? (
              <DateTimePicker
                value={isoToLocalDate(date)}
                mode="date"
                display="default"
                maximumDate={new Date()}
                onChange={onDateChange}
              />
            ) : null}

            <Text style={[styles.label, { color: colors.textSecondary }]}>{labels.note}</Text>
            <TextInput
              style={[inputStyle, styles.noteInput]}
              value={note}
              onChangeText={setNote}
              placeholder={labels.notePlaceholder}
              placeholderTextColor={colors.textSecondary}
              multiline
            />
          </ScrollView>

          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.btn, { borderColor: colors.border }]}
              onPress={onClose}
              disabled={saving}
            >
              <Text style={{ color: colors.text }}>{labels.cancel}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.btnPrimary,
                { backgroundColor: colors.primary, opacity: saving ? 0.7 : 1 },
              ]}
              onPress={() => void handleSave()}
              disabled={saving || !portfolio}
            >
              {saving ? (
                <ActivityIndicator color={colors.onPrimary} />
              ) : (
                <Text style={{ color: colors.onPrimary, fontWeight: '700' }}>{labels.save}</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheet: {
    maxHeight: '92%',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    paddingTop: 16,
    paddingBottom: Platform.OS === 'ios' ? 28 : 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    paddingHorizontal: 16,
  },
  sub: {
    fontSize: 13,
    marginTop: 4,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  scroll: { flexGrow: 0 },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 10,
    marginBottom: 6,
  },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  priceInput: {
    flex: 1,
  },
  priceSpinner: {
    marginRight: 4,
  },
  histHint: {
    fontSize: 12,
    marginTop: 6,
    lineHeight: 16,
  },
  pairedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 10,
    marginBottom: 4,
    paddingVertical: 4,
  },
  pairedLabel: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
  },
  dateBtn: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  dateBtnText: {
    fontSize: 15,
    fontWeight: '600',
  },
  iosInlinePicker: {
    marginTop: 4,
    marginBottom: 4,
  },
  iosInlineDone: {
    alignItems: 'flex-end',
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  iosPickerDone: {
    fontSize: 16,
    fontWeight: '700',
  },
  noteInput: {
    minHeight: 64,
    textAlignVertical: 'top',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  btn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  btnPrimary: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 10,
    minHeight: 44,
  },
});
