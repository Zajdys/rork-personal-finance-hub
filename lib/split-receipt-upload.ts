import { Platform } from 'react-native';
import { supabase, supabaseAnonKey, supabaseUrl } from '@/lib/supabase';
import { compressReceiptImage } from '@/lib/receipt-upload';

const BUCKET = 'split-receipts';
const RECEIPT_FILENAME = 'receipt.jpg';

export function splitReceiptStoragePath(groupId: string, expenseId: string, filename = RECEIPT_FILENAME) {
  return `${groupId}/${expenseId}/${filename}`;
}

async function uploadReceiptFile(localUri: string, path: string): Promise<void> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const accessToken = session?.access_token;
  if (!accessToken) {
    throw new Error('Pro nahrání účtenky se musíte přihlásit.');
  }

  const formData = new FormData();
  try {
    if (Platform.OS === 'web') {
      const res = await fetch(localUri);
      if (!res.ok) {
        throw new Error(`Nepodařilo se načíst soubor účtenky (${res.status}).`);
      }
      const blob = await res.blob();
      formData.append('file', blob, RECEIPT_FILENAME);
    } else {
      formData.append('file', {
        uri: localUri,
        name: RECEIPT_FILENAME,
        type: 'image/jpeg',
      } as unknown as Blob);
    }
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Nepodařilo se připravit soubor účtenky k nahrání.';
    throw new Error(message);
  }

  let response: Response;
  try {
    const encodedPath = path
      .split('/')
      .map((segment) => encodeURIComponent(segment))
      .join('/');

    response = await fetch(`${supabaseUrl}/storage/v1/object/${BUCKET}/${encodedPath}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        apikey: supabaseAnonKey,
        'x-upsert': 'true',
      },
      body: formData,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Síťová chyba při nahrávání účtenky.';
    throw new Error(message);
  }

  if (!response.ok) {
    let errorText = '';
    try {
      errorText = await response.text();
    } catch {
      errorText = `HTTP ${response.status}`;
    }
    throw new Error(`Upload selhal: ${errorText}`);
  }
}

export async function uploadSplitExpenseReceipt(params: {
  groupId: string;
  expenseId: string;
  localUri: string;
}): Promise<{ storagePath: string; error: Error | null }> {
  const storagePath = splitReceiptStoragePath(params.groupId, params.expenseId);
  try {
    const compressedUri = await compressReceiptImage(params.localUri);
    await uploadReceiptFile(compressedUri, storagePath);
    return { storagePath, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Upload selhal';
    return { storagePath: '', error: new Error(message) };
  }
}

export async function resolveSplitReceiptDisplayUrl(receiptUrlOrPath: string): Promise<string | null> {
  const stored = receiptUrlOrPath.trim();
  if (!stored) return null;
  const path = stored.startsWith('http')
    ? stored.includes(`/split-receipts/`)
      ? decodeURIComponent(stored.split('/split-receipts/')[1] ?? '')
      : null
    : stored;
  if (!path) return stored.startsWith('http') ? stored : null;
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
  if (!error && data?.signedUrl) return data.signedUrl;
  return null;
}

export async function deleteSplitExpenseReceipt(receiptUrlOrPath: string): Promise<{ error: Error | null }> {
  const stored = receiptUrlOrPath.trim();
  if (!stored) return { error: null };
  const path = stored.startsWith('http')
    ? stored.includes(`/split-receipts/`)
      ? decodeURIComponent(stored.split('/split-receipts/')[1] ?? '')
      : null
    : stored;
  if (!path) return { error: new Error('Neplatná cesta účtenky') };
  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  return { error: error ? new Error(error.message) : null };
}
