import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  TrendingUp,
  TrendingDown,
  ShoppingCart,
  Home,
  Car,
  Coffee,
  Gamepad2,
  Heart,
  Book,
  Smartphone,
} from 'lucide-react-native';
import { useFinanceStore, EXPENSE_CATEGORIES, INCOME_CATEGORIES } from '@/store/finance-store';
import { useBuddyStore } from '@/store/buddy-store';
import { useLanguageStore } from '@/store/language-store';
import * as DocumentPicker from 'expo-document-picker';
import { parseBankCsvToTransactions, readUriText, ParsedTxn } from '../../src/services/bank/importBankCsv';

const EXPENSE_CATEGORY_ICONS = {
  'Jídlo a nápoje': Coffee,
  'Nájem a bydlení': Home,
  'Oblečení': ShoppingCart,
  'Doprava': Car,
  'Zábava': Gamepad2,
  'Zdraví': Heart,
  'Vzdělání': Book,
  'Nákupy': ShoppingCart,
  'Služby': Smartphone,
  'Ostatní': ShoppingCart,
};

const INCOME_CATEGORY_ICONS = {
  'Mzda': TrendingUp,
  'Freelance': TrendingUp,
  'Investice': TrendingUp,
  'Dary': TrendingUp,
  'Ostatní': TrendingUp,
};

