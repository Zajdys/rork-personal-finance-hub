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
  Camera,
  FileText,
  Plus,
  ArrowLeft,
  FileSpreadsheet,
  ChevronRight,
} from 'lucide-react-native';
import { useFinanceStore, CustomCategory } from '@/store/finance-store';
import { useBuddyStore } from '@/store/buddy-store';
import { useLanguageStore } from '@/store/language-store';
import { pluralTransakce } from '@/lib/plural-cs';
import { logAndGetUserFacingError } from '@/lib/user-facing-error';
import { convertForeignAmount } from '@/lib/cnb-exchange-rates';
import { randomUUID } from '@/lib/random-uuid';
import { useTheme } from '@/hooks/use-theme';
import { toYyyyMmDd, transactionDateYmd, ymdToLocalDateNoon } from '@/lib/transaction-date';
import * as ImagePicker from 'expo-image-picker';
import { generateObject } from '@rork-ai/toolkit-sdk';
import { z } from 'zod';
import { parseMoneyInput } from '@/lib/parse-money-input';
import { AsyncButton } from '@/components/AsyncButton';
import { useAsyncAction } from '@/hooks/use-async-action';
import { safePush } from '@/lib/safe-navigate';

type ParsedTxn = {
  type: 'income' | 'expense';
  amount: number;
  title: string;
  category: string;
  date: string;
};

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

const MANUAL_CURRENCIES = ['CZK', 'EUR', 'USD', 'GBP', 'CHF', 'PLN'] as const;

