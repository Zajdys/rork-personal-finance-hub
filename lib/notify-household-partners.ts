import { Alert } from 'react-native';
import { supabase } from '@/lib/supabase';

export async function notifyHouseholdPartners(params: {
  householdId: string;
  senderUserId: string;
  senderDisplayName: string;
  itemName: string;
  price: number;
  currencySymbol: string;
}): Promise<{ error: Error | null }> {
  const { data: members, error } = await supabase
    .from('household_members')
    .select('user_id')
    .eq('household_id', params.householdId)
    .neq('user_id', params.senderUserId);

  if (error) {
    console.warn('[save-notify] members', error.message);
    Alert.alert('Upozornění partnera', error.message);
    return { error: new Error(error.message) };
  }
  if (!members?.length) return { error: null };

  const firstName = params.senderDisplayName.trim().split(/\s+/)[0] || 'Někdo';
  const formattedPrice = Math.round(params.price).toLocaleString('cs-CZ');
  const title = 'MoneyBuddy – nákup?';
  const body = `${firstName} zvažuje koupi: ${params.itemName} za ${formattedPrice} ${params.currencySymbol}. Co myslíš?`;

  const rows = members.map((m) => ({
    household_id: params.householdId,
    sender_user_id: params.senderUserId,
    recipient_user_id: m.user_id,
    title,
    body,
  }));

  const { error: insErr } = await supabase.from('household_partner_alerts').insert(rows);
  if (insErr) {
    console.warn('[save-notify] insert', insErr.message);
    Alert.alert('Upozornění partnera', insErr.message);
    return { error: new Error(insErr.message) };
  }
  return { error: null };
}
