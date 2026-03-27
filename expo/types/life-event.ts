export enum LifeEventMode {
  NONE = 'NONE',
  MOVING = 'MOVING',
  CHILD = 'CHILD',
  MORTGAGE = 'MORTGAGE',
}

export interface LifeEventModeInfo {
  mode: LifeEventMode;
  title: string;
  description: string;
  emoji: string;
  color: string;
  benefits: string[];
  defaultGoals: {
    title: string;
    targetAmount: number;
    category: string;
    type: 'saving' | 'spending_limit';
  }[];
  dashboardMetrics: string[];
  notificationRules: {
    enabled: boolean;
    types: string[];
  };
}

export interface UserLifeEventState {
  activeMode: LifeEventMode;
  activatedAt: Date;
  previousMode?: LifeEventMode;
  modeHistory: {
    mode: LifeEventMode;
    activatedAt: Date;
    deactivatedAt?: Date;
  }[];
}

export const LIFE_EVENT_MODES: Record<LifeEventMode, LifeEventModeInfo> = {
  [LifeEventMode.NONE]: {
    mode: LifeEventMode.NONE,
    title: 'Standardní režim',
    description: 'Běžné sledování financí bez speciálního zaměření',
    emoji: '💼',
    color: '#6B7280',
    benefits: [
      'Základní přehled příjmů a výdajů',
      'Obecná doporučení od AI',
      'Standardní finanční cíle',
    ],
    defaultGoals: [],
    dashboardMetrics: ['balance', 'income', 'expenses'],
    notificationRules: {
      enabled: true,
      types: ['budget_warning', 'goal_progress'],
    },
  },
  [LifeEventMode.MOVING]: {
    mode: LifeEventMode.MOVING,
    title: 'Stěhování',
    description: 'Plánuješ nebo právě realizuješ stěhování',
    emoji: '📦',
    color: '#F59E0B',
    benefits: [
      'Sledování nákladů na stěhování a vybavení',
      'Cashflow forecast na příští 3 měsíce',
      'Doporučení na úsporu při zařizování',
      'Rezerva na neočekávané výdaje',
    ],
    defaultGoals: [
      { title: 'Náklady na stěhování', targetAmount: 15000, category: 'Ostatní', type: 'spending_limit' },
      { title: 'Vybavení domácnosti', targetAmount: 50000, category: 'Bydlení', type: 'saving' },
      { title: 'Rezerva na neočekávané', targetAmount: 20000, category: 'Spoření', type: 'saving' },
      { title: 'Kauce (nový nájem)', targetAmount: 25000, category: 'Bydlení', type: 'saving' },
    ],
    dashboardMetrics: ['cashflow_forecast', 'moving_expenses', 'equipment_fund', 'emergency_buffer'],
    notificationRules: {
      enabled: true,
      types: ['moving_expense_alert', 'equipment_tip', 'cashflow_warning'],
    },
  },
  [LifeEventMode.CHILD]: {
    mode: LifeEventMode.CHILD,
    title: 'Dítě',
    description: 'Čekáš dítě nebo máš malé dítě',
    emoji: '👶',
    color: '#EC4899',
    benefits: [
      'Sledování nárůstu výdajů (burn-rate)',
      'Doporučení na dětské potřeby',
      'Plánování rodičovské a příjmů',
      'Upozornění na dávky a podpory',
    ],
    defaultGoals: [
      { title: 'Dětské vybavení', targetAmount: 40000, category: 'Nákupy', type: 'saving' },
      { title: 'Rezerva na rodičovskou', targetAmount: 80000, category: 'Spoření', type: 'saving' },
      { title: 'Měsíční výdaje na dítě', targetAmount: 8000, category: 'Nákupy', type: 'spending_limit' },
      { title: 'Zdravotní péče', targetAmount: 5000, category: 'Ostatní', type: 'saving' },
    ],
    dashboardMetrics: ['burn_rate_increase', 'child_expenses', 'parental_leave_buffer', 'benefit_tracker'],
    notificationRules: {
      enabled: true,
      types: ['burn_rate_alert', 'benefit_reminder', 'child_expense_tip'],
    },
  },
  [LifeEventMode.MORTGAGE]: {
    mode: LifeEventMode.MORTGAGE,
    title: 'Hypotéka',
    description: 'Máš nebo plánuješ hypotéku',
    emoji: '🏠',
    color: '#8B5CF6',
    benefits: [
      'Sledování splátek a úroků',
      'Varování před koncem fixace',
      'Kalkulace předčasných splátek',
      'Porovnání refinancování',
    ],
    defaultGoals: [
      { title: 'Měsíční splátka hypotéky', targetAmount: 18000, category: 'Bydlení', type: 'spending_limit' },
      { title: 'Rezerva na předčasnou splátku', targetAmount: 100000, category: 'Bydlení', type: 'saving' },
      { title: 'Fond oprav', targetAmount: 30000, category: 'Bydlení', type: 'saving' },
      { title: 'Pojištění nemovitosti', targetAmount: 3500, category: 'Bydlení', type: 'saving' },
    ],
    dashboardMetrics: ['mortgage_payment', 'interest_paid', 'fixation_warning', 'prepayment_impact'],
    notificationRules: {
      enabled: true,
      types: ['fixation_ending', 'refinancing_opportunity', 'prepayment_suggestion'],
    },
  },
};

export interface LifeEventAIContext {
  activeMode: LifeEventMode;
  userGoals: string[];
  currentMetrics: Record<string, number | string>;
  modeActiveDays: number;
}

export function getLifeEventInfo(mode: LifeEventMode): LifeEventModeInfo {
  return LIFE_EVENT_MODES[mode];
}

export function buildAIContext(state: UserLifeEventState, additionalData?: Record<string, any>): LifeEventAIContext {
  const modeInfo = getLifeEventInfo(state.activeMode);
  const daysSinceActivation = Math.floor((new Date().getTime() - new Date(state.activatedAt).getTime()) / (1000 * 60 * 60 * 24));
  
  return {
    activeMode: state.activeMode,
    userGoals: modeInfo.defaultGoals.map(g => g.title),
    currentMetrics: additionalData?.metrics || {},
    modeActiveDays: daysSinceActivation,
  };
}