export default function AddTransactionScreen() {
  const [type, setType] = useState<'income' | 'expense'>('expense');
  const [amount, setAmount] = useState<string>('');
  const [title, setTitle] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [importing, setImporting] = useState<boolean>(false);
  const [preview, setPreview] = useState<ParsedTxn[]>([]);
  const [previewOpen, setPreviewOpen] = useState<boolean>(false);
  const [importError, setImportError] = useState<string | null>(null);
  
  const { addTransaction } = useFinanceStore();
  const { addPoints, showBuddyMessage } = useBuddyStore();
  const { t } = useLanguageStore();

  const categoryData = type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  const categoryIcons = type === 'income' ? INCOME_CATEGORY_ICONS : EXPENSE_CATEGORY_ICONS;
  
  const categories = Object.entries(categoryData).map(([name, data]) => ({
    id: name,
    name,
    icon: categoryIcons[name as keyof typeof categoryIcons] || ShoppingCart,
    color: data.color,
  }));

  const handleSubmit = () => {
    if (!amount || !title || !selectedCategory) {
      Alert.alert(t('errorMessage'), t('fillAllFields'));
      return;
    }

    const numAmount = parseFloat(amount.replace(',', '.'));
    if (isNaN(numAmount) || numAmount <= 0) {
      Alert.alert(t('errorMessage'), t('enterValidAmount'));
      return;
    }

    addTransaction({
      id: Date.now().toString(),
      type,
      amount: numAmount,
      title,
      category: selectedCategory,
      date: new Date(),
    });

    addPoints(5);
    
    showBuddyMessage(
      type === 'income' 
        ? `${t('addedIncome')} ${numAmount.toLocaleString('cs-CZ')} Kč. ${t('dontForgetInvest')}`
        : `${t('recordedExpense')} ${numAmount.toLocaleString('cs-CZ')} Kč za ${selectedCategory}. ${t('watchBudget')}`
    );

    // Reset form
    setAmount('');
    setTitle('');
    setSelectedCategory('');
    
    Alert.alert(t('successMessage'), t('transactionAdded'));
  };

  const onImportBank = useCallback(async () => {
    try {
      setImportError(null);
      setImporting(true);
      const res = await DocumentPicker.getDocumentAsync({
        type: ['text/*', 'application/pdf', 'application/vnd.ms-excel', 'text/csv', 'text/comma-separated-values'],
        multiple: false,
        copyToCacheDirectory: true,
      });
      if (res.canceled) {
        setImporting(false);
        return;
      }
      const asset = res.assets?.[0];
      if (!asset?.uri) {
        setImportError('Soubor se nepodařilo načíst.');
        setImporting(false);
        return;
      }

      const mime = (asset as any).mimeType as string | undefined;
      const name = asset.name ?? '';
      const isPdf = (mime?.includes('pdf')) || /\.pdf$/i.test(name);

      if (isPdf) {
        console.log('Selected PDF bank statement:', { name, mime });
        setImportError('PDF výpisy zatím nejsou podporované. V internetovém bankovnictví prosím vyexportujte výpis jako CSV a zkuste to znovu.');
        setImporting(false);
        return;
      }

      const text = await readUriText(asset.uri);
      const parsed = parseBankCsvToTransactions(text);
      console.log('Bank statement parsed count:', parsed.length);
      if (!parsed.length) {
        setImportError('V souboru jsme nenašli žádné čitelné transakce. Zkuste jiný formát CSV.');
      } else {
        setPreview(parsed);
        setPreviewOpen(true);
      }
    } catch (e) {
      console.error('onImportBank error', e);
      setImportError('Nastala chyba při zpracování výpisu.');
    } finally {
      setImporting(false);
    }
  }, []);

  const confirmImport = useCallback(() => {
    try {
      let count = 0;
      for (const p of preview) {
        const tx = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          type: p.type,
          amount: p.amount,
          title: p.title,
          category: p.category,
          date: p.date,
        } as const;
        addTransaction(tx);
        count++;
      }
      setPreview([]);
      setPreviewOpen(false);
      Alert.alert('Hotovo', `Načteno ${count} transakcí z výpisu.`);
      addPoints(10);
      showBuddyMessage('Výpis z banky byl úspěšně zpracován. Skvělý krok k přehledu!');
    } catch (e) {
      console.error('confirmImport error', e);
      Alert.alert('Chyba', 'Import se nepodařilo dokončit.');
    }
  }, [preview, addTransaction, addPoints, showBuddyMessage]);

  const TypeSelector = () => (
    <View style={styles.typeSelector}>
      <TouchableOpacity
        style={[styles.typeButton, type === 'income' && styles.typeButtonActive]}
        onPress={() => {
          setType('income');
          setSelectedCategory('');
        }}
      >
        <LinearGradient
          colors={type === 'income' ? ['#10B981', '#059669'] : ['transparent', 'transparent']}
          style={styles.typeButtonGradient}
        >
          <TrendingUp color={type === 'income' ? 'white' : '#6B7280'} size={20} />
          <Text style={[styles.typeButtonText, type === 'income' && styles.typeButtonTextActive]}>
            {t('income')}
          </Text>
        </LinearGradient>
      </TouchableOpacity>
      
      <TouchableOpacity
        style={[styles.typeButton, type === 'expense' && styles.typeButtonActive]}
        onPress={() => {
          setType('expense');
          setSelectedCategory('');
        }}
      >
        <LinearGradient
          colors={type === 'expense' ? ['#EF4444', '#DC2626'] : ['transparent', 'transparent']}
          style={styles.typeButtonGradient}
        >
          <TrendingDown color={type === 'expense' ? 'white' : '#6B7280'} size={20} />
          <Text style={[styles.typeButtonText, type === 'expense' && styles.typeButtonTextActive]}>
            {t('expense')}
          </Text>
        </LinearGradient>
      </TouchableOpacity>
    </View>
  );

  const CategoryGrid = () => (
    <View style={styles.categoryGrid}>
      {categories.map((category) => {
        const Icon = category.icon;
        const isSelected = selectedCategory === category.id;
        
        return (
          <TouchableOpacity
            key={category.id}
            style={[styles.categoryCard, isSelected && styles.categoryCardSelected]}
            onPress={() => setSelectedCategory(category.id)}
          >
            <View style={[styles.categoryIcon, { backgroundColor: category.color + '20' }]}>
              <Icon color={isSelected ? 'white' : category.color} size={24} />
            </View>
            <Text style={[styles.categoryText, isSelected && styles.categoryTextSelected]}>
              {category.name}
            </Text>
            {isSelected && (
              <LinearGradient
                colors={[category.color, category.color + 'CC']}
                style={styles.categorySelectedOverlay}
              />
            )}
          </TouchableOpacity>
        );
      })}
    </View>
  );

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <LinearGradient
        colors={['#667eea', '#764ba2']}
        style={styles.header}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <Text style={styles.headerTitle}>{t('addTransaction')}</Text>
        <Text style={styles.headerSubtitle}>{t('recordTransactions')}</Text>
      </LinearGradient>

      <View style={styles.content}>
        <TypeSelector />

        <View style={styles.importRow}>
          <TouchableOpacity
            testID="import-bank-statement"
            accessibilityLabel="import-bank-statement"
            style={styles.importButton}
            onPress={onImportBank}
            disabled={importing}
          >
            <LinearGradient colors={["#0ea5e9", "#2563eb"]} style={styles.importGradient}>
              {importing ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.importText}>Import z bankovního výpisu (CSV/PDF)</Text>
              )}
            </LinearGradient>
          </TouchableOpacity>
          {importError ? (
            <Text style={styles.importError} testID="import-error">{importError}</Text>
          ) : null}
        </View>

        <View style={styles.inputSection}>
          <Text style={styles.sectionTitle}>{t('amount')}</Text>
          <View style={styles.amountInputContainer}>
            <TextInput
              style={styles.amountInput}
              value={amount}
              onChangeText={setAmount}
              placeholder="0"
              keyboardType="numeric"
              placeholderTextColor="#9CA3AF"
            />
            <Text style={styles.currency}>Kč</Text>
          </View>
        </View>

        <View style={styles.inputSection}>
          <Text style={styles.sectionTitle}>{t('description')}</Text>
          <TextInput
            style={styles.textInput}
            value={title}
            onChangeText={setTitle}
            placeholder={type === 'income' ? t('exampleSalary') : t('exampleShopping')}
            placeholderTextColor="#9CA3AF"
          />
        </View>

        <View style={styles.inputSection}>
          <Text style={styles.sectionTitle}>{t('category')}</Text>
          <CategoryGrid />
        </View>

        <TouchableOpacity style={styles.submitButton} onPress={handleSubmit}>
          <LinearGradient
            colors={type === 'income' ? ['#10B981', '#059669'] : ['#EF4444', '#DC2626']}
            style={styles.submitGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <Text style={styles.submitText}>
              {type === 'income' ? t('addIncome') : t('addExpense')}
            </Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>

      <Modal visible={previewOpen} transparent animationType="slide" onRequestClose={() => setPreviewOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Náhled importu</Text>
            <Text style={styles.modalSubtitle}>Počet načtených transakcí: {preview.length}</Text>
            <ScrollView style={styles.previewList} contentContainerStyle={{ paddingBottom: 12 }}>
              {preview.slice(0, 50).map((p, idx) => (
                <View key={idx} style={styles.previewItem} testID={`preview-item-${idx}`}>
                  <View style={styles.previewHeaderRow}>
                    <Text style={styles.previewBadge}>{p.type === 'income' ? 'Příjem' : 'Výdaj'}</Text>
                    <Text style={styles.previewAmount}>{p.amount.toLocaleString('cs-CZ')} Kč</Text>
                  </View>
                  <Text style={styles.previewTitle}>{p.title}</Text>
                  <Text style={styles.previewMeta}>{p.category} • {p.date.toLocaleDateString('cs-CZ')}</Text>
                </View>
              ))}
              {preview.length > 50 ? (
                <Text style={styles.previewMore}>… a další {preview.length - 50} položek</Text>
              ) : null}
            </ScrollView>
            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.modalButton, styles.modalCancel]} onPress={() => setPreviewOpen(false)} testID="cancel-import">
                <Text style={styles.modalButtonText}>Zrušit</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalButton, styles.modalConfirm]} onPress={confirmImport} testID="confirm-import">
                <Text style={[styles.modalButtonText, { color: '#fff' }]}>Importovat</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  header: {
    paddingTop: 60,
    paddingBottom: 32,
    paddingHorizontal: 20,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 16,
    color: 'white',
    opacity: 0.9,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  importRow: {
    marginTop: 16,
    marginBottom: 8,
  },
  importButton: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  importGradient: {
    paddingVertical: 14,
    alignItems: 'center',
  },
  importText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  importError: {
    marginTop: 8,
    color: '#DC2626',
  },
  typeSelector: {
    flexDirection: 'row',
    marginTop: -16,
    marginBottom: 32,
    gap: 12,
  },
  typeButton: {
    flex: 1,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: 'white',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  typeButtonActive: {
    transform: [{ scale: 1.02 }],
  },
  typeButtonGradient: {
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  typeButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6B7280',
    marginLeft: 8,
  },
  typeButtonTextActive: {
    color: 'white',
  },
  inputSection: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 12,
  },
  amountInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingVertical: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  amountInput: {
    flex: 1,
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1F2937',
  },
  currency: {
    fontSize: 18,
    fontWeight: '600',
    color: '#6B7280',
  },
  textInput: {
    backgroundColor: 'white',
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingVertical: 16,
    fontSize: 16,
    color: '#1F2937',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  categoryCard: {
    width: '47%',
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
    position: 'relative',
    overflow: 'hidden',
  },
  categoryCardSelected: {
    transform: [{ scale: 1.02 }],
  },
  categoryIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  categoryText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1F2937',
    textAlign: 'center',
  },
  categoryTextSelected: {
    color: 'white',
    zIndex: 2,
  },
  categorySelectedOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  modalCard: {
    width: '100%',
    maxHeight: '80%',
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
  },
  modalSubtitle: {
    marginTop: 4,
    color: '#6B7280',
  },
  previewList: {
    marginTop: 12,
  },
  previewItem: {
    paddingVertical: 10,
    borderBottomColor: '#E5E7EB',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  previewHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  previewBadge: {
    backgroundColor: '#F3F4F6',
    color: '#111827',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    fontSize: 12,
    overflow: 'hidden',
  },
  previewAmount: {
    fontWeight: '800',
    color: '#111827',
  },
  previewTitle: {
    fontWeight: '600',
    color: '#111827',
  },
  previewMeta: {
    color: '#6B7280',
    marginTop: 2,
    fontSize: 12,
  },
  previewMore: {
    textAlign: 'center',
    color: '#6B7280',
    marginVertical: 8,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    paddingTop: 12,
    paddingBottom: 4,
  },
  modalButton: {
    flex: 1,
    borderRadius: 12,
    alignItems: 'center',
    paddingVertical: 12,
  },
  modalCancel: {
    backgroundColor: '#F3F4F6',
  },
  modalConfirm: {
    backgroundColor: '#10B981',
  },
  modalButtonText: {
    color: '#111827',
    fontWeight: '700',
  },
  submitButton: {
    marginTop: 16,
    marginBottom: 32,
    borderRadius: 16,
    overflow: 'hidden',
  },
  submitGradient: {
    paddingVertical: 18,
    alignItems: 'center',
  },
  submitText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: 'white',
  },
});