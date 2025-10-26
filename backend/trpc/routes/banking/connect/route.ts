import { z } from 'zod';
import { publicProcedure } from '../../../create-context';

const bankProviderSchema = z.enum([
  'csob',
  'ceska-sporitelna',
  'komercni-banka',
  'moneta',
  'fio',
  'raiffeisenbank',
  'unicredit',
  'air-bank',
  'revolut',
  'wise',
]);

const accountTypeSchema = z.enum(['checking', 'savings', 'building_savings']);

export const connectBankProcedure = publicProcedure
  .input(
    z.object({
      bankProvider: bankProviderSchema,
      accountType: accountTypeSchema.default('checking'),
      credentials: z.object({
        username: z.string(),
        password: z.string(),
      }),
    })
  )
  .mutation(async ({ input }) => {
    console.log('Connecting to bank:', input.bankProvider);
    
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const mockAccount = {
      id: `account-${Date.now()}`,
      bankProvider: input.bankProvider,
      accountNumber: '123456789/0100',
      accountName: 'Hlavní účet',
      accountType: input.accountType,
      balance: 45000,
      currency: 'CZK',
      lastSyncedAt: new Date(),
      isActive: true,
      connectedAt: new Date(),
    };

    return {
      success: true,
      account: mockAccount,
    };
  });
