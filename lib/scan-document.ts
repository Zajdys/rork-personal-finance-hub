import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { supabase } from '@/lib/supabase';

export type ScannedItem = {
  title: string;
  amount: number;
  category: string;
  subcategory?: string | null;
};

/**
 * Sken účtenky / faktury přes vlastní edge funkci `scan-receipt` (Claude).
 * Fotku zmenší (max. 1600 px, JPEG) kvůli rychlosti a ceně; nikam se neukládá.
 * Chyby vrací jako Error s textem, který add.tsx mapuje na hlášky
 * (network / timeout / not configured / denní limit).
 */
export async function scanDocumentImage(uri: string, kind: 'receipt' | 'invoice'): Promise<{ items: ScannedItem[] }> {
  const img = await manipulateAsync(uri, [{ resize: { width: 1600 } }], {
    compress: 0.75,
    format: SaveFormat.JPEG,
    base64: true,
  });
  if (!img.base64) throw new Error('Obrázek se nepodařilo načíst');

  const { data, error } = await supabase.functions.invoke('scan-receipt', {
    body: { image_base64: img.base64, media_type: 'image/jpeg', kind },
  });

  if (error) {
    let status: number | undefined;
    let payload: { error?: string; limit?: number } | null = null;
    try {
      const ctx = (error as { context?: Response }).context;
      status = ctx?.status;
      payload = ctx ? await ctx.json() : null;
    } catch {
      /* ignore */
    }
    if (status === 429) {
      const lim = payload?.limit ?? 3;
      throw new Error(
        lim < 10
          ? `Dnes jsi využil všechny ${lim} skeny zdarma. S Premium máš 10 skenů denně, jinak zase zítra.`
          : `Dnešní limit ${lim} skenů je vyčerpaný. Zkus to zítra.`,
      );
    }
    if (status === 503) throw new Error('AI not configured');
    if (status === 504 || payload?.error === 'timeout') throw new Error('Request timeout');
    if (status === 413) throw new Error('Fotka je moc velká.');
    if (!status) throw new Error('Network request failed');
    throw new Error(payload?.error ?? `Chyba serveru (${status})`);
  }
  const items = Array.isArray((data as { items?: unknown })?.items) ? (data as { items: ScannedItem[] }).items : [];
  return { items };
}
