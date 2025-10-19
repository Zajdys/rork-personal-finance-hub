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
  Scan,
  Plus,
  Building2,
} from 'lucide-react-native';
import { useFinanceStore, CustomCategory } from '@/store/finance-store';
import { useBuddyStore } from '@/store/buddy-store';
import { useLanguageStore } from '@/store/language-store';
import { router } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { parseBankCsvToTransactions, readUriText, ParsedTxn, parseBankXlsxToTransactions, readUriArrayBuffer } from '../../src/services/bank/importBankCsv';
import { generateObject } from '@rork/toolkit-sdk';
import { Platform } from 'react-native';
import { z } from 'zod';

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
  const [invoiceScanOpen, setInvoiceScanOpen] = useState<boolean>(false);
  const [scanningInvoice, setScanningInvoice] = useState<boolean>(false);
  const [createCategoryOpen, setCreateCategoryOpen] = useState<boolean>(false);
  const [newCategoryName, setNewCategoryName] = useState<string>('');
  const [newCategoryIcon, setNewCategoryIcon] = useState<string>('📦');
  const [newCategoryColor, setNewCategoryColor] = useState<string>('#6B7280');
  
  const { addTransaction, getAllCategories, addCustomCategory } = useFinanceStore();
  const { addPoints, showBuddyMessage } = useBuddyStore();
  const { t } = useLanguageStore();

  const categoryData = getAllCategories(type);
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
        type: ['text/*', 'application/pdf', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/csv', 'text/comma-separated-values'],
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
      const isXlsx = (mime?.includes('spreadsheet') || mime?.includes('excel') || /\.(xlsx?)$/i.test(name));

      if (isPdf) {
        console.log('Selected PDF bank statement:', { name, mime, uri: asset.uri });
        try {
          console.log('Processing PDF with AI...');
          
          let base64Data: string;
          try {
            const response = await fetch(asset.uri);
            if (!response.ok) {
              throw new Error(`Nepodařilo se načíst soubor: ${response.status}`);
            }
            const blob = await response.blob();
            
            base64Data = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onloadend = () => {
                const result = reader.result as string;
                if (!result) {
                  reject(new Error('Soubor je prázdný'));
                  return;
                }
                const base64 = result.split(',')[1];
                if (!base64) {
                  reject(new Error('Nepodařilo se převést soubor'));
                  return;
                }
                resolve(base64);
              };
              reader.onerror = () => reject(new Error('Chyba při čtení souboru'));
              reader.readAsDataURL(blob);
            });
          } catch (fetchError) {
            console.error('File fetch error:', fetchError);
            throw new Error('Nepodařilo se načíst PDF soubor. Zkuste prosím jiný soubor.');
          }
          
          console.log('PDF converted to base64, length:', base64Data.length);
          
          if (base64Data.length < 100) {
            throw new Error('PDF soubor je příliš malý nebo prázdný');
          }
          
          const schema = z.object({
            transactions: z.array(
              z.object({
                date: z.string().describe('Datum transakce ve formátu DD.MM.YYYY nebo YYYY-MM-DD'),
                description: z.string().describe('Popis transakce - co bylo koupeno/zaplaceno'),
                amount: z.number().describe('Částka v číselném formátu. Záporná pro výdaje, kladná pro příjmy'),
                category: z.string().optional().describe('Kategorie transakce'),
              })
            ),
          });

          type BankStatementResult = z.infer<typeof schema>;
          let result: BankStatementResult;
          try {
            console.log('Calling AI with image size:', base64Data.length);
            
            result = await Promise.race<BankStatementResult>([
              generateObject({
                messages: [
                  {
                    role: 'user',
                    content: [
                      {
                        type: 'text',
                        text: 'Analyzuj tento bankovní výpis a vrať VŠECHNY transakce. DŮLEŽITÉ PRAVIDLA:\n\n1. Přečti VŠECHNY transakce z výpisu, i když jich je hodně (20+, 50+, 100+)\n2. Pro každou transakci zjisti: datum, popis, částku\n3. Částka: Pokud je to výdaj/platba/debet, musí být ZÁPORNÉ číslo (-). Pokud je to příjem/kredit, musí být KLADNÉ číslo (+).\n4. Popis: Zahrň důležité informace (název obchodu, účel platby, název protiúčtu)\n5. Pokud vidíš měnu, převeď na CZK pokud je to možné, jinak použij původní částku\n6. Ignoruj mezisoučty typu "Celkem za měsíc" - zajímají nás jen jednotlivé transakce\n7. Kategorizuj transakce podle popisu do správné kategorie\n\nKategorie:\n- Jídlo a nápoje: supermarkety (Lidl, Albert, Tesco), restaurace, kavárny, fast food\n- Nájem a bydlení: nájem, hypotéka, energie (ČEZ, PRE), voda, plyn, internet, telefon\n- Oblečení: oděvy, boty, módní značky (Zara, H&M)\n- Doprava: benzín, čerpací stanice, MHD, PID, taxi, Uber, Bolt\n- Zábava: Netflix, Spotify, HBO, hry, kino, divadlo, koncerty\n- Zdraví: lékárna, lékaři, poliklinika, fitness, wellness\n- Vzdělání: škola, kurzy, knihy, studijní materiály\n- Nákupy: elektronika, nábytek, online nákupy (Alza, Mall.cz)\n- Služby: pojištění, předplatné, opravy, účetní, advokát\n- Ostatní: vše ostatní\n\nPŘÍKLAD:\nPokud vidíš: "Platba kartou LIDL 23.12.2024 -450,50 Kč"\nVrať: {date: "23.12.2024", description: "LIDL", amount: -450.50, category: "Jídlo a nápoje"}\n\nPokud vidíš: "Příchozí platba MZDA 30.12.2024 +35000 Kč"\nVrať: {date: "30.12.2024", description: "MZDA", amount: 35000, category: "Mzda"}',
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
            
            console.log('AI call successful');
          } catch (aiError) {
            console.error('AI API error:', aiError);
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
                throw new Error('Nepodařilo se spojit s AI službou. Zkontrolujte připojení k internetu a zkuste to znovu.\n\nPro zpracování bankovních výpisů zkuste:\n• CSV formát (.csv)\n• Excel formát (.xlsx)');
              } else if (errorMsg.includes('timeout')) {
                throw new Error('AI zpracování trvalo příliš dlouho. Zkuste prosím menší soubor nebo CSV/XLSX formát.');
              } else if (errorMsg.includes('not configured') || errorMsg.includes('undefined')) {
                throw new Error('AI služba není správně nakonfigurována. Použijte prosím CSV nebo XLSX formát pro import.');
              } else {
                throw new Error(`AI chyba: ${aiError.message}\n\nZkuste prosím CSV nebo XLSX formát.`);
              }
            }
            throw new Error('Nepodařilo se zpracovat PDF pomocí AI. Zkuste prosím CSV nebo XLSX formát.');
          }

          console.log('AI parsed', result.transactions.length, 'transactions from bank statement');

          if (!result.transactions || result.transactions.length === 0) {
            setImportError('AI nenašlo žádné transakce v PDF výpisu. Zkuste prosím CSV nebo XLSX formát.');
            setImporting(false);
            return;
          }

          const parsedFromPdf: ParsedTxn[] = result.transactions.map((txn: { date: string; description: string; amount: number; category?: string }) => {
            const dateStr = txn.date;
            let date = new Date();
            
            const dateMatch = dateStr.match(/(\d{1,2})[\.\/-](\d{1,2})[\.\/-](\d{2,4})/);
            if (dateMatch) {
              const d = parseInt(dateMatch[1], 10);
              const m = parseInt(dateMatch[2], 10) - 1;
              const y = parseInt(dateMatch[3].length === 2 ? (Number(dateMatch[3]) + 2000).toString() : dateMatch[3], 10);
              date = new Date(y, m, d);
            } else {
              const isoDate = Date.parse(dateStr);
              if (!isNaN(isoDate)) {
                date = new Date(isoDate);
              }
            }
            
            const amount = Math.abs(txn.amount);
            const type: 'income' | 'expense' = txn.amount < 0 ? 'expense' : 'income';
            
            let category = txn.category || 'Ostatní';
            const categoryLower = category.toLowerCase();
            
            if (type === 'expense') {
              if (categoryLower.includes('jídl') || categoryLower.includes('nápoj') || categoryLower.includes('food')) category = 'Jídlo a nápoje';
              else if (categoryLower.includes('nájem') || categoryLower.includes('bydlen') || categoryLower.includes('rent')) category = 'Nájem a bydlení';
              else if (categoryLower.includes('oblečen') || categoryLower.includes('clothing')) category = 'Oblečení';
              else if (categoryLower.includes('doprav') || categoryLower.includes('transport')) category = 'Doprava';
              else if (categoryLower.includes('zábav') || categoryLower.includes('entertainment')) category = 'Zábava';
              else if (categoryLower.includes('zdrav') || categoryLower.includes('health')) category = 'Zdraví';
              else if (categoryLower.includes('vzdělán') || categoryLower.includes('education')) category = 'Vzdělání';
              else if (categoryLower.includes('nákup') || categoryLower.includes('shopping')) category = 'Nákupy';
              else if (categoryLower.includes('služb') || categoryLower.includes('service')) category = 'Služby';
              else category = 'Ostatní';
            } else {
              if (categoryLower.includes('mzd') || categoryLower.includes('salary') || categoryLower.includes('výplat')) category = 'Mzda';
              else if (categoryLower.includes('freelance')) category = 'Freelance';
              else if (categoryLower.includes('investic') || categoryLower.includes('dividend')) category = 'Investice';
              else if (categoryLower.includes('dar') || categoryLower.includes('gift')) category = 'Dary';
              else category = 'Ostatní';
            }
            
            return {
              type,
              amount,
              title: txn.description,
              category,
              date,
            };
          });

          setPreview(parsedFromPdf);
          setPreviewOpen(true);
          setImportError(null);
          
        } catch (err) {
          console.error('PDF AI parse error', err);
          setImportError(`Nepodařilo se zpracovat PDF výpis pomocí AI: ${err instanceof Error ? err.message : 'Neznámá chyba'}. Zkuste prosím CSV nebo XLSX formát.`);
        }
        setImporting(false);
        return;
      }

      if (isXlsx) {
        console.log('Selected XLS/XLSX bank statement:', { name, mime });
        try {
          const buf = await readUriArrayBuffer(asset.uri);
          const parsedFromXlsx = await parseBankXlsxToTransactions(buf);
          console.log('XLSX parsed count:', parsedFromXlsx.length);
          if (!parsedFromXlsx.length) {
            setImportError('Excel soubor se načetl, ale nenašli jsme transakce. Zkuste CSV.');
          } else {
            setPreview(parsedFromXlsx);
            setPreviewOpen(true);
          }
        } catch (err) {
          console.error('XLSX parse error', err);
          setImportError('Nepodařilo se přečíst Excel výpis. Zkuste prosím CSV.');
        }
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

  const scanInvoiceWithCamera = useCallback(async () => {
    setInvoiceScanOpen(true);
  }, []);

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
            Alert.alert('Chyba', 'Soubor faktury je prázdný.');
            setScanningInvoice(false);
            return;
          }
          
          const base64Data = result.split(',')[1];
          if (!base64Data) {
            Alert.alert('Chyba', 'Nepodařilo se převést fakturu.');
            setScanningInvoice(false);
            return;
          }
          
          console.log('Base64 data length:', base64Data.length);
          
          if (base64Data.length < 100) {
            Alert.alert('Chyba', 'Obrázek faktury je příliš malý nebo prázdný.');
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
                  'Chyba připojení', 
                  'Nepodařilo se spojit s AI službou. Zkontrolujte připojení k internetu a zkuste to znovu.\n\nMůžete také nahrát jinou fakturu nebo zadat transakci ručně.'
                );
              } else if (errorMsg.includes('timeout')) {
                Alert.alert(
                  'Timeout', 
                  'AI zpracování trvalo příliš dlouho. Zkuste prosím:\n• Menší soubor\n• Jinou fakturu\n• Zadejte transakci ručně'
                );
              } else if (errorMsg.includes('not configured') || errorMsg.includes('undefined')) {
                Alert.alert(
                  'Služba nedostupná', 
                  'AI služba pro zpracování faktur není správně nakonfigurována. Zadejte prosím transakci ručně.'
                );
              } else {
                Alert.alert(
                  'Chyba', 
                  `Nepodařilo se zpracovat fakturu: ${aiError.message}\n\nZadejte prosím transakci ručně.`
                );
              }
            } else {
              Alert.alert(
                'Chyba', 
                'Nepodařilo se zpracovat fakturu. Zkuste prosím jinou fakturu nebo zadejte transakci ručně.'
              );
            }
            setScanningInvoice(false);
            return;
          }

          const invoiceItems = invoiceResult.items || [];
          console.log('Parsed invoice items:', invoiceItems);
          
          if (invoiceItems.length === 0) {
            Alert.alert('Chyba', 'Na faktuře nebyly nalezeny žádné položky. Zkuste prosím jinou fakturu nebo zadejte transakci ručně.');
            setScanningInvoice(false);
            return;
          }
          
          const invoiceTransactions: ParsedTxn[] = invoiceItems.map((item: any, index: number) => ({
            type: 'expense' as const,
            amount: parseFloat(item.amount) || 0,
            title: item.title || `Položka ${index + 1}`,
            category: item.category || 'Ostatní',
            date: new Date(),
          }));
          
          console.log('Invoice transactions created:', invoiceTransactions.length);
          setPreview(invoiceTransactions);
          setPreviewOpen(true);
          setScanningInvoice(false);
          
          addPoints(3);
          showBuddyMessage('Faktura byla úspěšně zpracována! Zkontrolujte položky a potvrďte.');
          
        } catch (error) {
          console.error('Invoice processing error:', error);
          Alert.alert('Chyba', 'Nepodařilo se zpracovat fakturu. Zkuste prosím jinou fakturu nebo zadejte transakci ručně. Chyba: ' + (error instanceof Error ? error.message : 'Neznámá chyba'));
          setScanningInvoice(false);
        }
      };
      
      reader.readAsDataURL(blob);
      
    } catch (error) {
      console.error('Invoice file processing error:', error);
      Alert.alert('Chyba', 'Nepodařilo se načíst soubor faktury.');
      setScanningInvoice(false);
    }
  }, [addPoints, showBuddyMessage]);

  const uploadInvoicePDF = useCallback(async () => {
    try {
      setScanningInvoice(true);
      const res = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/*'],
        multiple: false,
        copyToCacheDirectory: true,
      });
      
      if (res.canceled) {
        setScanningInvoice(false);
        return;
      }
      
      const asset = res.assets?.[0];
      if (!asset?.uri) {
        Alert.alert(t('errorMessage'), t('fileLoadError'));
        setScanningInvoice(false);
        return;
      }
      
      await processInvoiceFile(asset.uri);
    } catch (error) {
      console.error('Invoice upload error:', error);
      Alert.alert(t('errorMessage'), 'Nepodařilo se nahrát fakturu. Zkuste to prosím znovu.');
    } finally {
      setScanningInvoice(false);
    }
  }, [t, processInvoiceFile]);

  const requestCameraPermission = useCallback(async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    return status === 'granted';
  }, []);

  const takePicture = useCallback(async () => {
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

  const selectFromGallery = useCallback(async () => {
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
      Alert.alert(t('errorMessage'), 'Zadejte název kategorie');
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
    showBuddyMessage('Nová kategorie byla vytvořena! 🎉');
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
    
        const isSelected = selectedCategory === category.id;
        
        return (
          <TouchableOpacity
            key={category.id}
            testID={`category-${category.id}`}
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected }}
            style={[
              styles.categoryCard,
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
        style={[styles.categoryCard, styles.addCategoryCard]}
        onPress={() => setCreateCategoryOpen(true)}
      >
        <View style={[styles.categoryIcon, { backgroundColor: '#F3F4F6' }]}>
          <Plus color="#6B7280" size={24} />
        </View>
        <Text style={[styles.categoryText, { color: '#6B7280' }]}>
          Nová kategorie
        </Text>
      </TouchableOpacity>
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

        <View style={styles.importSection}>
          <TouchableOpacity
            style={styles.bankConnectButton}
            onPress={() => router.push('/bank-connect')}
          >
            <LinearGradient colors={["#10b981", "#059669"]} style={styles.importGradient}>
              <Building2 color="#fff" size={20} />
              <Text style={styles.importText}>Propojit s bankou</Text>
            </LinearGradient>
          </TouchableOpacity>
          
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
                <>
                  <FileText color="#fff" size={20} />
                  <Text style={styles.importText}>Import z bankovního výpisu</Text>
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>
          
          <View style={styles.receiptButtons}>
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
                    <Text style={styles.receiptButtonText}>Vyfotit fakturu</Text>
                  </>
                )}
              </LinearGradient>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[styles.receiptButton, styles.receiptButtonUpload]}
              onPress={uploadInvoicePDF}
              disabled={scanningInvoice}
            >
              <LinearGradient colors={["#8b5cf6", "#7c3aed"]} style={styles.receiptGradient}>
                {scanningInvoice ? (
                  <ActivityIndicator color="#fff" size={16} />
                ) : (
                  <>
                    <Scan color="#fff" size={16} />
                    <Text style={styles.receiptButtonText}>Nahrát fakturu</Text>
                  </>
                )}
              </LinearGradient>
            </TouchableOpacity>
          </View>
          
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

      <Modal visible={invoiceScanOpen} transparent animationType="slide" onRequestClose={() => setInvoiceScanOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.receiptScanModal}>
            <Text style={styles.modalTitle}>Nahrát fakturu</Text>
            <Text style={styles.modalSubtitle}>Vyberte způsob nahrání faktury</Text>
            
            <View style={styles.receiptScanOptions}>
              <TouchableOpacity style={styles.receiptScanOption} onPress={takePicture}>
                <Camera color="#10b981" size={32} />
                <Text style={styles.receiptScanOptionTitle}>Vyfotit</Text>
                <Text style={styles.receiptScanOptionDesc}>Pořídit novou fotku</Text>
              </TouchableOpacity>
              
              <TouchableOpacity style={styles.receiptScanOption} onPress={selectFromGallery}>
                <FileText color="#8b5cf6" size={32} />
                <Text style={styles.receiptScanOptionTitle}>Z galerie</Text>
                <Text style={styles.receiptScanOptionDesc}>Vybrat existující foto</Text>
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
            <Text style={styles.modalTitle}>Náhled importu</Text>
            <Text style={styles.modalSubtitle}>Počet načtených transakcí: {preview.length}</Text>
            <ScrollView style={styles.previewList} contentContainerStyle={{ paddingBottom: 12 }}>
              {preview.slice(0, 50).map((p, idx) => (
                <View key={`${p.title}-${idx}`} style={styles.previewItem} testID={`preview-item-${idx}`}>
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

      <Modal visible={createCategoryOpen} transparent animationType="slide" onRequestClose={() => setCreateCategoryOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.createCategoryModal}>
            <Text style={styles.modalTitle}>Vytvořit novou kategorii</Text>
            
            <View style={styles.createCategoryForm}>
              <Text style={styles.formLabel}>Název kategorie</Text>
              <TextInput
                style={styles.categoryNameInput}
                value={newCategoryName}
                onChangeText={setNewCategoryName}
                placeholder="Zadejte název kategorie"
                placeholderTextColor="#9CA3AF"
              />
              
              <Text style={styles.formLabel}>Ikona</Text>
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
              
              <Text style={styles.formLabel}>Barva</Text>
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
                <Text style={styles.modalButtonText}>Zrušit</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.modalButton, styles.modalConfirm]} 
                onPress={handleCreateCategory}
              >
                <Text style={[styles.modalButtonText, { color: '#fff' }]}>Vytvořit</Text>
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
  importSection: {
    marginTop: 16,
    marginBottom: 8,
    gap: 12,
  },
  bankConnectButton: {
    borderRadius: 16,
    overflow: 'hidden',
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