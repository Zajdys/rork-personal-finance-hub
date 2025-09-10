import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type Language = 'cs' | 'en';

export interface LanguageInfo {
  code: Language;
  name: string;
  flag: string;
}

export const LANGUAGES: Record<Language, LanguageInfo> = {
  cs: { code: 'cs', name: 'Čeština', flag: '🇨🇿' },
  en: { code: 'en', name: 'English', flag: '🇺🇸' },
};

// Translation keys and their values for each language
export const TRANSLATIONS = {
  cs: {
    // Tab names
    overview: 'Přehled',
    add: 'Přidat',
    learn: 'Učit se',
    investments: 'Investice',
    profile: 'Profil',
    moneyBuddy: 'MoneyBuddy',
    chat: 'Chat',
    
    // Common
    save: 'Uložit',
    cancel: 'Zrušit',
    delete: 'Smazat',
    edit: 'Upravit',
    back: 'Zpět',
    next: 'Další',
    previous: 'Předchozí',
    loading: 'Načítání...',
    error: 'Chyba',
    success: 'Úspěch',
    confirm: 'Potvrdit',
    close: 'Zavřít',
    
    // Overview screen
    totalBalance: 'Celkový zůstatek',
    monthlyIncome: 'Měsíční příjem',
    monthlyExpenses: 'Měsíční výdaje',
    savings: 'Úspory',
    quickActions: 'Rychlé akce',
    addIncome: 'Přidat příjem',
    addExpense: 'Přidat výdaj',
    viewReports: 'Zobrazit reporty',
    recentTransactions: 'Nedávné transakce',
    viewAll: 'Zobrazit vše',
    
    // Add screen
    addTransaction: 'Přidat transakci',
    income: 'Příjem',
    expense: 'Výdaj',
    amount: 'Částka',
    description: 'Popis',
    category: 'Kategorie',
    date: 'Datum',
    selectCategory: 'Vybrat kategorii',
    enterAmount: 'Zadejte částku',
    enterDescription: 'Zadejte popis',
    
    // Categories
    food: 'Jídlo',
    transport: 'Doprava',
    housing: 'Bydlení',
    entertainment: 'Zábava',
    healthcare: 'Zdravotnictví',
    shopping: 'Nákupy',
    education: 'Vzdělání',
    other: 'Ostatní',
    salary: 'Plat',
    freelance: 'Freelance',
    investment: 'Investice',
    gift: 'Dárek',
    
    // Learn screen
    financialEducation: 'Finanční vzdělání',
    lessons: 'Lekce',
    quizzes: 'Kvízy',
    progress: 'Pokrok',
    completedLessons: 'Dokončené lekce',
    availableLessons: 'Dostupné lekce',
    startLesson: 'Začít lekci',
    takeQuiz: 'Absolvovat kvíz',
    
    // Lesson titles
    whatIsInflation: 'Co je inflace?',
    compoundInterest: 'Složené úročení',
    stocksVsEtfs: 'Akcie vs ETF',
    riskManagement: 'Řízení rizik',
    diversification: 'Diverzifikace',
    
    // Investment screen
    importPortfolio: 'Importovat portfolio',
    portfolio: 'Portfolio',
    totalValue: 'Celková hodnota',
    todayChange: 'Dnešní změna',
    addTrade: 'Přidat obchod',
    buy: 'Koupit',
    sell: 'Prodat',
    symbol: 'Symbol',
    shares: 'Akcie',
    price: 'Cena',
    analysis: 'Analýza',
    
    // Profile screen
    myProfile: 'Můj profil',
    financialGoals: 'Finanční cíle',
    monthlyReport: 'Měsíční report',
    general: 'Obecné',
    
    // Settings
    settings: 'Nastavení',
    language: 'Jazyk',
    currency: 'Měna',
    theme: 'Téma',
    notifications: 'Oznámení',
    privacy: 'Soukromí',
    help: 'Nápověda a podpora',
    
    // Theme settings
    lightMode: 'Světlý režim',
    darkMode: 'Tmavý režim',
    systemDefault: 'Podle systému',
    
    // Currency settings
    currencySettings: 'Nastavení měny',
    selectCurrency: 'Vyber si preferovanou měnu',
    wholeApp: 'Celá aplikace',
    investmentsOnly: 'Pouze investice',
    czechCrown: 'Česká koruna (CZK)',
    euro: 'Euro (EUR)',
    usDollar: 'Americký dolar (USD)',
    
    // Language settings
    languageSettings: 'Jazyk aplikace',
    selectLanguage: 'Vyber si preferovaný jazyk',
    current: 'Aktuální',
    
    // Financial goals
    setGoals: 'Nastavit cíle',
    savingGoal: 'Cíl spoření',
    spendingLimit: 'Limit výdajů',
    emergencyFund: 'Nouzový fond',
    investmentTarget: 'Investiční cíl',
    
    // MoneyBuddy Chat
    askMoneyBuddy: 'Zeptej se MoneyBuddy',
    typeMessage: 'Napište zprávu...',
    send: 'Odeslat',
    
    // Notifications
    budgetAlert: 'Upozornění na rozpočet',
    goalReminder: 'Připomínka cílů',
    investmentUpdate: 'Aktualizace investic',
    
    // Reports
    monthlyOverview: 'Měsíční přehled',
    expenseBreakdown: 'Rozložení výdajů',
    incomeAnalysis: 'Analýza příjmů',
    savingsProgress: 'Pokrok v spoření',
    
    // Additional Czech translations
    hello: 'Ahoj',
    dailyTip: 'Tip dne',
    financialOverview: 'Přehled financí',
    transactions: 'Transakce',
    totalRecorded: 'celkem zaznamenáno',
    completed: 'dokončeno',
    financialRecommendations: 'Finanční doporučení',
    invest: 'Investuj',
    monthlyIncomePercent: '% z příjmů měsíčně',
    emergencyFundReserve: 'Rezerva',
    achievements: 'Úspěchy',
    user: 'uživatel',
    points: 'bodů',
    progressTo: 'Pokrok k',
    pointsLeft: 'bodů zbývá',
    privacySecurity: 'Soukromí a bezpečnost',
    protectData: 'Ochrana tvých dat',
    generalSettings: 'Obecné nastavení',
    additionalOptions: 'Další možnosti',
    faqContact: 'FAQ a kontakt',
    noTransactionsYet: 'Zatím žádné transakce',
    startAddingTransactions: 'Začni přidáváním svých příjmů a výdajů',
    recordTransactions: 'Zaznamenej své příjmy a výdaje',
    exampleSalary: 'Např. Výplata',
    exampleShopping: 'Např. Nákup v obchodě',
    errorMessage: 'Chyba',
    fillAllFields: 'Vyplň všechna pole',
    enterValidAmount: 'Zadej platnou částku',
    successMessage: 'Úspěch',
    transactionAdded: 'Transakce byla přidána!',
    addedIncome: 'Super! Přidal jsi příjem',
    dontForgetInvest: 'Nezapomeň část investovat! 💰',
    recordedExpense: 'Zaznamenal jsem výdaj',
    watchBudget: 'Hlídej si rozpočet! 📊',
    more: 'Více',
    less: 'Méně',
    
    // Investments screen
    yourPortfolioAndRecommendations: 'Tvé portfolio a doporučení',
    totalPortfolioValue: 'Celková hodnota portfolia',
    addInvestment: 'Přidat investici',
    recommendations: 'Doporučení',
    trades: 'Obchody',
    noInvestments: 'Žádné investice',
    addFirstInvestment: 'Přidej své první investice pomocí tlačítka "Přidat investici" nebo si vyberte z doporučených',
    showRecommended: 'Zobrazit doporučené',
    noTrades: 'Žádné obchody',
    addFirstTrade: 'Přidej svůj první nákup nebo prodej pomocí tlačítka "Přidat investici"',
    allTrades: 'Všechny obchody',
    deleteAll: 'Smazat vše',
    investmentAlertsOff: 'Investiční upozornění vypnuta',
    enableInvestmentAlerts: 'Zapněte investiční upozornění v nastavení pro zobrazení doporučení a varování',
    newTrade: 'Nový obchod',
    recommendedInvestments: 'Doporučené investice',
    uploadBrokerStatement: 'Nahraj výpis z brokera nebo vyberte ukázku',
    purchase: 'Nákup',
    sale: 'Prodej',
    symbolExample: 'Symbol (např. AAPL, SPY)',
    name: 'Název',
    quantity: 'Množství',
    pricePerUnit: 'Cena za kus',
    totalAmount: 'Celková částka',
    addPurchase: 'Přidat nákup',
    addSale: 'Přidat prodej',
    portfolioAnalysis: 'Analýza portfolia',
    aiAnalysis: 'AI Analýza',
    annualReturn: 'XIRR (roční)',
    totalReturn: 'TWR (celkový)',
    invested: 'Investováno',
    recommendedAllocation: 'Doporučená alokace',
    usStocks: 'Akcie USA',
    europeStocks: 'Akcie Evropa',
    emergingMarkets: 'Emerging Markets',
    bonds: 'Dluhopisy',
    commodities: 'Komodity',
    selectFromPopular: 'Vyberte z populárních investic a rychle je přidejte do svého portfolia:',
    brokerStatement: 'Výpis z brokera',
    selectFile: 'Vybrat soubor',
    processStatement: 'Zpracovat výpis',
    processing: 'Zpracovávám...',
    supportedBrokers: 'Podporované brokery:',
    expectedData: 'Očekávaná data:',
    tradeDate: 'Datum obchodu',
    type: 'Typ',
    stockSymbol: 'Symbol akcie/ETF',
    selectCurrencyForInvestments: 'Vybrat měnu',
    selectCurrencyDescription: 'Vyberte měnu pro zobrazení investic. Částky budou přepočítány podle aktuálních kurzů.',
    deleteTrade: 'Smazat obchod',
    confirmDeleteTrade: 'Opravdu chceš smazat',
    confirmDeleteAllTrades: 'Opravdu chceš smazat všechny obchody? Tato akce je nevratná.',
    importComplete: 'Import dokončen!',
    statementProcessed: 'Výpis byl úspěšně zpracován.',
    added: 'Přidáno',
    purchases: 'Nákupy',
    sales: 'Prodeje',
    totalValueAmount: 'Celková hodnota',
    diversifyMore: 'Diverzifikuj více',
    tooMuchInSP500: 'Máš příliš mnoho v S&P 500. Zvaž přidání emerging markets.',
    rebalancing: 'Rebalancování',
    portfolioDeviated: 'Tvé portfolio se odchýlilo od cílové alokace o více než 5%.',
    dollarCostAveraging: 'Dollar Cost Averaging',
    investRegularly: 'Pravidelně investuj každý měsíc stejnou částku.',
    broadUSIndex: 'Široký americký akciový index',
    cryptocurrency: 'Kryptoměna',
    europeanStockMarket: 'Evropský akciový trh',
    goldInvestment: 'Investice do zlata',
    techCompany: 'Technologická společnost',
    softwareCompany: 'Softwarová společnost',
    ofPortfolio: 'portfolia',
    pieces: 'ks',
    day: 'Den',
    week: 'Týden',
    month: 'Měsíc',
    year: 'Rok',
    all: 'Vše',
    
    // Achievements
    firstSteps: 'První kroky',
    firstStepsDesc: 'Přidal jsi svou první transakci',
    financeStudent: 'Student financí',
    financeStudentDesc: 'Dokončil jsi 5 lekcí',
    investor: 'Investor',
    investorDesc: 'Přidal jsi své první investice',
    consistent: 'Konzistentní',
    consistentDesc: 'Používáš appku 30 dní v řadě',
    
    // Daily Tips
    dailyTip1: 'Utrať dnes o 50 Kč míň = 18 250 Kč ročně 💡',
    dailyTip2: 'ETF není magie. Je to balíček akcií. A díky tomu máš menší riziko 📦',
    dailyTip3: 'Inflace je jako zloděj - krade hodnotu tvých peněz každý den 🦹‍♂️',
    dailyTip4: 'Složený úrok je nejsilnější síla ve vesmíru - Albert Einstein 🚀',
    dailyTip5: 'Nejlepší čas na investování byl před 20 lety. Druhý nejlepší je dnes 📈',
    
    // Receipt scanning
    scanReceipt: 'Naskenovat účtenku',
    photoReceipt: 'Vyfotit účtenku',
    uploadReceipt: 'Nahrát účtenku',
    selectScanMethod: 'Vyberte způsob skenování účtenky',
    takePhoto: 'Vyfotit',
    takeNewPhoto: 'Pořídit novou fotku',
    selectFromGallery: 'Vybrat z galerie',
    useExistingPhoto: 'Použít existující foto',
    receiptProcessed: 'Účtenka byla úspěšně naskenována a roztříděna. Zkontroluj položky a potvrď import.',
    noItemsFound: 'Na účtence se nepodařilo najít žádné položky',
    receiptProcessingError: 'Nepodařilo se zpracovat účtenku. Zkuste to znovu.',
    cameraPermissionNeeded: 'Potřebujeme oprávnění k fotoaparátu pro skenování účtenek',
    galleryPermissionNeeded: 'Potřebujeme oprávnění k galerii pro výběr obrázků',
    fileLoadError: 'Soubor se nepodařilo načíst',
    receiptUploadError: 'Chyba při nahrávání účtenky',
    fileProcessingError: 'Nepodařilo se zpracovat soubor',
    cameraError: 'Nepodařilo se pořídit fotku',
    galleryError: 'Nepodařilo se vybrat obrázek',
  },
  en: {
    // Tab names
    overview: 'Overview',
    add: 'Add',
    learn: 'Learn',
    investments: 'Investments',
    profile: 'Profile',
    moneyBuddy: 'MoneyBuddy',
    chat: 'Chat',
    
    // Common
    save: 'Save',
    cancel: 'Cancel',
    delete: 'Delete',
    edit: 'Edit',
    back: 'Back',
    next: 'Next',
    previous: 'Previous',
    loading: 'Loading...',
    error: 'Error',
    success: 'Success',
    confirm: 'Confirm',
    close: 'Close',
    
    // Overview screen
    totalBalance: 'Total Balance',
    monthlyIncome: 'Monthly Income',
    monthlyExpenses: 'Monthly Expenses',
    savings: 'Savings',
    quickActions: 'Quick Actions',
    addIncome: 'Add Income',
    addExpense: 'Add Expense',
    viewReports: 'View Reports',
    recentTransactions: 'Recent Transactions',
    viewAll: 'View All',
    
    // Add screen
    addTransaction: 'Add Transaction',
    income: 'Income',
    expense: 'Expense',
    amount: 'Amount',
    description: 'Description',
    category: 'Category',
    date: 'Date',
    selectCategory: 'Select Category',
    enterAmount: 'Enter amount',
    enterDescription: 'Enter description',
    
    // Categories
    food: 'Food',
    transport: 'Transport',
    housing: 'Housing',
    entertainment: 'Entertainment',
    healthcare: 'Healthcare',
    shopping: 'Shopping',
    education: 'Education',
    other: 'Other',
    salary: 'Salary',
    freelance: 'Freelance',
    investment: 'Investment',
    gift: 'Gift',
    
    // Learn screen
    financialEducation: 'Financial Education',
    lessons: 'Lessons',
    quizzes: 'Quizzes',
    progress: 'Progress',
    completedLessons: 'Completed Lessons',
    availableLessons: 'Available Lessons',
    startLesson: 'Start Lesson',
    takeQuiz: 'Take Quiz',
    
    // Lesson titles
    whatIsInflation: 'What is Inflation?',
    compoundInterest: 'Compound Interest',
    stocksVsEtfs: 'Stocks vs ETFs',
    riskManagement: 'Risk Management',
    diversification: 'Diversification',
    
    // Investment screen
    importPortfolio: 'Import Portfolio',
    portfolio: 'Portfolio',
    totalValue: 'Total Value',
    todayChange: 'Today\'s Change',
    addTrade: 'Add Trade',
    buy: 'Buy',
    sell: 'Sell',
    symbol: 'Symbol',
    shares: 'Shares',
    price: 'Price',
    analysis: 'Analysis',
    
    // Profile screen
    myProfile: 'My Profile',
    financialGoals: 'Financial Goals',
    monthlyReport: 'Monthly Report',
    general: 'General',
    
    // Settings
    settings: 'Settings',
    language: 'Language',
    currency: 'Currency',
    theme: 'Theme',
    notifications: 'Notifications',
    privacy: 'Privacy',
    help: 'Help & Support',
    
    // Theme settings
    lightMode: 'Light Mode',
    darkMode: 'Dark Mode',
    systemDefault: 'System Default',
    
    // Currency settings
    currencySettings: 'Currency Settings',
    selectCurrency: 'Select your preferred currency',
    wholeApp: 'Whole App',
    investmentsOnly: 'Investments Only',
    czechCrown: 'Czech Crown (CZK)',
    euro: 'Euro (EUR)',
    usDollar: 'US Dollar (USD)',
    
    // Language settings
    languageSettings: 'App Language',
    selectLanguage: 'Select your preferred language',
    current: 'Current',
    
    // Financial goals
    setGoals: 'Set Goals',
    savingGoal: 'Saving Goal',
    spendingLimit: 'Spending Limit',
    emergencyFund: 'Emergency Fund',
    investmentTarget: 'Investment Target',
    
    // MoneyBuddy Chat
    askMoneyBuddy: 'Ask MoneyBuddy',
    typeMessage: 'Type a message...',
    send: 'Send',
    
    // Notifications
    budgetAlert: 'Budget Alert',
    goalReminder: 'Goal Reminder',
    investmentUpdate: 'Investment Update',
    
    // Reports
    monthlyOverview: 'Monthly Overview',
    expenseBreakdown: 'Expense Breakdown',
    incomeAnalysis: 'Income Analysis',
    savingsProgress: 'Savings Progress',
    
    // Additional English translations
    hello: 'Hello',
    dailyTip: 'Daily Tip',
    financialOverview: 'Financial Overview',
    transactions: 'Transactions',
    totalRecorded: 'total recorded',
    completed: 'completed',
    financialRecommendations: 'Financial Recommendations',
    invest: 'Invest',
    monthlyIncomePercent: '% of monthly income',
    emergencyFundReserve: 'Emergency Fund',
    achievements: 'Achievements',
    user: 'user',
    points: 'points',
    progressTo: 'Progress to',
    pointsLeft: 'points left',
    privacySecurity: 'Privacy & Security',
    protectData: 'Protect your data',
    generalSettings: 'General Settings',
    additionalOptions: 'Additional options',
    faqContact: 'FAQ and contact',
    noTransactionsYet: 'No transactions yet',
    startAddingTransactions: 'Start by adding your income and expenses',
    recordTransactions: 'Record your income and expenses',
    exampleSalary: 'e.g. Salary',
    exampleShopping: 'e.g. Shopping',
    errorMessage: 'Error',
    fillAllFields: 'Fill all fields',
    enterValidAmount: 'Enter valid amount',
    successMessage: 'Success',
    transactionAdded: 'Transaction added!',
    addedIncome: 'Great! You added income',
    dontForgetInvest: 'Don\'t forget to invest some! 💰',
    recordedExpense: 'Recorded expense',
    watchBudget: 'Watch your budget! 📊',
    more: 'More',
    less: 'Less',
    
    // Investments screen
    yourPortfolioAndRecommendations: 'Your portfolio and recommendations',
    totalPortfolioValue: 'Total Portfolio Value',
    addInvestment: 'Add Investment',
    recommendations: 'Recommendations',
    trades: 'Trades',
    noInvestments: 'No Investments',
    addFirstInvestment: 'Add your first investments using the "Add Investment" button or choose from recommended',
    showRecommended: 'Show Recommended',
    noTrades: 'No Trades',
    addFirstTrade: 'Add your first buy or sell using the "Add Investment" button',
    allTrades: 'All Trades',
    deleteAll: 'Delete All',
    investmentAlertsOff: 'Investment Alerts Off',
    enableInvestmentAlerts: 'Enable investment alerts in settings to see recommendations and warnings',
    newTrade: 'New Trade',
    recommendedInvestments: 'Recommended Investments',
    uploadBrokerStatement: 'Upload broker statement or select sample',
    purchase: 'Buy',
    sale: 'Sell',
    symbolExample: 'Symbol (e.g. AAPL, SPY)',
    name: 'Name',
    quantity: 'Quantity',
    pricePerUnit: 'Price per unit',
    totalAmount: 'Total Amount',
    addPurchase: 'Add Purchase',
    addSale: 'Add Sale',
    portfolioAnalysis: 'Portfolio Analysis',
    aiAnalysis: 'AI Analysis',
    annualReturn: 'XIRR (annual)',
    totalReturn: 'TWR (total)',
    invested: 'Invested',
    recommendedAllocation: 'Recommended Allocation',
    usStocks: 'US Stocks',
    europeStocks: 'Europe Stocks',
    emergingMarkets: 'Emerging Markets',
    bonds: 'Bonds',
    commodities: 'Commodities',
    selectFromPopular: 'Select from popular investments and quickly add them to your portfolio:',
    brokerStatement: 'Broker Statement',
    selectFile: 'Select File',
    processStatement: 'Process Statement',
    processing: 'Processing...',
    supportedBrokers: 'Supported Brokers:',
    expectedData: 'Expected Data:',
    tradeDate: 'Trade Date',
    type: 'Type',
    stockSymbol: 'Stock/ETF Symbol',
    selectCurrencyForInvestments: 'Select Currency',
    selectCurrencyDescription: 'Select currency for displaying investments. Amounts will be converted using current exchange rates.',
    deleteTrade: 'Delete Trade',
    confirmDeleteTrade: 'Do you really want to delete',
    confirmDeleteAllTrades: 'Do you really want to delete all trades? This action is irreversible.',
    importComplete: 'Import Complete!',
    statementProcessed: 'Statement was successfully processed.',
    added: 'Added',
    purchases: 'Purchases',
    sales: 'Sales',
    totalValueAmount: 'Total Value',
    diversifyMore: 'Diversify More',
    tooMuchInSP500: 'You have too much in S&P 500. Consider adding emerging markets.',
    rebalancing: 'Rebalancing',
    portfolioDeviated: 'Your portfolio has deviated from target allocation by more than 5%.',
    dollarCostAveraging: 'Dollar Cost Averaging',
    investRegularly: 'Invest the same amount regularly every month.',
    broadUSIndex: 'Broad US stock index',
    cryptocurrency: 'Cryptocurrency',
    europeanStockMarket: 'European stock market',
    goldInvestment: 'Gold investment',
    techCompany: 'Technology company',
    softwareCompany: 'Software company',
    ofPortfolio: 'of portfolio',
    pieces: 'pcs',
    day: 'Day',
    week: 'Week',
    month: 'Month',
    year: 'Year',
    all: 'All',
    
    // Achievements
    firstSteps: 'First Steps',
    firstStepsDesc: 'You added your first transaction',
    financeStudent: 'Finance Student',
    financeStudentDesc: 'You completed 5 lessons',
    investor: 'Investor',
    investorDesc: 'You added your first investments',
    consistent: 'Consistent',
    consistentDesc: 'Using the app for 30 days in a row',
    
    // Daily Tips
    dailyTip1: 'Spend 50 CZK less today = 18,250 CZK per year 💡',
    dailyTip2: 'ETF is not magic. It\'s a bundle of stocks. And thanks to that you have less risk 📦',
    dailyTip3: 'Inflation is like a thief - it steals the value of your money every day 🦹‍♂️',
    dailyTip4: 'Compound interest is the most powerful force in the universe - Albert Einstein 🚀',
    dailyTip5: 'The best time to invest was 20 years ago. The second best is today 📈',
    
    // Receipt scanning
    scanReceipt: 'Scan Receipt',
    photoReceipt: 'Photo Receipt',
    uploadReceipt: 'Upload Receipt',
    selectScanMethod: 'Select receipt scanning method',
    takePhoto: 'Take Photo',
    takeNewPhoto: 'Take new photo',
    selectFromGallery: 'Select from Gallery',
    useExistingPhoto: 'Use existing photo',
    receiptProcessed: 'Receipt was successfully scanned and categorized. Check items and confirm import.',
    noItemsFound: 'No items found on the receipt',
    receiptProcessingError: 'Failed to process receipt. Please try again.',
    cameraPermissionNeeded: 'We need camera permission to scan receipts',
    galleryPermissionNeeded: 'We need gallery permission to select images',
    fileLoadError: 'Failed to load file',
    receiptUploadError: 'Error uploading receipt',
    fileProcessingError: 'Failed to process file',
    cameraError: 'Failed to take photo',
    galleryError: 'Failed to select image',
  },

};

