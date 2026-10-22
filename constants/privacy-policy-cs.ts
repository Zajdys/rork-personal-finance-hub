/** Zásady ochrany osobních údajů (MoneyBuddy) — plný text pro export / web. */
export const PRIVACY_POLICY_CS = `
Zásady ochrany osobních údajů
MoneyBuddy – Czech Finance
Poslední aktualizace: 9. 10. 2026

1. Správce osobních údajů
Aplikaci MoneyBuddy provozuje Jan Hájek (dále jen „my" nebo „správce").
Kontakt: privacy@moneybuddy.cz

2. Jaké údaje zpracováváme
- Údaje účtu: e-mailová adresa, jméno (volitelné)
- Finanční data: transakce, příjmy, výdaje, investice které sami zadáte
- Technické údaje: typ zařízení, verze OS, anonymní identifikátor
- Údaje o předplatném: stav nákupu přes App Store / Google Play (prostřednictvím RevenueCat)
- Push token zařízení (pro notifikace přes Expo)

3. Proč údaje zpracováváme
- Poskytování služeb aplikace (správa financí, synchronizace)
- Sdílení dat v rámci domácnosti (pokud tuto funkci využíváte)
- Správa předplatného a obnovení nákupů
- Technická podpora a oprava chyb
- Odesílání připomínek (splatnosti, předplatné, sdílené výdaje) — pokud je povolíte

4. Kde data ukládáme
Data jsou uložena na serverech Supabase (EU region).
Více informací: https://supabase.com/privacy

5. Sdílení dat / zpracovatelé
Vaše data NESDÍLÍME s třetími stranami za účelem reklamy.
Data mohou být zpřístupněna pouze těmto zpracovatelům v rozsahu nutném pro provoz služby:
- Supabase (infrastruktura, databáze, autentizace, Edge Functions) — EU
- RevenueCat (správa předplatného a ověření nákupů App Store / Google Play)
- Expo (doručování push notifikací)
- Česká národní banka — ČNB (veřejné kurzy měn; neodesíláme osobní údaje)
- Yahoo Finance (tržní ceny investic; neodesíláme osobní údaje)
- Apple / Google (technické údaje a platby přes obchod s aplikacemi)

6. Automatické napojení banky (pokud ho zapnete)
Pokud v aplikaci zapnete automatické napojení bankovního účtu (AIS):
- Kontomatik sp. z o.o. (Polsko) — licencovaný poskytovatel služby informování o platebním účtu (AIS) podle PSD2; zprostředkuje bezpečné přihlášení k bance a stažení zůstatků a transakcí
- Hetzner Online GmbH (Německo) — provoz našeho mostového serveru (bank.moneybuddy.cz), který volá Kontomatik API z pevné IP a ukládá šifrované přístupové údaje pro opakovanou synchronizaci
Přístup můžete kdykoli odpojit v aplikaci. Při smazání účtu se snažíme zrušit i přístup u Kontomatiku.
Bez vašeho aktivního souhlasu a dokončení bankovního přihlášení bankovní data nestahujeme.

7. Vaše práva
Máte právo na:
- Přístup ke svým datům (export v sekci Profil → Soukromí a bezpečnost → Správa dat)
- Smazání účtu a všech dat (Profil → Soukromí a bezpečnost → Správa dat → Smazat účet)
- Opravu nesprávných údajů
- Odvolání souhlasu s napojením banky

8. Bankovní výpisy (PDF / CSV)
PDF a CSV výpisy nahrané do aplikace jsou zpracovány na našich serverech (Supabase Edge Function) nebo na zařízení pouze za účelem extrakce transakcí.
PDF soubory nejsou trvale ukládány.

9. Investiční data
Ceny akcií jsou načítány z Yahoo Finance API.
Kurzy měn z veřejného API České národní banky (ČNB).
Do těchto služeb nejsou odesílána žádná vaše osobní data.

10. Kontakt
privacy@moneybuddy.cz
`.trim();
