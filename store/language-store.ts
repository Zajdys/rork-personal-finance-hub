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
    importPortfolio: 'Importovat portfolio',
    
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
    importPortfolio: 'Import Portfolio',
    
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