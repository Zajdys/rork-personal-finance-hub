/**
 * České (a EN) plurály pro hlášky s počtem.
 * Forma: 1 → one, 2–4 → few, 5+ (a 11–14) → many.
 */
export type CzechCountForm = 'one' | 'few' | 'many';
export type AppLang = 'cs' | 'en';

export function czechCountForm(n: number): CzechCountForm {
  const abs = Math.abs(Math.trunc(n));
  if (abs === 1) return 'one';
  const n100 = abs % 100;
  if (n100 >= 12 && n100 <= 14) return 'many';
  const n10 = abs % 10;
  if (n10 >= 2 && n10 <= 4) return 'few';
  return 'many';
}

type CsForms = { one: string; few: string; many: string };
type EnForms = { one: string; other: string };

/**
 * Sdílená pluralizace: vybere tvar podle `czechCountForm` (CS)
 * nebo one/other (EN).
 */
export function pluralCs(
  n: number,
  forms: CsForms,
  lang: AppLang = 'cs',
  enForms?: EnForms,
): string {
  if (lang === 'en') {
    const abs = Math.abs(Math.trunc(n));
    const en = enForms ?? { one: forms.one, other: forms.many };
    return abs === 1 ? en.one : en.other;
  }
  return forms[czechCountForm(n)];
}

/** „3 soubory“ / „3 files“ */
export function formatCountNoun(
  n: number,
  nounFn: (count: number, lang?: AppLang) => string,
  lang: AppLang = 'cs',
): string {
  const count = Math.abs(Math.trunc(n));
  return `${count} ${nounFn(count, lang)}`;
}

/** „nová transakce“ / „nové transakce“ / „nových transakcí“ */
export function pluralNovaTransakce(n: number, lang: AppLang = 'cs'): string {
  return pluralCs(
    n,
    { one: 'nová transakce', few: 'nové transakce', many: 'nových transakcí' },
    lang,
    { one: 'new transaction', other: 'new transactions' },
  );
}

/** 1 duplicita, 2–4 duplicity, 5+ duplicit */
export function pluralDuplicita(n: number, lang: AppLang = 'cs'): string {
  return pluralCs(
    n,
    { one: 'duplicita', few: 'duplicity', many: 'duplicit' },
    lang,
    { one: 'duplicate', other: 'duplicates' },
  );
}

/** 1 účet, 2–4 účty, 5+ účtů */
export function pluralUcet(n: number, lang: AppLang = 'cs'): string {
  return pluralCs(
    n,
    { one: 'účet', few: 'účty', many: 'účtů' },
    lang,
    { one: 'account', other: 'accounts' },
  );
}

/** 1 položka, 2–4 položky, 5+ položek */
export function pluralPolozka(n: number, lang: AppLang = 'cs'): string {
  return pluralCs(
    n,
    { one: 'položka', few: 'položky', many: 'položek' },
    lang,
    { one: 'item', other: 'items' },
  );
}

/** Skloňování „transakce“ */
export function pluralTransakce(n: number, lang: AppLang = 'cs'): string {
  return pluralCs(
    n,
    { one: 'transakce', few: 'transakce', many: 'transakcí' },
    lang,
    { one: 'transaction', other: 'transactions' },
  );
}

/** 1 měsíc, 2–4 měsíce, 5+ měsíců */
export function pluralMěsic(n: number, lang: AppLang = 'cs'): string {
  return pluralCs(
    n,
    { one: 'měsíc', few: 'měsíce', many: 'měsíců' },
    lang,
    { one: 'month', other: 'months' },
  );
}

/** 1 člen, 2–4 členové, 5+ členů */
export function pluralClen(n: number, lang: AppLang = 'cs'): string {
  return pluralCs(
    n,
    { one: 'člen', few: 'členové', many: 'členů' },
    lang,
    { one: 'member', other: 'members' },
  );
}

/** 1 protiúčet, 2–4 protiúčty, 5+ protiúčtů */
export function pluralProtiucet(n: number, lang: AppLang = 'cs'): string {
  return pluralCs(
    n,
    { one: 'protiúčet', few: 'protiúčty', many: 'protiúčtů' },
    lang,
    { one: 'counterparty', other: 'counterparties' },
  );
}

/** 1 výpis, 2–4 výpisy, 5+ výpisů */
export function pluralVypis(n: number, lang: AppLang = 'cs'): string {
  return pluralCs(
    n,
    { one: 'výpis', few: 'výpisy', many: 'výpisů' },
    lang,
    { one: 'statement', other: 'statements' },
  );
}

