import { Image as RNImage, Platform } from 'react-native';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { supabase, supabaseAnonKey, supabaseUrl } from '@/lib/supabase';

const BUCKET = 'receipts';
const MAX_SIDE = 1200;

/** Z veřejné URL Storage vytáhne cestu v bucketu `receipts` (např. `userId/txId_ts.jpg`). */
export function receiptStoragePathFromPublicUrl(publicUrl: string): string | null {
  const marker = '/receipts/';
  const i = publicUrl.indexOf(marker);
  if (i === -1) return null;
  return decodeURIComponent(publicUrl.slice(i + marker.length));
}

function getImageSize(uri: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    RNImage.getSize(uri, (width, height) => resolve({ width, height }), reject);
  });
}

export async function compressReceiptImage(localUri: string): Promise<string> {
  let w: number;
  let h: number;
  try {
    ({ width: w, height: h } = await getImageSize(localUri));
  } catch {
    const r = await manipulateAsync(localUri, [], { format: SaveFormat.JPEG });
    w = r.width;
    h = r.height;
  }
  let actions: { resize: { width?: number; height?: number } }[] = [];
  if (w >= h && w > MAX_SIDE) {
    actions = [{ resize: { width: MAX_SIDE } }];
  } else if (h > w && h > MAX_SIDE) {
    actions = [{ resize: { height: MAX_SIDE } }];
  } else if (w > MAX_SIDE) {
    actions = [{ resize: { width: MAX_SIDE } }];
  }
  const out = await manipulateAsync(localUri, actions, {
    compress: 0.7,
    format: SaveFormat.JPEG,
  });
  return out.uri;
}

/** Cesta v bucketu z uložené hodnoty (URL nebo relativní cesta). */
export function receiptPathFromStoredValue(stored: string): string | null {
  if (!stored.trim()) return null;
  if (stored.startsWith('http')) return receiptStoragePathFromPublicUrl(stored);
  return stored;
}

/** REST FormData upload — obchází supabase-js storage klienta (Hermes nemá Blob). */
async function uploadReceiptFile(localUri: string, path: string, filename: string): Promise<void> {
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
      formData.append('file', blob, filename);
    } else {
      formData.append('file', {
        uri: localUri,
        name: filename,
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

export async function uploadSharedExpenseReceipt(params: {
  householdId: string;
  expenseId: string;
  localUri: string;
}): Promise<{ storagePath: string; error: Error | null }> {
  const storagePath = `${params.householdId}/${params.expenseId}.jpg`;
  try {
    const compressedUri = await compressReceiptImage(params.localUri);
    await uploadReceiptFile(compressedUri, storagePath, `${params.expenseId}.jpg`);
    return { storagePath, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Upload selhal';
    return { storagePath: '', error: new Error(message) };
  }
}

/** Zobrazení účtenky (signed URL pro privátní bucket, fallback na veřejnou URL). */
export async function resolveReceiptDisplayUrl(receiptUrlOrPath: string): Promise<string | null> {
  const path = receiptPathFromStoredValue(receiptUrlOrPath);
  if (!path) {
    return receiptUrlOrPath.startsWith('http') ? receiptUrlOrPath : null;
  }
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
  if (!error && data?.signedUrl) return data.signedUrl;
  const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return pub.publicUrl || null;
}

export async function deleteStoredReceipt(receiptUrlOrPath: string): Promise<{ error: Error | null }> {
  const path = receiptPathFromStoredValue(receiptUrlOrPath);
  if (!path) return { error: new Error('Neplatná URL účtenky') };
  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  return { error: error ? new Error(error.message) : null };
}

export async function uploadReceiptToStorage(params: {
  userId: string;
  transactionId: string;
  localUri: string;
}): Promise<{ publicUrl: string; error: Error | null }> {
  const fileName = `${params.userId}/${params.transactionId}_${Date.now()}.jpg`;
  try {
    const compressedUri = await compressReceiptImage(params.localUri);
    await uploadReceiptFile(compressedUri, fileName, `${params.transactionId}.jpg`);
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(fileName);
    return { publicUrl: data.publicUrl, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Upload selhal';
    return { publicUrl: '', error: new Error(message) };
  }
}

export async function deleteReceiptFromStorage(publicUrl: string): Promise<{ error: Error | null }> {
  return deleteStoredReceipt(publicUrl);
}