interface LanguageState {
  language: Language;
  isLoaded: boolean;
  updateCounter: number;
  setLanguage: (language: Language) => void;
  loadLanguage: () => Promise<void>;
  t: (key: keyof typeof TRANSLATIONS.cs) => string;
}

export const useLanguageStore = create<LanguageState>((set, get) => ({
  language: 'cs',
  isLoaded: false,
  updateCounter: 0,

  setLanguage: async (language: Language) => {
    console.log('Setting language to:', language);
    try {
      await AsyncStorage.setItem('language', language);
      console.log('Language saved successfully:', language);
      // Force re-render by updating counter and language together
      set({ 
        language, 
        isLoaded: true, 
        updateCounter: get().updateCounter + 1 
      });
    } catch (error) {
      console.error('Failed to save language:', error);
    }
  },

  loadLanguage: async () => {
    try {
      const savedLanguage = await AsyncStorage.getItem('language');
      const language = (savedLanguage as Language) || 'cs';
      console.log('Loading language:', language, 'from storage:', savedLanguage);
      set({ language, isLoaded: true, updateCounter: 0 });
    } catch (error) {
      console.error('Failed to load language:', error);
      set({ language: 'cs', isLoaded: true, updateCounter: 0 });
    }
  },

  t: (key: keyof typeof TRANSLATIONS.cs) => {
    const { language } = get();
    const translation = TRANSLATIONS[language]?.[key] || TRANSLATIONS.cs[key];
    return translation || key;
  },
}));