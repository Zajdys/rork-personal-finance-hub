import { z } from 'zod';
import { publicProcedure } from '../../../create-context';

export const syncBankAccountProcedure = publicProcedure
  .input(
    z.object({
      accountId: z.string(),
    })
  )
  .mutation(async ({ input }) => {
    console.log('Syncing bank account:', input.accountId);
    
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    const mockTransactions = [
      {
        id: `txn-${Date.now()}-1`,
        accountId: input.accountId,
        date: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
        amount: 450,
        type: 'expense' as const,
        description: 'LIDL',
        category: 'Jídlo a nápoje',
        transactionId: `bank-txn-${Date.now()}-1`,
      },
      {
        id: `txn-${Date.now()}-2`,
        accountId: input.accountId,
        date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
        amount: 199,
        type: 'expense' as const,
        description: 'Netflix',
        category: 'Zábava',
        transactionId: `bank-txn-${Date.now()}-2`,
      },
      {
        id: `txn-${Date.now()}-3`,
        accountId: input.accountId,
        date: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
        amount: 35000,
        type: 'income' as const,
        description: 'Výplata',
        category: 'Mzda',
        transactionId: `bank-txn-${Date.now()}-3`,
      },
    ];

    return {
      success: true,
      transactions: mockTransactions,
      syncedAt: new Date(),
    };
  });