/** 1 soubor, 2–4 soubory, 5+ souborů */
export function pluralSoubor(n: number, lang: AppLang = 'cs'): string {
  return pluralCs(
    n,
    { one: 'soubor', few: 'soubory', many: 'souborů' },
    lang,
    { one: 'file', other: 'files' },
  );
}

/** 1 pozice, 2–4 pozice, 5+ pozic */
export function pluralPozice(n: number, lang: AppLang = 'cs'): string {
  return pluralCs(
    n,
    { one: 'pozice', few: 'pozice', many: 'pozic' },
    lang,
    { one: 'position', other: 'positions' },
  );
}

/** 1 převod, 2–4 převody, 5+ převodů */
export function pluralPrevod(n: number, lang: AppLang = 'cs'): string {
  return pluralCs(
    n,
    { one: 'převod', few: 'převody', many: 'převodů' },
    lang,
    { one: 'transfer', other: 'transfers' },
  );
}

/** 1 úvěr, 2–4 úvěry, 5+ úvěrů */
export function pluralUver(n: number, lang: AppLang = 'cs'): string {
  return pluralCs(
    n,
    { one: 'úvěr', few: 'úvěry', many: 'úvěrů' },
    lang,
    { one: 'loan', other: 'loans' },
  );
}

/** 1 den, 2–4 dny, 5+ dní */
export function pluralDen(n: number, lang: AppLang = 'cs'): string {
  return pluralCs(
    n,
    { one: 'den', few: 'dny', many: 'dní' },
    lang,
    { one: 'day', other: 'days' },
  );
}

/** „Domácnost · 2 členové“ */
export function formatHouseholdMemberCountLabel(
  name: string,
  count: number,
  lang: AppLang = 'cs',
): string {
  const n = Math.max(0, Math.floor(count));
  return `${name} · ${n} ${pluralClen(n, lang)}`;
}

/** Shrnutí importu investic; 0 nových → speciální hláška. */
export function formatInvestImportSummary(
  params: { files: number; newTx: number; positions: number },
  lang: AppLang = 'cs',
): string {
  const files = Math.max(0, Math.trunc(params.files));
  const newTx = Math.max(0, Math.trunc(params.newTx));
  const positions = Math.max(0, Math.trunc(params.positions));

  if (newTx === 0) {
    return lang === 'en'
      ? 'Nothing new — all transactions are already imported.'
      : 'Nic nového — všechny transakce už máš naimportované.';
  }

  if (lang === 'en') {
    return `Imported ${files} ${pluralSoubor(files, 'en')}, ${newTx} ${pluralNovaTransakce(newTx, 'en')}, ${positions} ${pluralPozice(positions, 'en')}.`;
  }
  return `Naimportováno ${files} ${pluralSoubor(files)}, ${newTx} ${pluralNovaTransakce(newTx)}, ${positions} ${pluralPozice(positions)}.`;
}

/** Potvrzení smazání portfolia s plurály. */
export function formatInvestDeletePortfolioConfirm(
  params: { name: string; positions: number; transactions: number },
  lang: AppLang = 'cs',
): string {
  const positions = Math.max(0, Math.trunc(params.positions));
  const transactions = Math.max(0, Math.trunc(params.transactions));
  if (lang === 'en') {
    return `Delete portfolio ${params.name}? This will remove ${positions} ${pluralPozice(positions, 'en')} and ${transactions} ${pluralTransakce(transactions, 'en')}. This cannot be undone.`;
  }
  return `Opravdu smazat portfolio ${params.name}? Smaže se ${positions} ${pluralPozice(positions)} a ${transactions} ${pluralTransakce(transactions)}. Tuto akci nelze vrátit zpět.`;
}

/** „Přeřazeno 3 převody…“ */
export function formatReclassifiedTransfers(
  count: number,
  lang: AppLang = 'cs',
  opts?: { betweenOwnAccounts?: boolean },
): string {
  const n = Math.max(0, Math.trunc(count));
  if (lang === 'en') {
    const base = `Reclassified ${n} ${pluralPrevod(n, 'en')}`;
    return opts?.betweenOwnAccounts ? `${base} between your own accounts` : base;
  }
  const base = `Přeřazeno ${n} ${pluralPrevod(n)}`;
  return opts?.betweenOwnAccounts ? `${base} mezi vlastními účty` : base;
}
