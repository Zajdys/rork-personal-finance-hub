/**
 * Seed demo účtu pro Apple App Review.
 *
 * NESPOUŠTĚT automaticky — spusť ručně:
 *   SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… \
 *   bun scripts/seed-review-account.bun.ts
 *
 * Heslo vypíše jen jednou na konec (ulož do App Review Notes).
 */
import { createClient } from '@supabase/supabase-js';
import { randomBytes } from 'crypto';

const EMAIL = 'review@moneybuddy.cz';
const DISPLAY_NAME = 'Apple Review';

const SUPABASE_URL =
  process.env.SUPABASE_URL?.trim() ||
  process.env.EXPO_PUBLIC_SUPABASE_URL?.trim() ||
  '';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || '';

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setUTCHours(12, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - n);
  return ymd(d);
}

function genPassword(): string {
  // Čitelné pro App Review Notes, bez matoucích znaků
  const raw = randomBytes(12).toString('base64url');
  return `Mb-Review-${raw.slice(0, 10)}!`;
}

type SeedTx = {
  id: string;
  date: string;
  amount: number;
  type: 'income' | 'expense';
  category: string;
  description: string;
  source: string;
  category_source: string;
  merchant_key: string | null;
};

function buildDemoTransactions(userId: string): SeedTx[] {
  const rows: Omit<SeedTx, 'id'>[] = [
    // Příjmy
    { date: daysAgo(85), amount: 52000, type: 'income', category: 'Ostatní', description: 'Výplata', source: 'manual', category_source: 'import', merchant_key: null },
    { date: daysAgo(55), amount: 52000, type: 'income', category: 'Ostatní', description: 'Výplata', source: 'manual', category_source: 'import', merchant_key: null },
    { date: daysAgo(25), amount: 52000, type: 'income', category: 'Ostatní', description: 'Výplata', source: 'manual', category_source: 'import', merchant_key: null },
    // Jídlo
    { date: daysAgo(80), amount: 892.5, type: 'expense', category: 'Jídlo a nápoje', description: 'Albert', source: 'raiffeisenbank', category_source: 'dictionary', merchant_key: 'ALBERT' },
    { date: daysAgo(72), amount: 1240, type: 'expense', category: 'Jídlo a nápoje', description: 'Lidl', source: 'raiffeisenbank', category_source: 'dictionary', merchant_key: 'LIDL' },
    { date: daysAgo(61), amount: 459, type: 'expense', category: 'Jídlo a nápoje', description: 'Rohlik.cz', source: 'raiffeisenbank', category_source: 'dictionary', merchant_key: 'ROHLIK' },
    { date: daysAgo(48), amount: 678, type: 'expense', category: 'Jídlo a nápoje', description: 'Billa', source: 'raiffeisenbank', category_source: 'dictionary', merchant_key: 'BILLA' },
    { date: daysAgo(33), amount: 1120, type: 'expense', category: 'Jídlo a nápoje', description: 'Kaufland', source: 'raiffeisenbank', category_source: 'dictionary', merchant_key: 'KAUFLAND' },
    { date: daysAgo(14), amount: 345, type: 'expense', category: 'Jídlo a nápoje', description: 'McDonald\'s', source: 'raiffeisenbank', category_source: 'dictionary', merchant_key: 'MCDONALDS' },
    { date: daysAgo(5), amount: 189, type: 'expense', category: 'Jídlo a nápoje', description: 'Starbucks', source: 'raiffeisenbank', category_source: 'keywords', merchant_key: 'STARBUCKS' },
    // Domácnost / nákupy
    { date: daysAgo(70), amount: 2490, type: 'expense', category: 'Domácnost a nábytek', description: 'IKEA', source: 'raiffeisenbank', category_source: 'dictionary', merchant_key: 'IKEA' },
    { date: daysAgo(52), amount: 1599, type: 'expense', category: 'Nákupy', description: 'Alza', source: 'raiffeisenbank', category_source: 'dictionary', merchant_key: 'ALZA' },
    { date: daysAgo(40), amount: 890, type: 'expense', category: 'Domácnost a nábytek', description: 'Hornbach', source: 'raiffeisenbank', category_source: 'dictionary', merchant_key: 'HORNBACH' },
    { date: daysAgo(18), amount: 429, type: 'expense', category: 'Nákupy', description: 'Datart', source: 'raiffeisenbank', category_source: 'dictionary', merchant_key: 'DATART' },
    // Doprava / telco / služby
    { date: daysAgo(75), amount: 550, type: 'expense', category: 'Doprava', description: 'PID Lítačka', source: 'raiffeisenbank', category_source: 'import', merchant_key: 'PID' },
    { date: daysAgo(45), amount: 550, type: 'expense', category: 'Doprava', description: 'PID Lítačka', source: 'raiffeisenbank', category_source: 'import', merchant_key: 'PID' },
    { date: daysAgo(15), amount: 550, type: 'expense', category: 'Doprava', description: 'PID Lítačka', source: 'raiffeisenbank', category_source: 'import', merchant_key: 'PID' },
    { date: daysAgo(66), amount: 799, type: 'expense', category: 'Telefon a internet', description: 'Vodafone', source: 'raiffeisenbank', category_source: 'dictionary', merchant_key: 'VODAFONE' },
    { date: daysAgo(36), amount: 799, type: 'expense', category: 'Telefon a internet', description: 'Vodafone', source: 'raiffeisenbank', category_source: 'dictionary', merchant_key: 'VODAFONE' },
    { date: daysAgo(6), amount: 799, type: 'expense', category: 'Telefon a internet', description: 'Vodafone', source: 'raiffeisenbank', category_source: 'dictionary', merchant_key: 'VODAFONE' },
    { date: daysAgo(58), amount: 199, type: 'expense', category: 'Předplatné', description: 'Netflix', source: 'raiffeisenbank', category_source: 'dictionary', merchant_key: 'NETFLIX' },
    { date: daysAgo(28), amount: 199, type: 'expense', category: 'Předplatné', description: 'Netflix', source: 'raiffeisenbank', category_source: 'dictionary', merchant_key: 'NETFLIX' },
    { date: daysAgo(50), amount: 169, type: 'expense', category: 'Předplatné', description: 'Spotify', source: 'raiffeisenbank', category_source: 'dictionary', merchant_key: 'SPOTIFY' },
    { date: daysAgo(20), amount: 169, type: 'expense', category: 'Předplatné', description: 'Spotify', source: 'raiffeisenbank', category_source: 'dictionary', merchant_key: 'SPOTIFY' },
    { date: daysAgo(42), amount: 249, type: 'expense', category: 'Předplatné', description: 'Disney+', source: 'raiffeisenbank', category_source: 'dictionary', merchant_key: 'DISNEY' },
    { date: daysAgo(12), amount: 249, type: 'expense', category: 'Předplatné', description: 'Disney+', source: 'raiffeisenbank', category_source: 'dictionary', merchant_key: 'DISNEY' },
    // Bydlení / převod
    { date: daysAgo(78), amount: 18500, type: 'expense', category: 'Nájem a bydlení', description: 'Nájem', source: 'manual', category_source: 'user', merchant_key: null },
    { date: daysAgo(48), amount: 18500, type: 'expense', category: 'Nájem a bydlení', description: 'Nájem', source: 'manual', category_source: 'user', merchant_key: null },
    { date: daysAgo(18), amount: 18500, type: 'expense', category: 'Nájem a bydlení', description: 'Nájem', source: 'manual', category_source: 'user', merchant_key: null },
    { date: daysAgo(30), amount: 5000, type: 'expense', category: 'Převod', description: 'Spořicí účet', source: 'raiffeisenbank', category_source: 'transfer', merchant_key: null },
    { date: daysAgo(8), amount: 3000, type: 'expense', category: 'Převod', description: 'Spořicí účet', source: 'raiffeisenbank', category_source: 'transfer', merchant_key: null },
    // Zábava / zdraví
    { date: daysAgo(22), amount: 320, type: 'expense', category: 'Zábava a kultura', description: 'Cinema City', source: 'raiffeisenbank', category_source: 'dictionary', merchant_key: 'CINEMA CITY' },
    { date: daysAgo(9), amount: 189, type: 'expense', category: 'Zdraví', description: 'Dr. Max', source: 'raiffeisenbank', category_source: 'dictionary', merchant_key: 'DR MAX' },
  ];

  return rows.map((r, i) => ({
    ...r,
    id: `review-${userId.slice(0, 8)}-${String(i).padStart(3, '0')}`,
  }));
}