export default function AddTransactionScreen() {
  const { colors } = useTheme();
  const [type, setType] = useState<'income' | 'expense'>('expense');
  const [amount, setAmount] = useState<string>('');
  const [currency, setCurrency] = useState<(typeof MANUAL_CURRENCIES)[number]>('CZK');
  const [fxBusy, setFxBusy] = useState(false);
  const [title, setTitle] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [preview, setPreview] = useState<ParsedTxn[]>([]);
  const [previewOpen, setPreviewOpen] = useState<boolean>(false);
  const [invoiceScanOpen, setInvoiceScanOpen] = useState<boolean>(false);
  const [scanningInvoice, setScanningInvoice] = useState<boolean>(false);
  const [receiptScanOpen, setReceiptScanOpen] = useState<boolean>(false);
  const [scanningReceipt, setScanningReceipt] = useState<boolean>(false);
  const [createCategoryOpen, setCreateCategoryOpen] = useState<boolean>(false);
  const [newCategoryName, setNewCategoryName] = useState<string>('');
  const [newCategoryIcon, setNewCategoryIcon] = useState<string>('📦');
  const [newCategoryColor, setNewCategoryColor] = useState<string>('#6B7280');
  
  const { addTransaction, getAllCategories, addCustomCategory } = useFinanceStore();
  const { addPoints, showBuddyMessage } = useBuddyStore();
  const { t, language } = useLanguageStore();

  const categoryData = getAllCategories(type);
  const categoryIcons = type === 'income' ? INCOME_CATEGORY_ICONS : EXPENSE_CATEGORY_ICONS;
  
  const categories = Object.entries(categoryData).map(([name, data]) => ({
    id: name,
    name,
    icon: categoryIcons[name as keyof typeof categoryIcons] || ShoppingCart,
    color: data.color,
  }));

  const { run: handleSubmit } = useAsyncAction(async () => {
    if (fxBusy) return;
    if (!amount || !title || !selectedCategory) {
      Alert.alert(t('errorMessage'), t('fillAllFields'));
      return;
    }

    const numAmount = parseMoneyInput(amount);
    if (numAmount == null || numAmount <= 0) {
      Alert.alert(t('errorMessage'), t('enterValidAmount'));
      return;
    }

    const dateYmd = toYyyyMmDd(new Date());
    let amountCzk = numAmount;
    let originalAmount: number | null = null;
    let originalCurrency: string | null = null;
    let exchangeRate: number | null = null;

    if (currency !== 'CZK') {
      try {
        setFxBusy(true);
        const fx = await convertForeignAmount({
          originalAmount: numAmount,
          originalCurrency: currency,
          date: dateYmd,
        });
        amountCzk = fx.amountCzk;
        originalAmount = fx.originalAmount;
        originalCurrency = fx.originalCurrency;
        exchangeRate = fx.exchangeRate;
      } catch (e) {
        Alert.alert(
          t('errorMessage'),
          e instanceof Error ? e.message : logAndGetUserFacingError('fx-convert', e),
        );
        return;
      } finally {
        setFxBusy(false);
      }
    }

    addTransaction({
      id: randomUUID(),
      type,
      amount: amountCzk,
      title,
      category: selectedCategory,
      date: dateYmd,
      originalAmount,
      originalCurrency,
      exchangeRate,
    });

    addPoints(5);
    
    const displayAmt =
      originalCurrency && originalAmount != null
        ? `${amountCzk.toLocaleString('cs-CZ')} Kč (${originalAmount.toLocaleString('cs-CZ')} ${originalCurrency})`
        : `${amountCzk.toLocaleString('cs-CZ')} Kč`;
    showBuddyMessage(
      type === 'income' 
        ? `${t('addedIncome')} ${displayAmt}. ${t('dontForgetInvest')}`
        : `${t('recordedExpense')} ${displayAmt} za ${selectedCategory}. ${t('watchBudget')}`
    );

    // Reset form
    setAmount('');
    setCurrency('CZK');
    setTitle('');
    setSelectedCategory('');
    
    Alert.alert(t('successMessage'), t('transactionAdded'));
  });


  const confirmImport = useCallback(() => {
    try {
      let count = 0;
      for (const p of preview) {
        const tx = {
          id: randomUUID(),
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
      Alert.alert(
        t('done'),
        t('addTransaction.importedCount', {
          count,
          transactionsWord: pluralTransakce(count, language === 'en' ? 'en' : 'cs'),
        }),
      );
      addPoints(10);
      showBuddyMessage(t('addTransaction.bankImportBuddy'));
    } catch (e) {
      console.error('confirmImport error', e);
      Alert.alert(t('error'), t('addTransaction.importFailed'));
    }
  }, [preview, addTransaction, addPoints, showBuddyMessage, t, language]);

  const scanInvoiceWithCamera = useCallback(async () => {
    setInvoiceScanOpen(true);
  }, []);

  const scanReceiptWithCamera = useCallback(async () => {
    setReceiptScanOpen(true);
  }, []);

  const processReceiptFile = useCallback(async (uri: string) => {
    try {
      setScanningReceipt(true);
      console.log('Processing receipt from URI:', uri);
      
      const response = await fetch(uri);
      const blob = await response.blob();
      const reader = new FileReader();
      
      reader.onloadend = async () => {
        try {
          const result = reader.result as string;
          if (!result) {
            Alert.alert(t('error'), t('addTransaction.receiptEmpty'));
            setScanningReceipt(false);
            return;
          }
          
          const base64Data = result.split(',')[1];
          if (!base64Data) {
            Alert.alert(t('error'), t('addTransaction.receiptConvertFailed'));
            setScanningReceipt(false);
            return;
          }
          
          console.log('Base64 data length:', base64Data.length);
          
          if (base64Data.length < 100) {
            Alert.alert(t('error'), t('addTransaction.receiptTooSmall'));
            setScanningReceipt(false);
            return;
          }
          
          const schema = z.object({
            items: z.array(
              z.object({
                title: z.string().describe('Název položky, např. "Mléko 1L" nebo "Rohlíky 5ks"'),
                amount: z.number().describe('CELKOVÁ číselná částka za tuto položku v Kč'),
                category: z.string().describe('Kategorie - jedna z: Jídlo a nápoje, Nájem a bydlení, Oblečení, Doprava, Zábava, Zdraví, Vzdělání, Nákupy, Služby, Ostatní'),
              })
            ),
          });

          type ReceiptResult = z.infer<typeof schema>;
          let receiptResult: ReceiptResult;
          try {
            console.log('Calling AI for receipt with image size:', base64Data.length);
            
            receiptResult = await Promise.race<ReceiptResult>([
              generateObject({
                messages: [
                  {
                    role: 'user',
                    content: [
                      {
                        type: 'text',
                        text: 'Analyzuj tuto účtenku a vrať VŠECHNY položky. DŮLEŽITÉ PRAVIDLA:\n\n1. VŽDY použij CELKOVOU cenu položky (pokud je 4 jednotky à 50Kč, amount musí být 200, ne 50)\n2. Do title zahrň název produktu/služby + množství pokud je uvedeno\n3. Zpracuj VŠECHNY položky z účtenky, i když je jich hodně (10+, 20+, 50+)\n4. Pokud vidíš jednotkovou cenu a množství, vynásob je pro celkovou částku\n5. Nezapomeň na žádnou položku, i když je účtenka dlouhá\n6. Ignoruj mezisoučty jako "Mezisoučet" nebo "DPH" nebo "Celkem" - zajímají nás jen jednotlivé položky\n7. Pokud je položka uvedena vícekrát, každá má vlastní záznam\n\nKategorie:\n- Jídlo a nápoje: potraviny, nápoje, restaurace\n- Nájem a bydlení: nájem, energie, internet, telefon\n- Oblečení: oděvy, boty, doplňky\n- Doprava: benzín, jízdenky, taxi\n- Zábava: kino, hry, sport\n- Zdraví: léky, vitamíny, lékárna\n- Vzdělání: knihy, kurzy\n- Nákupy: elektronika, drogerie, domácnost\n- Služby: servis, opravy, služby\n- Ostatní: vše ostatní\n\nPŘÍKLAD 1:\nPokud na účtenke je: "Mléko 1,5%\n2 ks x 25 Kč\nCelkem: 50 Kč"\nVrať: {title: "Mléko 1,5% 2 ks", amount: 50, category: "Jídlo a nápoje"}\n\nPŘÍKLAD 2:\nPokud na účtenke je: "Rohlík\n5 ks x 3 Kč\n15 Kč"\nVrať: {title: "Rohlík 5 ks", amount: 15, category: "Jídlo a nápoje"}\n\nPŘÍKLAD 3:\nPokud na účtenke je: "Benzín Natural 95\n35 L x 38,50 Kč\n1 347,50 Kč"\nVrať: {title: "Benzín Natural 95 35 L", amount: 1347.50, category: "Doprava"}',
                      },
                      {
                        type: 'image',
                        image: base64Data,
                      },
                    ],
                  },
                ],
                schema,
              }),
              new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Request timeout after 60 seconds')), 60000)
              )
            ]);
            
            console.log('AI receipt call successful');
          } catch (aiError) {
            console.error('Receipt AI error:', aiError);
            console.error('Error type:', typeof aiError);
            console.error('Error name:', (aiError as any)?.name);
            console.error('Error message:', (aiError as any)?.message);
            console.error('Error stack:', (aiError as any)?.stack);
            console.error('Error details:', JSON.stringify(aiError, Object.getOwnPropertyNames(aiError)));
            
            if (aiError instanceof Error) {
              const errorMsg = aiError.message.toLowerCase();
              
              if (errorMsg.includes('network request failed') || 
                  errorMsg.includes('failed to fetch') ||
                  errorMsg.includes('network error') ||
                  errorMsg.includes('fetch failed')) {
                Alert.alert(
                  t('addTransaction.connectionError'), 
                  t('addTransaction.connectionErrorBody')
                );
              } else if (errorMsg.includes('timeout')) {
                Alert.alert(
                  t('addTransaction.aiTimeout'), 
                  t('addTransaction.aiTimeoutBody')
                );
              } else if (errorMsg.includes('not configured') || errorMsg.includes('undefined')) {
                Alert.alert(
                  t('addTransaction.serviceUnavailable'), 
                  t('addTransaction.serviceUnavailableReceipt')
                );
              } else {
                Alert.alert(
                  t('error'), 
                  t('addTransaction.receiptProcessFailed', { message: aiError.message })
                );
              }
            } else {
              Alert.alert(
                t('error'), 
                t('addTransaction.receiptProcessFailedGeneric')
              );
            }
            setScanningReceipt(false);
            return;
          }

          const receiptItems = receiptResult.items || [];
          console.log('Parsed receipt items:', receiptItems);
          
          if (receiptItems.length === 0) {
            Alert.alert(t('error'), t('addTransaction.noReceiptItems'));
            setScanningReceipt(false);
            return;
          }
          
          const receiptTransactions: ParsedTxn[] = receiptItems.map((item: any, index: number) => ({
            type: 'expense' as const,
            amount: parseMoneyInput(item.amount) ?? 0,
            title: item.title || t('addTransaction.itemFallback', { index: index + 1 }),
            category: item.category || 'Ostatní',
            date: toYyyyMmDd(new Date()),
          }));
          
          console.log('Receipt transactions created:', receiptTransactions.length);
          setPreview(receiptTransactions);
          setPreviewOpen(true);
          setScanningReceipt(false);
          
          addPoints(3);
          showBuddyMessage(t('addTransaction.receiptSuccessBuddy'));
          
        } catch (error) {
          console.error('Receipt processing error:', error);
          Alert.alert(t('error'), t('addTransaction.receiptProcessError', {
            error: logAndGetUserFacingError('add-tab', error),
          }));
          setScanningReceipt(false);
        }
      };
      
      reader.readAsDataURL(blob);
      
    } catch (error) {
      console.error('Receipt file processing error:', error);
      Alert.alert(t('error'), t('addTransaction.receiptLoadFailed'));
      setScanningReceipt(false);
    }
  }, [addPoints, showBuddyMessage, t]);

  const processInvoiceFile = useCallback(async (uri: string) => {
    try {
      setScanningInvoice(true);
      console.log('Processing invoice from URI:', uri);
      
      const response = await fetch(uri);
      const blob = await response.blob();
      const reader = new FileReader();
      
      reader.onloadend = async () => {
        try {
          const result = reader.result as string;
          if (!result) {
            Alert.alert(t('error'), t('addTransaction.invoiceEmpty'));
            setScanningInvoice(false);
            return;
          }
          
          const base64Data = result.split(',')[1];
          if (!base64Data) {
            Alert.alert(t('error'), t('addTransaction.invoiceConvertFailed'));
            setScanningInvoice(false);
            return;
          }
          
          console.log('Base64 data length:', base64Data.length);
          
          if (base64Data.length < 100) {
            Alert.alert(t('error'), t('addTransaction.invoiceTooSmall'));
            setScanningInvoice(false);
            return;
          }
          
          const schema = z.object({
            items: z.array(
              z.object({
                title: z.string().describe('Název položky včetně množství, např. "Webový hosting 1 rok" nebo "Grafické práce 5 hodin"'),
                amount: z.number().describe('CELKOVÁ číselná částka za tuto položku v Kč (ne jednotková cena)'),
                category: z.string().describe('Kategorie - jedna z: Jídlo a nápoje, Nájem a bydlení, Oblečení, Doprava, Zábava, Zdraví, Vzdělání, Nákupy, Služby, Ostatní'),
              })
            ),
          });

          type InvoiceResult = z.infer<typeof schema>;
          let invoiceResult: InvoiceResult;
          try {
            console.log('Calling AI for invoice with image size:', base64Data.length);
            
            invoiceResult = await Promise.race<InvoiceResult>([
              generateObject({
                messages: [
                  {
                    role: 'user',
                    content: [
                      {
                        type: 'text',
                        text: 'Analyzuj tuto fakturu a vrať VŠECHNY položky. DŮLEŽITÉ PRAVIDLA:\n\n1. VŽDY použij CELKOVOU cenu položky (pokud je 4 jednotky à 500Kč, amount musí být 2000, ne 500)\n2. Do title zahrň název služby/produktu + jednotky/množství pokud je uvedeno\n3. Zpracuj VŠECHNY položky z faktury, i když je jich hodně (10+, 20+, 50+)\n4. Pokud vidíš jednotkovou cenu a množství, vynásob je pro celkovou částku\n5. Nezapomeň na žádnou položku, i když je faktura dlouhá\n6. Ignoruj mezisoučty jako "Mezisoučet" nebo "DPH celkem" - zajímají nás jen jednotlivé položky\n7. Pokud je položka uvedena vícekrát, každá má vlastní záznam\n\nKategorie:\n- Jídlo a nápoje: catering, nápoje, potraviny\n- Nájem a bydlení: nájem, energie, internet, telefon, údržba\n- Oblečení: oděvy, boty, doplňky\n- Doprava: benzín, leasing, servis, parkování\n- Zábava: předplatné, licence, streaming\n- Zdraví: léky, zdravotní pomůcky, pojištění\n- Vzdělání: kurzy, školení, knihy, certifikace\n- Nákupy: elektronika, software, kancelářské potřeby, nábytek\n- Služby: konzultace, právní služby, účetnictví, hosting, reklama\n- Ostatní: vše ostatní\n\nPŘÍKLAD 1:\nPokud na faktuře je: "Webový hosting\n12 měsíců x 250 Kč\nCelkem: 3 000 Kč"\nVrať: {title: "Webový hosting 12 měsíců", amount: 3000, category: "Služby"}\n\nPŘÍKLAD 2:\nPokud na faktuře je: "Grafické práce\n5 hodin x 800 Kč\n4 000 Kč"\nVrať: {title: "Grafické práce 5 hodin", amount: 4000, category: "Služby"}\n\nPŘÍKLAD 3:\nPokud na faktuře je: "Licence Microsoft Office\n1 ks 2 500 Kč"\nVrať: {title: "Licence Microsoft Office", amount: 2500, category: "Nákupy"}',
                      },
                      {
                        type: 'image',
                        image: base64Data,
                      },
                    ],
                  },
                ],
                schema,
              }),
              new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Request timeout after 60 seconds')), 60000)
              )
            ]);
            
            console.log('AI invoice call successful');
          } catch (aiError) {
            console.error('Invoice AI error:', aiError);
            console.error('Error type:', typeof aiError);
            console.error('Error name:', (aiError as any)?.name);
            console.error('Error message:', (aiError as any)?.message);
            console.error('Error stack:', (aiError as any)?.stack);
            console.error('Error details:', JSON.stringify(aiError, Object.getOwnPropertyNames(aiError)));
            
            if (aiError instanceof Error) {
              const errorMsg = aiError.message.toLowerCase();
              
              if (errorMsg.includes('network request failed') || 
                  errorMsg.includes('failed to fetch') ||
                  errorMsg.includes('network error') ||
                  errorMsg.includes('fetch failed')) {
                Alert.alert(
                  t('addTransaction.connectionError'), 
                  t('addTransaction.connectionErrorInvoice')
                );
              } else if (errorMsg.includes('timeout')) {
                Alert.alert(
                  t('addTransaction.aiTimeout'), 
                  t('addTransaction.aiTimeoutInvoice')
                );
              } else if (errorMsg.includes('not configured') || errorMsg.includes('undefined')) {
                Alert.alert(
                  t('addTransaction.serviceUnavailable'), 
                  t('addTransaction.serviceUnavailableInvoice')
                );
              } else {
                Alert.alert(
                  t('error'), 
                  t('addTransaction.invoiceProcessFailed', { message: aiError.message })
                );
              }
            } else {
              Alert.alert(
                t('error'), 
                t('addTransaction.invoiceProcessFailedGeneric')
              );
            }
            setScanningInvoice(false);
            return;
          }

          const invoiceItems = invoiceResult.items || [];
          console.log('Parsed invoice items:', invoiceItems);
          
          if (invoiceItems.length === 0) {
            Alert.alert(t('error'), t('addTransaction.noInvoiceItems'));
            setScanningInvoice(false);
            return;
          }
          
          const invoiceTransactions: ParsedTxn[] = invoiceItems.map((item: any, index: number) => ({
            type: 'expense' as const,
            amount: parseMoneyInput(item.amount) ?? 0,
            title: item.title || t('addTransaction.itemFallback', { index: index + 1 }),
            category: item.category || 'Ostatní',
            date: toYyyyMmDd(new Date()),
          }));
          
          console.log('Invoice transactions created:', invoiceTransactions.length);
          setPreview(invoiceTransactions);
          setPreviewOpen(true);
          setScanningInvoice(false);
          
          addPoints(3);
          showBuddyMessage(t('addTransaction.invoiceSuccessBuddy'));
          
        } catch (error) {
          console.error('Invoice processing error:', error);
          Alert.alert(t('error'), t('addTransaction.invoiceProcessError', {
            error: logAndGetUserFacingError('add-tab', error),
          }));
          setScanningInvoice(false);
        }
      };
      
      reader.readAsDataURL(blob);
      
    } catch (error) {
      console.error('Invoice file processing error:', error);
      Alert.alert(t('error'), t('addTransaction.invoiceLoadFailed'));
      setScanningInvoice(false);
    }
  }, [addPoints, showBuddyMessage, t]);

  const requestCameraPermission = useCallback(async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    return status === 'granted';
  }, []);

  const takePictureInvoice = useCallback(async () => {
    try {
      const hasPermission = await requestCameraPermission();
      if (!hasPermission) {
        Alert.alert(t('errorMessage'), t('cameraPermissionNeeded'));
        return;
      }
      
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
      });
      
      if (!result.canceled && result.assets[0]) {
        setInvoiceScanOpen(false);
        await processInvoiceFile(result.assets[0].uri);
      }
    } catch (error) {
      console.error('Camera error:', error);
      Alert.alert(t('error'), t('cameraError'));
    }
  }, [processInvoiceFile, requestCameraPermission, t]);

  const selectFromGalleryInvoice = useCallback(async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(t('errorMessage'), t('galleryPermissionNeeded'));
        return;
      }
      
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
      });
      
      if (!result.canceled && result.assets[0]) {
        setInvoiceScanOpen(false);
        await processInvoiceFile(result.assets[0].uri);
      }
    } catch (error) {
      console.error('Gallery error:', error);
      Alert.alert(t('error'), t('galleryError'));
    }
  }, [processInvoiceFile, t]);

  const takePictureReceipt = useCallback(async () => {
    try {
      const hasPermission = await requestCameraPermission();
      if (!hasPermission) {
        Alert.alert(t('errorMessage'), t('cameraPermissionNeeded'));
        return;
      }
      
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
      });
      
      if (!result.canceled && result.assets[0]) {
        setReceiptScanOpen(false);
        await processReceiptFile(result.assets[0].uri);
      }
    } catch (error) {
      console.error('Camera error:', error);
      Alert.alert(t('error'), t('cameraError'));
    }
  }, [processReceiptFile, requestCameraPermission, t]);

  const selectFromGalleryReceipt = useCallback(async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(t('errorMessage'), t('galleryPermissionNeeded'));
        return;
      }
      
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
      });
      
      if (!result.canceled && result.assets[0]) {
        setReceiptScanOpen(false);
        await processReceiptFile(result.assets[0].uri);
      }
    } catch (error) {
      console.error('Gallery error:', error);
      Alert.alert(t('error'), t('galleryError'));
    }
  }, [processReceiptFile, t]);

  const availableColors = [
    '#EF4444', '#F59E0B', '#10B981', '#06B6D4', '#8B5CF6', 
    '#EC4899', '#6366F1', '#F97316', '#84CC16', '#6B7280'
  ];

  const availableIcons = [
    '📦', '🍽️', '🏠', '👕', '🚗', '🎬', '⚕️', '📚', '🛍️', '🔧',
    '💼', '💻', '📈', '🎁', '💰', '🎯', '🏋️', '✈️', '🎵', '📱'
  ];

  const handleCreateCategory = () => {
    if (!newCategoryName.trim()) {
      Alert.alert(t('errorMessage'), t('addTransaction.enterCategoryName'));
      return;
    }

    const newCategory: CustomCategory = {
      id: Date.now().toString(),
      name: newCategoryName.trim(),
      icon: newCategoryIcon,
      color: newCategoryColor,
      type: type,
    };

    addCustomCategory(newCategory);
    setSelectedCategory(newCategory.name);
    setCreateCategoryOpen(false);
    setNewCategoryName('');
    setNewCategoryIcon('📦');
    setNewCategoryColor('#6B7280');
    
    addPoints(2);
    showBuddyMessage(t('addTransaction.categoryCreated'));
  };

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
          <TrendingUp color={type === 'income' ? 'white' : colors.textSecondary} size={20} />
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
          <TrendingDown color={type === 'expense' ? 'white' : colors.textSecondary} size={20} />
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
    
        const isSelected = selectedCategory === category.id;
        
        return (
          <TouchableOpacity
            key={category.id}
            testID={`category-${category.id}`}
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected }}
            style={[
              styles.categoryCard,
              { backgroundColor: colors.surface, borderColor: colors.border },
              isSelected && styles.categoryCardSelected,
              isSelected ? { borderColor: category.color } : null,
            ]}
            onPress={() => setSelectedCategory(category.id)}
          >
            <View
              style={[
                styles.categoryIcon,
                {
                  backgroundColor: isSelected ? (category.color + '33') : (category.color + '20'),
                  borderWidth: isSelected ? 2 : 0,
                  borderColor: isSelected ? category.color : 'transparent',
                },
              ]}
            >
              <Text style={{ fontSize: 24 }}>
                {categoryData[category.name]?.icon || '📦'}
              </Text>
            </View>
            <Text
              style={[
                styles.categoryText,
                { color: colors.text },
                isSelected ? { color: category.color, fontWeight: '700' } : null,
              ]}
              numberOfLines={1}
            >
              {category.name}
            </Text>
          </TouchableOpacity>
        );
      })}
      
      <TouchableOpacity
        style={[styles.categoryCard, styles.addCategoryCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
        onPress={() => setCreateCategoryOpen(true)}
      >
        <View style={[styles.categoryIcon, { backgroundColor: colors.muted }]}>
          <Plus color={colors.textSecondary} size={24} />
        </View>
        <Text style={[styles.categoryText, { color: colors.textSecondary }]}>
          {t('addTransaction.newCategory')}
        </Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]} showsVerticalScrollIndicator={false}>
      <LinearGradient
        colors={[colors.gradientStart, colors.gradientEnd]}
        style={styles.header}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <Text style={styles.headerTitle}>{t('addTransaction')}</Text>
        <Text style={styles.headerSubtitle}>{t('recordTransactions')}</Text>
      </LinearGradient>

      <View style={styles.content}>
        <View style={styles.bankImportWrap}>
          <TouchableOpacity onPress={() => safePush('/bank-import')} activeOpacity={0.92}>
            <LinearGradient
              colors={['#0D9488', '#0F766E']}
              style={styles.bankImportCard}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <View style={styles.bankImportIconCircle}>
                <FileSpreadsheet color="white" size={26} />
              </View>
              <View style={styles.bankImportTextCol}>
                <Text style={styles.bankImportTitle}>{t('addTransaction.importStatement')}</Text>
                <Text style={styles.bankImportSubtitle}>
                  {t('addTransaction.importStatementSubtitle')}
                </Text>
              </View>
              <ChevronRight color="rgba(255,255,255,0.9)" size={24} />
            </LinearGradient>
          </TouchableOpacity>
        </View>

        <TypeSelector />

        <View style={styles.importSection}>
          <View style={styles.receiptButtons}>
            <TouchableOpacity
              style={[styles.receiptButton, styles.receiptButtonCamera]}
              onPress={scanReceiptWithCamera}
              disabled={scanningReceipt}
            >
              <LinearGradient colors={["#f59e0b", "#d97706"]} style={styles.receiptGradient}>
                {scanningReceipt ? (
                  <ActivityIndicator color="#fff" size={16} />
                ) : (
                  <>
                    <Camera color="#fff" size={16} />
                    <Text style={styles.receiptButtonText}>{t('photoReceipt')}</Text>
                  </>
                )}
              </LinearGradient>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[styles.receiptButton, styles.receiptButtonCamera]}
              onPress={scanInvoiceWithCamera}
              disabled={scanningInvoice}
            >
              <LinearGradient colors={["#10b981", "#059669"]} style={styles.receiptGradient}>
                {scanningInvoice ? (
                  <ActivityIndicator color="#fff" size={16} />
                ) : (
                  <>
                    <Camera color="#fff" size={16} />
                    <Text style={styles.receiptButtonText}>{t('addTransaction.photoInvoice')}</Text>
                  </>
                )}
              </LinearGradient>
            </TouchableOpacity>
          </View>
          
        </View>

        <View style={styles.inputSection}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('amount')}</Text>
          <View style={[styles.amountInputContainer, { backgroundColor: colors.surface }]}>
            <TextInput
              style={[styles.amountInput, { color: colors.text }]}
              value={amount}
              onChangeText={setAmount}
              placeholder="0"
              keyboardType="decimal-pad"
              placeholderTextColor={colors.textSecondary}
            />
            <Text style={[styles.currency, { color: colors.textSecondary }]}>
              {currency === 'CZK' ? t('currencySymbol') : currency}
            </Text>
          </View>
          <View style={styles.currencyRow}>
            {MANUAL_CURRENCIES.map((c) => {
              const active = currency === c;
              return (
                <TouchableOpacity
                  key={c}
                  onPress={() => setCurrency(c)}
                  style={[
                    styles.currencyChip,
                    {
                      backgroundColor: active ? colors.primary : colors.surface,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <Text
                    style={{
                      color: active ? '#fff' : colors.text,
                      fontWeight: active ? '700' : '500',
                      fontSize: 13,
                    }}
                  >
                    {c}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          {fxBusy ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 }}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
                Stahuji kurz ČNB…
              </Text>
            </View>
          ) : null}
        </View>

        <View style={styles.inputSection}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('description')}</Text>
          <TextInput
            style={[styles.textInput, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]}
            value={title}
            onChangeText={setTitle}
            placeholder={type === 'income' ? t('exampleSalary') : t('exampleShopping')}
            placeholderTextColor={colors.textSecondary}
          />
        </View>

        <View style={styles.inputSection}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('category')}</Text>
          <CategoryGrid />
        </View>

        <AsyncButton
          variant={type === 'income' ? 'success' : 'danger'}
          label={type === 'income' ? t('addIncome') : t('addExpense')}
          loadingLabel={t('hhNotifSaving')}
          onPress={handleSubmit}
          disabled={fxBusy}
          style={styles.submitButton}
          contentStyle={styles.submitGradient}
          textStyle={styles.submitText}
        />
      </View>

      <Modal visible={receiptScanOpen} transparent animationType="slide" onRequestClose={() => setReceiptScanOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.receiptScanModal}>
            <Text style={styles.modalTitle}>{t('uploadReceipt')}</Text>
            <Text style={styles.modalSubtitle}>{t('selectScanMethod')}</Text>
            
            <View style={styles.receiptScanOptions}>
              <TouchableOpacity style={styles.receiptScanOption} onPress={takePictureReceipt}>
                <Camera color="#f59e0b" size={32} />
                <Text style={styles.receiptScanOptionTitle}>{t('takePhoto')}</Text>
                <Text style={styles.receiptScanOptionDesc}>{t('takeNewPhoto')}</Text>
              </TouchableOpacity>
              
              <TouchableOpacity style={styles.receiptScanOption} onPress={selectFromGalleryReceipt}>
                <FileText color="#f59e0b" size={32} />
                <Text style={styles.receiptScanOptionTitle}>{t('selectFromGallery')}</Text>
                <Text style={styles.receiptScanOptionDesc}>{t('useExistingPhoto')}</Text>
              </TouchableOpacity>
            </View>
            
            <TouchableOpacity 
              style={styles.receiptScanCancel} 
              onPress={() => setReceiptScanOpen(false)}
            >
              <Text style={styles.receiptScanCancelText}>{t('cancel')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={invoiceScanOpen} transparent animationType="slide" onRequestClose={() => setInvoiceScanOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.receiptScanModal}>
            <Text style={styles.modalTitle}>{t('addTransaction.uploadInvoice')}</Text>
            <Text style={styles.modalSubtitle}>{t('addTransaction.uploadInvoiceSubtitle')}</Text>
            
            <View style={styles.receiptScanOptions}>
              <TouchableOpacity style={styles.receiptScanOption} onPress={takePictureInvoice}>
                <Camera color="#10b981" size={32} />
                <Text style={styles.receiptScanOptionTitle}>{t('takePhoto')}</Text>
                <Text style={styles.receiptScanOptionDesc}>{t('takeNewPhoto')}</Text>
              </TouchableOpacity>
              
              <TouchableOpacity style={styles.receiptScanOption} onPress={selectFromGalleryInvoice}>
                <FileText color="#8b5cf6" size={32} />
                <Text style={styles.receiptScanOptionTitle}>{t('selectFromGallery')}</Text>
                <Text style={styles.receiptScanOptionDesc}>{t('useExistingPhoto')}</Text>
              </TouchableOpacity>
            </View>
            
            <TouchableOpacity 
              style={styles.receiptScanCancel} 
              onPress={() => setInvoiceScanOpen(false)}
            >
              <Text style={styles.receiptScanCancelText}>{t('cancel')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={previewOpen} transparent animationType="slide" onRequestClose={() => setPreviewOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <TouchableOpacity 
                style={styles.modalBackButton} 
                onPress={() => setPreviewOpen(false)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <ArrowLeft color="#6B7280" size={24} />
              </TouchableOpacity>
              <View style={styles.modalHeaderTexts}>
                <Text style={styles.modalTitle}>{t('addTransaction.previewTitle')}</Text>
                <Text style={styles.modalSubtitle}>{t('addTransaction.previewCount', { count: preview.length })}</Text>
              </View>
            </View>
            <ScrollView style={styles.previewList} contentContainerStyle={{ paddingBottom: 12 }}>
              {preview.slice(0, 50).map((p, idx) => (
                <View key={`${p.title}-${idx}`} style={styles.previewItem} testID={`preview-item-${idx}`}>
                  <View style={styles.previewHeaderRow}>
                    <Text style={styles.previewBadge}>{p.type === 'income' ? t('income') : t('expense')}</Text>
                    <Text style={styles.previewAmount}>{p.amount.toLocaleString('cs-CZ')} Kč</Text>
                  </View>
                  <Text style={styles.previewTitle}>{p.title}</Text>
                  <Text style={styles.previewMeta}>{p.category} • {ymdToLocalDateNoon(transactionDateYmd(p.date)).toLocaleDateString('cs-CZ')}</Text>
                </View>
              ))}
              {preview.length > 50 ? (
                <Text style={styles.previewMore}>{t('addTransaction.previewMore', { count: preview.length - 50 })}</Text>
              ) : null}
            </ScrollView>
            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.modalButton, styles.modalCancel]} onPress={() => setPreviewOpen(false)} testID="cancel-import">
                <Text style={styles.modalButtonText}>{t('cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalButton, styles.modalConfirm]} onPress={confirmImport} testID="confirm-import">
                <Text style={[styles.modalButtonText, { color: '#fff' }]}>{t('addTransaction.importButton')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={createCategoryOpen} transparent animationType="slide" onRequestClose={() => setCreateCategoryOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.createCategoryModal}>
            <Text style={styles.modalTitle}>{t('addTransaction.createCategory')}</Text>
            
            <View style={styles.createCategoryForm}>
              <Text style={styles.formLabel}>{t('addTransaction.categoryName')}</Text>
              <TextInput
                style={styles.categoryNameInput}
                value={newCategoryName}
                onChangeText={setNewCategoryName}
                placeholder={t('addTransaction.categoryNamePlaceholder')}
                placeholderTextColor="#9CA3AF"
              />
              
              <Text style={styles.formLabel}>{t('addTransaction.icon')}</Text>
              <View style={styles.iconGrid}>
                {availableIcons.map((icon) => (
                  <TouchableOpacity
                    key={icon}
                    style={[
                      styles.iconOption,
                      newCategoryIcon === icon && styles.iconOptionSelected
                    ]}
                    onPress={() => setNewCategoryIcon(icon)}
                  >
                    <Text style={styles.iconText}>{icon}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              
              <Text style={styles.formLabel}>{t('addTransaction.color')}</Text>
              <View style={styles.colorGrid}>
                {availableColors.map((color) => (
                  <TouchableOpacity
                    key={color}
                    style={[
                      styles.colorOption,
                      { backgroundColor: color },
                      newCategoryColor === color && styles.colorOptionSelected
                    ]}
                    onPress={() => setNewCategoryColor(color)}
                  />
                ))}
              </View>
            </View>
            
            <View style={styles.createCategoryActions}>
              <TouchableOpacity 
                style={[styles.modalButton, styles.modalCancel]} 
                onPress={() => setCreateCategoryOpen(false)}
              >
                <Text style={styles.modalButtonText}>{t('cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.modalButton, styles.modalConfirm]} 
                onPress={handleCreateCategory}
              >
                <Text style={[styles.modalButtonText, { color: '#fff' }]}>{t('addTransaction.create')}</Text>
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
  bankImportWrap: {
    marginTop: 12,
    marginBottom: 4,
  },
  bankImportCard: {
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 4,
  },
  bankImportIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  bankImportTextCol: {
    flex: 1,
  },
  bankImportTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: 'white',
  },
  bankImportSubtitle: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.88)',
    marginTop: 4,
    lineHeight: 18,
  },
  importSection: {
    marginTop: 16,
    marginBottom: 8,
    gap: 12,
  },
  receiptButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  receiptButton: {
    flex: 1,
    borderRadius: 12,
    overflow: 'hidden',
  },
  receiptButtonCamera: {},
  receiptButtonUpload: {},
  receiptGradient: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  receiptButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  importButton: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  importGradient: {
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
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
    marginTop: 12,
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
  currencyRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  currencyChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
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
    borderWidth: 2,
    borderColor: '#F3F4F6',
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
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 4,
  },
  modalBackButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalHeaderTexts: {
    flex: 1,
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
  receiptScanModal: {
    width: '90%',
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
  },
  receiptScanOptions: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 20,
    marginBottom: 24,
  },
  receiptScanOption: {
    flex: 1,
    backgroundColor: '#f8fafc',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#e2e8f0',
  },
  receiptScanOptionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
    marginTop: 8,
  },
  receiptScanOptionDesc: {
    fontSize: 12,
    color: '#6b7280',
    textAlign: 'center',
    marginTop: 4,
  },
  receiptScanCancel: {
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  receiptScanCancelText: {
    color: '#6b7280',
    fontSize: 16,
    fontWeight: '600',
  },
  addCategoryCard: {
    borderWidth: 2,
    borderColor: '#E5E7EB',
    borderStyle: 'dashed',
    backgroundColor: '#F9FAFB',
  },
  createCategoryModal: {
    width: '90%',
    maxHeight: '80%',
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 24,
  },
  createCategoryForm: {
    marginTop: 20,
    marginBottom: 24,
  },
  formLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 8,
    marginTop: 16,
  },
  categoryNameInput: {
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: '#1F2937',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  iconGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  iconOption: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#F9FAFB',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#E5E7EB',
  },
  iconOptionSelected: {
    borderColor: '#3B82F6',
    backgroundColor: '#EFF6FF',
  },
  iconText: {
    fontSize: 20,
  },
  colorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  colorOption: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 3,
    borderColor: 'transparent',
  },
  colorOptionSelected: {
    borderColor: '#1F2937',
  },
  createCategoryActions: {
    flexDirection: 'row',
    gap: 12,
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