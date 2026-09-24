import type { RecurringFrequency } from '@/lib/recurring-expense-cycle';
import type { RecurringSplitType } from '@/lib/household-recurring-shares';
import type { ExpensePaymentMode } from '@/lib/household-settlements';

export type HouseholdCustomCategory = { id: string; name: string; emoji: string; createdAt: string };

export type RecurringOccurrencePayment = {
  dueDate: string;
  paidUserIds: string[];
};

export type RecurringExpense = {
  id: string;
  name: string;
  amount: number;
  dueDay: number | null;
  /** ISO 1=Po … 7=Ne (weekly). */
  dueWeekday: number | null;
  /** 1–12 pro čtvrtletní / pololetní / roční; jinak null */
  dueMonth: number | null;
  frequency: RecurringFrequency;
  category: string;
  /** Autor osobního výdaje (mine); u sdílených vlastník my_share %. */
  createdBy: string | null;
  addedBy: string | null;
  splitType: RecurringSplitType;
  /** 0–100, podíl autora u shared_* */
  myShare: number;
  /** Výskyty v aktuálním měsíci + platby (due_date). Prázdné = nesplatné tento měsíc. */
  occurrences: RecurringOccurrencePayment[];
  paymentMode: ExpensePaymentMode;
  payerUserId: string | null;
  createdAt: string | null;
};

export type Member = {
  userId: string;
  name: string;
};
