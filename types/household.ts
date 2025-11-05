export type Visibility = 'PRIVATE' | 'SHARED' | 'SUMMARY_ONLY';
export type HouseholdRole = 'OWNER' | 'PARTNER' | 'SUMMARY_VIEWER' | 'READ_ONLY';
export type JoinStatus = 'INVITED' | 'ACTIVE' | 'LEFT' | 'REMOVED';
export type SplitType = 'EQUAL' | 'WEIGHTED' | 'CUSTOM_PER_TX';
export type SettlementMethod = 'BANK' | 'REVOLUT' | 'CASH' | 'OTHER';
export type PolicyScopeType = 'CATEGORY' | 'TAG';

export interface Money {
  amount: number;
  currency: string;
}

export interface Household {
  id: string;
  name: string;
  ownerUserId: string;
  members: HouseholdMember[];
  defaultSplits: Record<string, SplitRule>;
  categoryBudgets: Record<string, CategoryBudget>;
  createdAt: Date;
  updatedAt: Date;
}

export interface HouseholdMember {
  userId: string;
  userName: string;
  userEmail: string;
  role: HouseholdRole;
  joinStatus: JoinStatus;
  joinedAt?: Date;
  invitedAt: Date;
}

export interface SplitRule {
  type: SplitType;
  weights?: Record<string, number>;
}

export interface CategoryBudget {
  categoryId: string;
  monthlyLimit: number;
  currency: string;
  enabled: boolean;
  notifyAtPercentage?: number;
}

export interface SharedPolicy {
  id: string;
  householdId: string;
  scope: {
    type: PolicyScopeType;
    id: string;
  };
  visibility: Visibility;
  priority: number;
}

export interface TransactionShare {
  transactionId: string;
  householdId: string;
  visibility: Visibility;
  split: Record<string, number>;
  maskedMerchant?: boolean;
  overrideByUserId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Settlement {
  id: string;
  householdId: string;
  fromUserId: string;
  fromUserName: string;
  toUserId: string;
  toUserName: string;
  amount: Money;
  method: SettlementMethod;
  note?: string;
  settledAt: Date;
  createdAt: Date;
}

export interface PrivacyRule {
  id: string;
  householdId: string;
  autoPrivateTags: string[];
  maskMerchants: boolean;
}

export interface HouseholdInvitation {
  id: string;
  householdId: string;
  householdName: string;
  inviterUserId: string;
  inviterName: string;
  inviteeEmail: string;
  inviteeUserId?: string;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED';
  expiresAt: Date;
  createdAt: Date;
}

export interface HouseholdBalance {
  userId: string;
  userName: string;
  totalShared: number;
  totalPaid: number;
  balance: number;
}

export interface CategoryBalance {
  category: string;
  totalAmount: number;
  memberBalances: Record<string, {
    paid: number;
    shouldPay: number;
    balance: number;
  }>;
  splitRule: SplitRule;
}

export interface HouseholdDashboard {
  household: Household;
  totalSharedIncome: number;
  totalSharedExpenses: number;
  sharedBalance: number;
  balances: HouseholdBalance[];
  categoryBreakdown: {
    category: string;
    amount: number;
    percentage: number;
    icon: string;
    color: string;
  }[];
  categoryBalances: CategoryBalance[];
  settlementSummary: {
    fromUserId: string;
    fromUserName: string;
    toUserId: string;
    toUserName: string;
    amount: number;
  }[];
  recentActivity: {
    id: string;
    type: 'TRANSACTION' | 'SETTLEMENT' | 'POLICY_CHANGE' | 'MEMBER_CHANGE';
    description: string;
    userId: string;
    userName: string;
    timestamp: Date;
  }[];
}

export interface VisibilityChangeEvent {
  transactionId: string;
  oldVisibility: Visibility;
  newVisibility: Visibility;
  changedBy: string;
  changedAt: Date;
  reason?: string;
}

export interface FairnessReport {
  period: string;
  targetSplits: Record<string, number>;
  actualSplits: Record<string, number>;
  deviations: Record<string, number>;
  recommendations: {
    userId: string;
    userName: string;
    message: string;
    suggestedAdjustment?: number;
  }[];
}

export interface HouseholdNotification {
  id: string;
  householdId: string;
  userId: string;
  type: 'RECURRING_PAYMENT_DUE' | 'CATEGORY_LIMIT_EXCEEDED' | 'MONTHLY_SUMMARY' | 'PRIVACY_CHANGE' | 'SETTLEMENT_REQUEST';
  title: string;
  message: string;
  metadata?: Record<string, any>;
  read: boolean;
  createdAt: Date;
}

export interface AuditLogEntry {
  id: string;
  householdId: string;
  userId: string;
  userName: string;
  action: string;
  resourceType: 'TRANSACTION' | 'POLICY' | 'MEMBER' | 'SETTLEMENT' | 'SPLIT_RULE';
  resourceId: string;
  changes: Record<string, any>;
  timestamp: Date;
  ipAddress?: string;
}

export interface TransactionVisibilityInfo {
  transactionId: string;
  visibility: Visibility;
  visibleToMembers: string[];
  maskedFields: string[];
  appliedPolicies: string[];
  canChangeVisibility: boolean;
}