async function main() {
  const password = genPassword();
  console.log('=== seed-review-account ===');
  console.log('Email:', EMAIL);

  // Najdi / vytvoř uživatele
  const list = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (list.error) throw list.error;
  let user = list.data.users.find((u) => u.email?.toLowerCase() === EMAIL);

  if (user) {
    console.log('User exists — updating password + clearing old demo rows…');
    const { error: updErr } = await admin.auth.admin.updateUserById(user.id, {
      password,
      email_confirm: true,
      user_metadata: { name: DISPLAY_NAME, display_name: DISPLAY_NAME },
    });
    if (updErr) throw updErr;
    await admin.from('transactions').delete().eq('user_id', user.id).like('id', 'review-%');
    await admin.from('monthly_subscriptions').delete().eq('user_id', user.id);
  } else {
    const { data, error } = await admin.auth.admin.createUser({
      email: EMAIL,
      password,
      email_confirm: true,
      user_metadata: { name: DISPLAY_NAME, display_name: DISPLAY_NAME },
    });
    if (error) throw error;
    user = data.user;
    console.log('Created user', user.id);
  }

  const userId = user.id;
  const now = new Date().toISOString();

  const { error: usersErr } = await admin.from('users').upsert({
    id: userId,
    email: EMAIL,
    display_name: DISPLAY_NAME,
    onboarding_completed: true,
    welcome_tour_completed: true,
  });
  if (usersErr) throw usersErr;

  const { error: profileErr } = await admin.from('user_profiles').upsert(
    {
      user_id: userId,
      first_name: 'Apple',
      last_name: 'Review',
      terms_accepted_at: now,
      age_confirmed_at: now,
      terms_version: '2026-10-09',
    },
    { onConflict: 'user_id' },
  );
  if (profileErr) throw profileErr;

  const txs = buildDemoTransactions(userId);
  const { error: txErr } = await admin.from('transactions').upsert(
    txs.map((t) => ({
      ...t,
      user_id: userId,
      unique_key: `${userId}|${t.id}`,
    })),
  );
  if (txErr) throw txErr;

  const nextMonth = new Date();
  nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
  nextMonth.setUTCDate(5);
  const nextPay = ymd(nextMonth);

  const subs = [
    {
      user_id: userId,
      name: 'Netflix',
      amount: 199,
      currency: 'CZK',
      frequency: 'monthly',
      next_payment_date: nextPay,
      due_day: 5,
      category: 'Předplatné',
      merchant_key: 'NETFLIX',
      source: 'manual',
      active: true,
    },
    {
      user_id: userId,
      name: 'Spotify',
      amount: 169,
      currency: 'CZK',
      frequency: 'monthly',
      next_payment_date: nextPay,
      due_day: 8,
      category: 'Předplatné',
      merchant_key: 'SPOTIFY',
      source: 'manual',
      active: true,
    },
    {
      user_id: userId,
      name: 'Disney+',
      amount: 249,
      currency: 'CZK',
      frequency: 'monthly',
      next_payment_date: nextPay,
      due_day: 12,
      category: 'Předplatné',
      merchant_key: 'DISNEY',
      source: 'manual',
      active: true,
    },
  ];
  const { error: subErr } = await admin.from('monthly_subscriptions').insert(subs);
  if (subErr) throw subErr;

  console.log(`Inserted ${txs.length} transactions, ${subs.length} subscriptions.`);
  console.log('');
  console.log('=== App Review credentials (save now; shown once) ===');
  console.log(`Email:    ${EMAIL}`);
  console.log(`Password: ${password}`);
  console.log('=====================================================');
}

await main();
