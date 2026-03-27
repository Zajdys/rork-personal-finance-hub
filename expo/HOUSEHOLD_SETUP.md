# Household (Domácnost) - Testovací průvodce

## Co je Household Mode?

Household Mode umožňuje sdílení financí mezi partnery nebo rodinnými členy s detailní kontrolou:
- **Pravidla sdílení**: Určete, které kategorie budou sdílené, jen jako součty, nebo soukromé
- **Rozdělení výdajů**: Nastavte poměry (50/50, 70/30, vlastní) pro každou kategorii
- **Bilance**: Aplikace automaticky sleduje, kdo kolik zaplatil
- **Vyrovnání**: Návrhy na vyrovnání dluhů mezi členy

## Jak najít Household?

1. Otevřete aplikaci
2. Přejděte do záložky **Profil** (pravý dolní roh)
3. V sekci "Finance & Investice" najdete **Domácnost**
4. Klikněte na Domácnost

## Testovací režim (Mock Mode)

Aktuálně je Household v **testovacím režimu**. To znamená:
- ✅ Můžete vytvořit domácnost
- ✅ Můžete přidat členy (pouze simulované)
- ✅ Můžete nastavit pravidla sdílení
- ✅ Můžete nastavit rozdělení výdajů
- ✅ Vidíte mock dashboard s ukázkovými daty
- ❌ Data se neukládají na server
- ❌ Skuteční uživatelé nemohou být pozváni

### Jak testovat:

1. **Vytvoření domácnosti**:
   - Otevřete Household screen
   - Klikněte "Vytvořit domácnost"
   - Zadejte název (např. "Naše rodina")
   - Klikněte "Vytvořit"

2. **Přidání člena** (mock):
   - Na household screenu klikněte "Pozvat člena"
   - Zadejte libovolný e-mail (např. partner@example.com)
   - Člen se přidá okamžitě (simulovaně)

3. **Nastavení pravidel sdílení**:
   - Klikněte na "Pravidla sdílení"
   - Uvidíte seznam kategorií (Bydlení, Jídlo, Doprava, atd.)
   - Pro každou kategorii můžete nastavit:
     - **Sdílené**: Partner vidí všechny detaily transakce
     - **Jen součty**: Partner vidí pouze částku a kategorii
     - **Soukromé**: Partner nevidí nic
   - Dárky jsou automaticky soukromé

4. **Nastavení rozdělení výdajů**:
   - Klikněte na "Rozdělení výdajů"
   - Pro každou kategorii nastavte:
     - **Rovnoměrně**: 50/50 mezi všemi členy
     - **Vlastní poměry**: např. 70% já, 30% partner
   - Součet musí být 100%

5. **Zobrazení bilance**:
   - Na hlavním household screenu vidíte:
     - Kolik každý člen zaplatil
     - Aktuální bilanci (kdo komu dluží)
     - Doporučené vyrovnání

## Přechod na skutečný backend

Když budete chtít připojit skutečný backend:

1. **Otevřete soubor**: `store/household-store.ts`

2. **Změňte konstantu** na řádku 15:
   ```typescript
   const USE_MOCK_MODE = true;  // Změňte na false
   ```
   Na:
   ```typescript
   const USE_MOCK_MODE = false;
   ```

3. **Ujistěte se, že backend běží**:
   - Backend routes jsou v `backend/trpc/routes/household/`
   - Databázové funkce jsou v `backend/trpc/routes/household/db.ts`
   - API endpoints jsou již implementované

4. **Potřebná autentizace**:
   - Household vyžaduje přihlášeného uživatele
   - V mock režimu je autentizace automaticky "true"
   - Ve skutečném režimu potřebujete token v AsyncStorage

## Architektura

### Frontend (Mock):
- `store/household-store.ts` - Context hook s mock daty
- `app/household.tsx` - Hlavní obrazovka domácnosti
- `app/household-policies.tsx` - Nastavení pravidel sdílení
- `app/household-splits.tsx` - Nastavení rozdělení výdajů

### Backend (Připraveno):
- `backend/trpc/routes/household/create/route.ts` - Vytvoření domácnosti
- `backend/trpc/routes/household/invite/route.ts` - Pozvání člena
- `backend/trpc/routes/household/dashboard/route.ts` - Dashboard s bilancí
- `backend/trpc/routes/household/policies/` - Pravidla sdílení
- `backend/trpc/routes/household/splits/` - Rozdělení výdajů
- `backend/trpc/routes/household/settlements/` - Vyrovnání

### Typy:
- `types/household.ts` - Všechny TypeScript typy

## Funkce připravené k implementaci

Tyto funkce mají připravenou infrastrukturu, ale vyžadují backend:

1. **Sdílení transakcí**: Override viditelnosti pro konkrétní transakce
2. **Settlements (Vyrovnání)**: Zaznamenání vyrovnání mezi členy
3. **Audit log**: Historie změn v domácnosti
4. **Notifikace**: Upozornění na sdílené výdaje, limity, atd.
5. **Export**: Export sdílených transakcí pro účetní

## Mock data v testovacím režimu

Když vytvoříte domácnost v mock režimu, automaticky dostanete:

- **Členové**: Vy jako vlastník + přidaní členové
- **Bilance**: Ukázková data s částkami 15000 Kč, 20000 Kč, atd.
- **Kategorie**: 4 ukázkové kategorie s rozložením výdajů
- **Vyrovnání**: Doporučené vyrovnání pokud je více než 1 člen

## Připomínky

- V mock režimu se data **neresetují při restartu aplikace**, jsou pouze v paměti
- Pro testování více scénářů můžete vytvořit více domácností
- Mock režim je ideální pro UI/UX testování bez nutnosti backendu
- Všechny API calls jsou připravené, stačí jen změnit `USE_MOCK_MODE` na `false`

## Další kroky

1. Otestujte UI a workflow v mock režimu
2. Připravte backend databázi
3. Přepněte `USE_MOCK_MODE` na `false`
4. Testujte s opravdovými uživateli
5. Rozšiřte o notifikace a pokročilé funkce

---

**Vytvořeno**: 2025-10-28
**Status**: Mock režim aktivní
**Pro otázky**: Kontaktujte podporu
