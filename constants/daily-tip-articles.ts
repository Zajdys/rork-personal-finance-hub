import type { DailyTipKey } from './daily-tip-keys';

export type DailyTipArticle = {
  title: string;
  paragraphs: string[];
};

export const DAILY_TIP_ARTICLES: Record<DailyTipKey, DailyTipArticle> = {
  dailyTip1: {
    title: 'Pravidlo 50/30/20',
    paragraphs: [
      'Pravidlo 50/30/20 rozděluje čistý příjem na tři oblasti: zhruba 50 % na nutné výdaje (bydlení, jídlo, doprava, základní služby), 30 % na přání a zábavu, 20 % na spoření, investice a splácení dluhů nad rámec minimálních splátek. Nejde o dogma — jde o jednoduchý rámec, který pomůže udržet přehled.',
      'Příklad: při čistém příjmu 40 000 Kč měsíčně cílíte na 20 000 Kč na potřeby, 12 000 Kč na volný čas a 8 000 Kč na budoucnost. Když potřeby sežerou víc než polovinu, je signál zkontrolovat nájem, energie nebo fixní platby.',
      'Začněte měsícem, kdy si jen zapíšete reálné výdaje. Pak jednu oblast (třeba „zábavu“) snižte o pár procent a peníze pošlete automaticky na spořicí účet nebo investici hned po výplatě.',
      'Častá chyba je ignorovat nepravidelné výdaje (servis auta, dovolená). Ty započítejte jako měsíční rezervu. Druhá chyba je 20 % „spořit“ a zároveň platit drahý revolving na kartě — často má smysl nejdřív splatit dluhy s vysokým úrokem.',
    ],
  },
  dailyTip2: {
    title: 'Refinancování hypotéky',
    paragraphs: [
      'Refinancování znamená vzít novou hypotéku (nebo změnit podmínky u stávající banky) za účelem nižší úrokové sazby, jiné fixace nebo konsolidace. U částek v řádu milionů korun i o desetiny procenta ročně znamenají desetitisíce až statisíce za dobu splácení.',
      'Typicky 3–6 měsíců před koncem fixace začněte srovnávat nabídky a rezervujte si sazbu, pokud banka umožňuje „zamčení“ dopředu. Spočítejte i poplatky za odhad, administrativu a případné doplatky.',
      'Sepište zbývající jistinu, délku fixace, RPSN a sankce za předčasné splacení u současné smlouvy. Bez těchto čísel nejde férově porovnat konkurenci.',
      'Chyba: přejít jen kvůli nejnižší sazbě bez čtení podmínek předčasného splacení nebo bez zvážení délky fixace vzhledem k vašim plánům (např. prodej bytu).',
    ],
  },
  dailyTip3: {
    title: 'Inflace a kupní síla',
    paragraphs: [
      'Inflace znamená, že stejná částka peněz časem koupí méně zboží a služeb. Při 3 % ročně klesne reálná hodnota úspor výrazně za desetiletí — proto dlouhodobě držet vše jen na účtu s nulovým úrokem často znamená „tichou ztrátu“.',
      'Sto tisíc korun dnes při zjednodušeném modelu a 3 % inflaci zhruba odpovídá představě, že za deset let má podobnou sílu výrazně menší obnos — přesný výpočet závisí na skutečné inflaci a složeném efektu.',
      'Doplnění: nouzová rezerva patří na bezpečný účet bez ohledem na inflaci. Část nad rezervou může smysluplně směřovat podle horizontu a tolerance rizika (dluhopisy, podílové fondy, ETF).',
      'Chyba: kvůli strachu z trhu neinvestovat vůbec a zároveň nesledovat, zda úrok na spoření aspoň částečně drží krok s cenami.',
    ],
  },
  dailyTip4: {
    title: 'Nouzový fond',
    paragraphs: [
      'Nouzový fond je likvidní rezerva na neočekávané výdaje — výpadek příjmu, oprava auta, domácí spotřebič. Cíl bývá 3–6 měsíců běžných výdajů; u nestabilního příjmu spíš horní hranice.',
      'Peníze držte na spořicím účtu nebo jiném místě, kde je rychle vytáhnete bez velkých poplatků a bez nutnosti prodávat investice v špatný moment.',
      'Výši vypočítejte z měsíčních nákladů bez luxusů: nájem, jídlo, pojistky, léky. Automatický trvalý příkaz z každé výplaty fond postupně doplní.',
      'Chyba: fond „mít“ na investičním účtu ve akciích — při poklesu trhu a současné nouzi prodáváte se ztrátou. Druhá chyba je fond vybrat na běžné nákupy místo na skutečné nouze.',
    ],
  },
  dailyTip5: {
    title: 'Kreditní karta a cashback',
    paragraphs: [
      'Kreditní karta s bezúročným obdobím a cashbackem může znamenat drobnou slevu na běžných nákupech — pokud každý měsíc splatíte celý vyúčtovaný zůstatek a neplatíte zbytečné poplatky za vedení.',
      'Cashback 1 % z 15 000 Kč měsíčně je 150 Kč ročně 1 800 Kč — ne životní změna, ale při disciplíně jde o férový bonus. Sledujte podmínky (minimální obraty, výjimky u kategorií).',
      'Nastav si inkaso celé částky k datu splatnosti a limity výdajů, ať nepřešvihnete rozpočet kvůli „bodům“.',
      'Chyba: platit jen minimum a nechat zbytek úročit se 20–25 % ročně — cashback pak zcela ztratí smysl. Další chyba je brát kartu jako dodatečný příjem místo jako odloženou platbu z účtu.',
    ],
  },
  dailyTip6: {
    title: 'ETF a dlouhodobý výnos',
    paragraphs: [
      'ETF (burzovně obchodované fondy) často sledují široký index akcií nebo dluhopisů, mají nízké poplatky a nabízejí diverzifikaci. Historicky akciové trhy dlouhodobě rostly, ale s propady — výnos není garantovaný.',
      'Přibližná dlouhodobá očekávání u akcií bývají uváděna řádu jednotek až vyšších jednotek procent ročně v nominální rovině; záleží na období a indexu. Spořicí účet dnes může konkurovat krátkodobě, ale u horizontu 10+ let bývá role ETF jiná.',
      'Začněte malou pravidelnou částkou, jedním nebo dvěma širokými fondy a držte se plánu bez přehnaného přepínání.',
      'Chyba: kupovat úzké spekulativní ETF bez pochopení rizika nebo prodávat při každém poklesu. Druhá chyba — ignorovat poplatky brokera a fondu; i 0,5 % navíc se za desítky let projeví.',
    ],
  },
  dailyTip7: {
    title: 'Pojištění domácnosti',
    paragraphs: [
      'Pojištění domácnosti kryje typicky škody na vybavení vlivem ohně, vody, krádeže apod. Roční pojistné v řádu dvou tisíc korun často kryje majetek za statisíce — poměr rizika a ceny bývá výhodný.',
      'Zkontroluj limit pojistné částky a podmínky (např. pojištění elektroniky, sportovního vybavení). Podpojištění znamená, že při škodě nedostanete plnou náhradu.',
      'Srovnejte nabídky pojišťoven a jednou za čas aktualizujte hodnotu vybavení po větších nákupech.',
      'Chyba: spoléhat jen na pojištění „od bytu“ majitele, pokud jsi nájemník — často potřebujete vlastní smlouvu na své věci.',
    ],
  },
  dailyTip8: {
    title: 'OSVČ a rezerva na daně',
    paragraphs: [
      'U OSVČ nebo živnostníka často platíte daň z příjmu, sociální a zdravotní odvody z výsledku podnikání. Částka není srážková jako u zaměstnance — musíte si ji odkládat sami.',
      'Rezerva 25 % z každé přijaté platby je praktický start; u vyšších marží nebo po odečtu nákladů může být potřeba více. Ideálně mějte samostatný účet „daně a odvody“.',
      'Po roce vyúčtujte skutečnost s účetním nebo v daňovém přiznání a rezervu dorovnejte.',
      'Chyba: utratit vše a v dubnu nemít na odvod — vznikají úroky z prodlení a stres. Druhá chyba je zaměnit hrubý příjem za čistý zisk bez odečtu nákladů.',
    ],
  },
  dailyTip9: {
    title: 'Složené úročení',
    paragraphs: [
      'Složené úročení znamená, že výnosy se přičítají k jistině a další období už roste i „na starém“ výnosu. Čas a trpělivost jsou klíčové.',
      'Ilustrace: pravidelná měsíční investice při zjednodušeném předpokladu výnosu může za desítky let narůst na velmi velkou částku — reálný výsledek závisí na volatilitě, poplatcích a tom, zda plán skutečně držíte.',
      'Čím dřív začnete, tím déle funguje čas jako spojenec. I menší částka měsíčně je lepší než čekat na „ideální“ vstup.',
      'Chyba: přestat po roce, když trh klesne — právě pak DCA nakupuje levněji. Druhá chyba je očekávat plynulý růst každý rok.',
    ],
  },
  dailyTip10: {
    title: 'Srovnání pojištění',
    paragraphs: [
      'Pojistné trhy se mění — slevy, akce, nové produkty. Obnovení smlouvy bez kontroly často znamená, že platíte víc než konkurence.',
      'Každé dva roky si vyhraďte blok času: auto, majetek, odpovědnost. Použijte srovnávače, ale čtěte výluky a limity, ne jen cenu.',
      'Ušetřené tisíce korun ročně jsou běžné, pokud máte čisté škody a bonusy u současného pojistitele znovu vyhodnotíte.',
      'Chyba: přejít jen podle nejnižší ceny a snížit limity pod realitu (např. škody na zdraví).',
    ],
  },
  dailyTip11: {
    title: 'Havarijní pojištění',
    paragraphs: [
      'Havarijní pojištění kryje škody na vlastním vozidle (ne jen povinné ručení na škody na druhých). U novějších a dražších aut má smysl častěji; u starého vozu s nízkou hodnotou může být poměr cena/výplata nevýhodný.',
      'Orientačně se u vozů nad cca 200 000 Kč havarijní řeší častěji — záleží na tvojí schopnosti vozidlo nahradit z úspor a na riziku krádeže či nehody.',
      'Srovnejte spoluúčast, asistenční služby a výluky (např. závodění, opilost).',
      'Chyba: mít havarijní s vysokou spoluúčastí na starém autě, kde výplata při totálce stejně nestačí na náhradu.',
    ],
  },
  dailyTip12: {
    title: 'Spořicí účet a úrok',
    paragraphs: [
      'Když spořicí účet nabízí výraznější úrok (např. řád jednotek procent), nominální výnos z 100 000 Kč je řádově tisíce korun ročně před zdaněním podle aktuálních pravidel. Riziko jistiny u banky pod vklady do limitu pojištění je nízké.',
      'Sledujte podmínky (limit úročené částky, počet výběrů, propojení s běžným účtem).',
      'Využijte úrok pro nouzový fond a krátkodobé cíle; dlouhý horizont může stále směřovat i do investic.',
      'Chyba: zaměnit úrok za garanci výnosu nad inflací dlouhodobě — u dlouhých horizontů může být reálný růst stále pod tlakem cen.',
    ],
  },
  dailyTip13: {
    title: 'Nové vs. ojeté auto',
    paragraphs: [
      'Nové auto ztrácí hodnotu nejrychleji v prvních letech — část odpisů platíte hned po sjetí z showroomu. Ojeté auto tři roky staré často nabídne výrazně lepší poměr cena/stav než stejný model nový.',
      'Spočítejte celkovou cenu vlastnictví: pořizovací cena, pojištění, servis, spotřeba, úrok z úvěru.',
      'Ověřte historii ojetiny (servis, nehody) a nechte si doporučit mechanika.',
      'Chyba: koupit ojetinu jen podle nejnižší ceny bez kontroly VIN a servisní knihy. U nového zase s dlouhým úvěrem s vysokým RPSN.',
    ],
  },
  dailyTip14: {
    title: 'Hypotéka versus nájem',
    paragraphs: [
      'Vlastní bydlení buduje majetek, ale váže kapitál a nese riziko poklesu cen a nákladů na údržbu. Nájem nabízí flexibilitu, ale nebuduje vaši jistinu v nemovitosti.',
      'Při nízkých úrokových sazbách a delším horizontu často překlopí rozhodnutí ve prospěch koupě — typicky se hovoří o horizontech řadu let, ne měsíců; záleží na místních cenách nájmu a nemovitostí.',
      'Modelujte: splátka + fond oprav vs. nájem + spoření rozdílu do investic.',
      'Chyba: koupit „protože hypotéka je stejně jako nájem“ bez rezervy na opravy a bez právní kontroly smlouvy.',
    ],
  },
  dailyTip15: {
    title: 'Průměrování nákladů (DCA)',
    paragraphs: [
      'Dollar-cost averaging znamená investovat pravidelně stejnou částku bez ohledu na to, zda trh právě roste nebo klesá. Kupujete více podílů, když jsou levnější, méně když jsou drahé — psychologicky snáze udržíte disciplínu.',
      'Vyhnete se iluzi, že musíte trefit dno trhu. Čas na trhu bývá důležitější než načasování trhu.',
      'Nastav trvalý příkaz den nebo dva po výplatě.',
      'Chyba: při každém poklesu přestat a při růstu zvyšovat nárazově — proti spiritu DCA.',
    ],
  },
  dailyTip16: {
    title: 'Daňové odpočty',
    paragraphs: [
      'V ČR mohou mít vliv na daň např. úroky z úvěru na bydlení (za splnění podmínek), penzijní připojištění, příspěvky na životní pojištění, dary či sleva na dítě. Pravidla se mění — ověřte aktuální zákon nebo daňového poradce.',
      'Účtenky a potvrzení si ukládejte systematicky; část odpočtů vyžaduje smlouvy a výpisy.',
      'Ročně vyplňte přiznání nebo požádejte zaměstnavatele o roční zúčtování s přiloženými dokumenty.',
      'Chyba: platit za produkt jen kvůli odpočtu, aniž by smlouva sama o sobě dávala smysl.',
    ],
  },
  dailyTip17: {
    title: 'Penzijní připojištění a stát',
    paragraphs: [
      'U transformovaných fondů stát přispívá k vašim vkladům podle zákonných pravidel (výše příspěvku se mění — sledujte aktuální stav). Jde o podporu dlouhodobého spoření na stáří.',
      'Čím dříve začnete, tím déle se malé příspěvky skládají. Sledujte poplatky fondu a zaměření strategie.',
      'Státní příspěvek není „vše zdarma“ — podmínky výběru před důchodem jsou omezené; počítejte s horizontem.',
      'Chyba: nečerpat příspěvek, na který máš nárok, protože smlouva není přihlášená k daňové optimalizaci, pokud ti to vyhovuje.',
    ],
  },
  dailyTip18: {
    title: 'Předčasné splacení hypotéky',
    paragraphs: [
      'Každá mimořádná splátka snižuje jistinu a celkově zaplacený úrok — u dlouhých hypoték jde o statisíce. Musíte ale započítat poplatky za mimořádnou splátku nebo refinancování podle smlouvy.',
      'Porovnejte úrok hypotéky s očekávaným výnosem investice po zdanění — někdy má smysl investovat, jindy splácet; záleží na toleranci rizika.',
      'Část peněz nechte v nouzovém fondu i při splácení.',
      'Chyba: vybrat fond a zůstat bez rezervy jen kvůli jedné velké splátce.',
    ],
  },
  dailyTip19: {
    title: 'Pravidlo 48 hodin',
    paragraphs: [
      'U nákupů nad rozumnou hranici (např. 1 000 Kč) počkejte dvě dny. Mozek přestane reagovat jen na vzrušení z reklamy a stihnete zvážit, zda věc opravdu potřebujete.',
      'Napište si ji na seznam a vraťte se k ní po víkendu — často zjistíte, že touha pominula.',
      'U online nákupů odložte věc v košíku nebo použijte seznam přání.',
      'Chyba: pravidlo obcházet „malými“ nákupy po 999 Kč — součet stejně uškodí rozpočtu.',
    ],
  },
  dailyTip20: {
    title: 'Týden výdajů pod drobnohledem',
    paragraphs: [
      'Jeden týden zapisujte každý výdaj — hotovost, karta, předplatné. Bez soudu: jen fakta. Uvidíte skryté položky: kávy, aplikace, drobnosti z automatu.',
      'Použijte blok v kalendáři a na konci týdne sečtěte kategorie. Často stačí jedna změna (např. zrušit nepoužívané předplatné).',
      'Zapojte partnera, ať čísla sedí pro celou domácnost.',
      'Chyba: vzdát to po dvou dnech — neúplná data klamou víc než žádná.',
    ],
  },
  dailyTip21: {
    title: 'Úrok z kreditní karty',
    paragraphs: [
      'Revolverový úrok u karet bývá vysoký — řádově desítky procent ročně. Pokud necháte zůstatek z části splatnosti, úrok znehodnotí jakýkoli cashback.',
      'Nejspolehlivější strategie: zaplatit 100 % částky do data splatnosti. Nastav upomínku nebo inkaso.',
      'Pokud už dluh máte, seznamte se s metodou sněhové koule nebo laviny a soustřeďte přeplatek na nejdražší dluh.',
      'Chyba: brát výběr hotovosti z karty — často je ještě dražší než nákupy.',
    ],
  },
  dailyTip22: {
    title: 'Leasing a úvěr na auto',
    paragraphs: [
      'U leasingu často platíte vyšší celkovou cenu a vozidlo do konce smlouvy právně patří leasingové společnosti. U úvěru kupujete auto na své jméno a splácíte bance.',
      'Leasing může mít výhody pro podnikatele (účetnictví) — u soukromé osoby často vyhrává úvěr při porovnání RPSN a vlastnictví.',
      'Vždy čtěte odkupní cenu, nájezdové limity a pojistné povinnosti.',
      'Chyba: leasing brát jako „levnější splátku“ bez sečtení celkových nákladů na celou dobu.',
    ],
  },
  dailyTip23: {
    title: 'Indexové fondy a aktivní správa',
    paragraphs: [
      'Řada studií ukazuje, že široké indexy (např. S&P 500) dlouhodobě předčí velkou část aktivně spravovaných fondů po odečtení vyšších poplatků a chyb v načasování.',
      'Pasivní přístup neznamená žádná práce — volíte alokaci, pravidelně investujete a občas rebalancujete.',
      'Nízký poplatek fondu (TER) je jeden z mála faktorů pod tvojí kontrolou s velkým dopadem.',
      'Chyba: měnit strategii každý rok podle titulků v médiích.',
    ],
  },
  dailyTip24: {
    title: 'Kredit a hodnota věcí',
    paragraphs: [
      'Na úvěr dává smysl brát věci, které dlouhodobě přinášejí hodnotu (vzdělání, rozumné bydlení). Spotřební zboží, které rychle ztrácí cenu, na splátky s vysokým úrokem prodražujete.',
      'Před nákupem se zeptejte: „Kolik to bude stát za rok včetně úroků?“ a „Můžu počkat a naspořit?“',
      'Oddělte nutnost a prestiž.',
      'Chyba: konsolidovat levné půjčky do jedné bez změny chování — dluh znovu naroste.',
    ],
  },
  dailyTip25: {
    title: 'Kdy řešit životní pojištění',
    paragraphs: [
      'Životní pojištění chrání blízké při úmrtí nebo invaliditě — nejvíc dává smysl, když na vás někdo finančně závisí, nebo když držíte velký dluh (hypotéka).',
      'Bez závazků a závislých osob často stačí pojistka odpovědnosti a zdravotní pojištění podle zákona.',
      'Sjednávejte krytí podle skutečné potřeby, ne podle tlaku obchodníka.',
      'Chyba: kombinované pojistky s velkou investiční složkou bez porozumění poplatkům.',
    ],
  },
  dailyTip26: {
    title: 'Nájemní výnos z nemovitosti',
    paragraphs: [
      'Hrubý výnos z nájmu je poměr ročního nájmu k pořizovací ceně; čistý výnos odečítá daně, opravy, neobsazenost a správu. V ČR bývají uváděny hrubé řády několika procent ročně po nákladech — silně záleží na lokalitě.',
      'Pořizovací cena plus rekonstrukce musí dávat smysl vůči alternativám (ETF, dluhopisy) a tvojí časové náročnosti.',
      'Počítejte s fondem na opravy a změnami legislativy (např. nájemní smlouvy).',
      'Chyba: koupit byt jen proto, že „nemovitost nikdy neklesne“.',
    ],
  },
  dailyTip27: {
    title: 'Poplatky podílových fondů',
    paragraphs: [
      'Roční poplatek fondu (např. 2 % z majetku) se strhává tiše každý rok. Při dlouhém horizontu sníží konečný výrazně — součet s výkonností není lineární, ale vliv je velký.',
      'Srovnejte TER u ETF a podílových fondů; často rozdíl 1–1,5 % p.a. znamená statisíce za život.',
      'Poplatky za vstup/výstup ještě zhoršují situaci.',
      'Chyba: sledovat jen minulou výkonnost a ignorovat náklady.',
    ],
  },
  dailyTip28: {
    title: 'Spoření pro dítě',
    paragraphs: [
      'Pravidelná částka od narození v kombinaci s jistým výnosem může do dospělosti vytvořit výraznou rezervu na vzdělání nebo start v životě — přesná částka závisí na úroku a inflaci.',
      'Zvažte daňové a právní hledisko (čí účet, kdo je vlastník, kdy má dítě dispozici).',
      'Mix bezpečného účtu a dlouhodobé investice podle horizontu.',
      'Chyba: vše držet v hotovosti doma kvůli nule rizika — ztrácí kupní sílu.',
    ],
  },
  dailyTip29: {
    title: 'Prodloužená záruka',
    paragraphs: [
      'Prodejci často nabízejí extended warranty za příplatek. Statisticky většina poruch nastane buď brzy (v záruce výrobce), nebo až po době, kdy prodloužená záruha už neplatí, nebo se na ni nevztahuje.',
      'Spočítejte cenu pojištění vs. cenu případné opravy a pravděpodobnost.',
      'Evropská zákonná záruka vám dává základní ochranu; reklamace řešte včas.',
      'Chyba: koupit prodlouženou záruhu pod tlakem u pokladny bez čtení výjimek.',
    ],
  },
  dailyTip30: {
    title: 'Finanční svoboda',
    paragraphs: [
      'Finanční svoboda obvykle znamená, že pasivní příjmy (nájmy, dividendy, úroky, podíly na firmě) pokrývají tvoje běžné výdaje — nemusíte pracovat na plný úvazek pro přežití. Pro každého je číslo jiné.',
      'Spočítejte měsíční nutné výdaje a mějte cíl: kolik majetku při konzervativním výnosu generuje podobnou částku.',
      'Cesta vede přes snižování dluhů, zvyšování příjmů, spoření a investice po desetiletí.',
      'Chyba: čekat na „dokonalý plán“ — začít s malým pravidelným krokem je lepší než nic.',
    ],
  },
};

export function getDailyTipArticle(key: DailyTipKey): DailyTipArticle {
  return DAILY_TIP_ARTICLES[key];
}
