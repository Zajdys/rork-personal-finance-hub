import {
  deleteSplitExpenseReceipt,
  uploadSplitExpenseReceipt,
} from '@/lib/split-receipt-upload';
import { updateSplitExpenseReceiptRemote } from '@/lib/split-groups';

export async function syncSplitExpenseReceipt(params: {
  groupId: string;
  expenseId: string;
  pendingLocalUri: string | null;
  existingReceiptPath: string | null;
  removeStored: boolean;
}): Promise<{ receiptPath: string | null; error: Error | null }> {
  const { groupId, expenseId, pendingLocalUri, existingReceiptPath, removeStored } = params;

  if (removeStored && existingReceiptPath) {
    await deleteSplitExpenseReceipt(existingReceiptPath);
    const { error } = await updateSplitExpenseReceiptRemote({
      expenseId,
      groupId,
      receiptUrl: null,
    });
    if (error) return { receiptPath: null, error };
    return { receiptPath: null, error: null };
  }

  if (!pendingLocalUri) {
    return { receiptPath: existingReceiptPath, error: null };
  }

  const { storagePath, error: uploadErr } = await uploadSplitExpenseReceipt({
    groupId,
    expenseId,
    localUri: pendingLocalUri,
  });
  if (uploadErr) return { receiptPath: existingReceiptPath, error: uploadErr };

  const { error: updateErr } = await updateSplitExpenseReceiptRemote({
    expenseId,
    groupId,
    receiptUrl: storagePath,
  });
  if (updateErr) return { receiptPath: existingReceiptPath, error: updateErr };

  return { receiptPath: storagePath, error: null };
}
