/**
 * Anglická verze článků k dennímu tipu (struktura 1:1 s daily-tip-articles.ts).
 */
import type { DailyTipKey } from './daily-tip-keys';
import type { DailyTipArticle } from './daily-tip-articles';

export const DAILY_TIP_ARTICLES_EN: Record<DailyTipKey, DailyTipArticle> = {
  dailyTip1: {
    title: 'The 50/30/20 rule',
    paragraphs: [
      'The 50/30/20 rule splits your net income into three parts: roughly 50 % for needs (housing, food, transport, basic services), 30 % for wants and fun, and 20 % for savings, investing and paying off debt beyond the minimum payments. It isn’t dogma — just a simple framework that helps you keep track.',
      'Example: with a net income of 40,000 Kč a month you aim for 20,000 Kč on needs, 12,000 Kč on leisure and 8,000 Kč on the future. When needs eat up more than half, it’s a signal to check your rent, energy or fixed payments.',
      'Start with a month in which you simply record your real spending. Then cut one area (say “fun”) by a few percent and send the money automatically to a savings account or investment right after payday.',
      'A common mistake is ignoring irregular expenses (car service, holidays). Count them as a monthly reserve. Another mistake is “saving” 20 % while carrying an expensive revolving balance on a credit card — it often makes sense to pay off high-interest debt first.',
    ],
  },
  dailyTip2: {
    title: 'Refinancing a mortgage',
    paragraphs: [
      'Refinancing means taking a new mortgage (or changing the terms with your current bank) to get a lower interest rate, a different fixation period or to consolidate. With amounts in the millions of crowns, even tenths of a percent a year add up to tens or hundreds of thousands over the loan term.',
      'Typically 3–6 months before your fixation ends, start comparing offers and lock in a rate if the bank allows it in advance. Also count fees for valuation, administration and any surcharges.',
      'Write down the remaining principal, fixation length, APR and early-repayment penalties of your current contract. Without these numbers you can’t compare competitors fairly.',
      'Mistake: switching just for the lowest rate without reading early-repayment terms or without considering the fixation length against your plans (e.g. selling the flat).',
    ],
  },
  dailyTip3: {
    title: 'Inflation and purchasing power',
    paragraphs: [
      'Inflation means the same amount of money buys fewer goods and services over time. At 3 % a year the real value of savings drops noticeably over a decade — so keeping everything long-term in an account with zero interest often means a “silent loss”.',
      'In a simplified model with 3 % inflation, a hundred thousand crowns today will buy noticeably less in ten years — the exact figure depends on actual inflation and the compounding effect.',
      'Note: an emergency fund belongs in a safe account regardless of inflation. Money above the reserve can sensibly go elsewhere depending on your horizon and risk tolerance (bonds, mutual funds, ETFs).',
      'Mistake: not investing at all out of fear of the market, while not checking whether your savings interest at least partly keeps up with prices.',
    ],
  },
  dailyTip4: {
    title: 'Emergency fund',
    paragraphs: [
      'An emergency fund is a liquid reserve for unexpected costs — loss of income, a car repair, a broken appliance. The goal is usually 3–6 months of regular expenses; with an unstable income aim for the upper end.',
      'Keep the money in a savings account or somewhere you can withdraw it quickly without big fees and without having to sell investments at a bad moment.',
      'Base the amount on your monthly costs without luxuries: rent, food, insurance, medicine. A standing order from every paycheck will gradually fill the fund.',
      'Mistake: “keeping” the fund in shares on an investment account — when the market drops and you need the money at the same time, you sell at a loss. Another mistake is dipping into the fund for everyday shopping instead of real emergencies.',
    ],
  },
  dailyTip5: {
    title: 'Credit cards and cashback',
    paragraphs: [
      'A credit card with an interest-free period and cashback can give you a small discount on everyday purchases — as long as you pay off the full statement balance every month and don’t pay unnecessary account fees.',
      '1 % cashback on 15,000 Kč a month is 150 Kč, or 1,800 Kč a year — not life-changing, but a fair bonus if you’re disciplined. Watch the conditions (minimum turnover, category exclusions).',
      'Set up a direct debit for the full amount on the due date and spending limits, so you don’t overshoot your budget because of “points”.',
      'Mistake: paying only the minimum and letting the rest accrue 20–25 % interest a year — the cashback then makes no sense at all. Another mistake is treating the card as extra income rather than a deferred payment from your account.',
    ],
  },
  dailyTip6: {
    title: 'ETFs and long-term returns',
    paragraphs: [
      'ETFs (exchange-traded funds) often track a broad stock or bond index, have low fees and offer diversification. Historically stock markets have grown over the long term, but with drops along the way — returns are not guaranteed.',
      'Long-term expectations for stocks are usually quoted in the range of a few to several percent a year in nominal terms; it depends on the period and the index. A savings account may compete in the short term, but over a 10+ year horizon ETFs play a different role.',
      'Start with a small regular amount and one or two broad funds, and stick to the plan without switching too often.',
      'Mistake: buying narrow speculative ETFs without understanding the risk, or selling at every dip. Another mistake — ignoring broker and fund fees; even an extra 0.5 % adds up over decades.',
    ],
  },
  dailyTip7: {
    title: 'Home contents insurance',
    paragraphs: [
      'Home contents insurance typically covers damage to your belongings from fire, water, theft and so on. An annual premium of around two thousand crowns often covers property worth hundreds of thousands — the risk-to-price ratio tends to be good.',
      'Check the sum insured and the conditions (e.g. cover for electronics, sports gear). Underinsurance means you won’t get full compensation when something happens.',
      'Compare insurers’ offers and update the value of your belongings after bigger purchases from time to time.',
      'Mistake: relying only on the landlord’s building insurance if you rent — you often need your own policy for your things.',
    ],
  },
  dailyTip8: {
    title: 'Self-employed: a tax reserve',
    paragraphs: [
      'When self-employed you usually pay income tax plus social and health insurance on your business profit. Unlike an employee, nothing is deducted automatically — you have to set it aside yourself.',
      'Putting aside 25 % of every payment received is a practical start; with higher margins or after deducting costs you may need more. Ideally keep a separate “taxes and contributions” account.',
      'After the year, settle the real figures with your accountant or in your tax return and top up the reserve.',
      'Mistake: spending everything and having nothing to pay in April — you get late-payment interest and stress. Another mistake is confusing gross income with net profit without deducting costs.',
    ],
  },
  dailyTip9: {
    title: 'Compound interest',
    paragraphs: [
      'Compound interest means returns are added to the principal, so in the next period you also earn on the “old” returns. Time and patience are key.',
      'Illustration: a regular monthly investment with a simplified return assumption can grow into a very large sum over decades — the real result depends on volatility, fees and whether you actually stick to the plan.',
      'The sooner you start, the longer time works on your side. Even a small monthly amount beats waiting for the “perfect” entry.',
      'Mistake: stopping after a year when the market falls — that’s exactly when DCA buys cheaper. Another mistake is expecting smooth growth every year.',
    ],
  },
  dailyTip10: {
    title: 'Comparing insurance',
    paragraphs: [
      'Insurance markets change — discounts, promotions, new products. Renewing a policy without checking often means you pay more than with a competitor.',
      'Every two years block out some time: car, property, liability. Use comparison sites, but read the exclusions and limits, not just the price.',
      'Saving thousands of crowns a year is common if you have a clean claims history and re-evaluate the bonuses at your current insurer.',
      'Mistake: switching only by the lowest price and cutting limits below reality (e.g. personal injury).',
    ],
  },
  dailyTip11: {
    title: 'Comprehensive car insurance',
    paragraphs: [
      'Comprehensive (casco) insurance covers damage to your own vehicle (not just mandatory third-party liability). It makes more sense for newer and more expensive cars; for an old car with low value the price-to-payout ratio may be poor.',
      'As a rough guide, comprehensive cover is considered more often for cars worth over about 200,000 Kč — it depends on whether you could replace the car from savings and on the risk of theft or an accident.',
      'Compare the deductible, assistance services and exclusions (e.g. racing, drunk driving).',
      'Mistake: having comprehensive cover with a high deductible on an old car, where the payout after a total loss wouldn’t replace it anyway.',
    ],
  },
  dailyTip12: {
    title: 'Savings accounts and interest',
    paragraphs: [
      'When a savings account offers a decent rate (e.g. a few percent), the nominal return on 100,000 Kč is in the thousands of crowns a year before tax under current rules. The risk to the principal for deposits within the insured limit is low.',
      'Watch the conditions (limit on the interest-bearing amount, number of withdrawals, link to a current account).',
      'Use the interest for your emergency fund and short-term goals; a long horizon can still go into investments.',
      'Mistake: treating interest as a guarantee of beating inflation in the long run — over long horizons real growth can still be squeezed by prices.',
    ],
  },
  dailyTip13: {
    title: 'New vs. used car',
    paragraphs: [
      'A new car loses value fastest in its first years — you pay part of the depreciation the moment you drive it off the lot. A three-year-old used car often offers a much better price-to-condition ratio than the same model new.',
      'Calculate the total cost of ownership: purchase price, insurance, servicing, fuel and loan interest.',
      'Check the used car’s history (service, accidents) and have a mechanic look at it.',
      'Mistake: buying a used car only by the lowest price without checking the VIN and service book. With a new car — taking a long loan with a high APR.',
    ],
  },
  dailyTip14: {
    title: 'Mortgage vs. renting',
    paragraphs: [
      'Owning your home builds wealth, but ties up capital and carries the risk of falling prices and maintenance costs. Renting offers flexibility, but doesn’t build your equity in a property.',
      'With low interest rates and a longer horizon, the decision often tips towards buying — usually over many years, not months; it depends on local rents and property prices.',
      'Model it: mortgage payment + repair fund vs. rent + investing the difference.',
      'Mistake: buying “because the mortgage is the same as rent” without a reserve for repairs and without a legal check of the contract.',
    ],
  },
  dailyTip15: {
    title: 'Dollar-cost averaging (DCA)',
    paragraphs: [
      'Dollar-cost averaging means investing the same amount regularly, whether the market is rising or falling. You buy more units when they’re cheaper and fewer when they’re expensive — psychologically it’s easier to stay disciplined.',
      'You avoid the illusion that you have to catch the bottom of the market. Time in the market usually matters more than timing the market.',
      'Set up a standing order a day or two after payday.',
      'Mistake: stopping at every dip and investing extra lump sums when prices rise — against the spirit of DCA.',
    ],
  },
  dailyTip16: {
    title: 'Tax deductions',
    paragraphs: [
      'In the Czech Republic your tax can be affected by e.g. interest on a housing loan (if conditions are met), supplementary pension savings, life insurance contributions, donations or the child tax credit. The rules change — check the current law or ask a tax adviser.',
      'Keep receipts and certificates systematically; some deductions require contracts and statements.',
      'Each year file a tax return or ask your employer for the annual settlement with the documents attached.',
      'Mistake: paying for a product just for the deduction, when the contract itself doesn’t make sense.',
    ],
  },
  dailyTip17: {
    title: 'Supplementary pension savings and state support',
    paragraphs: [
      'With supplementary pension savings the state contributes to your deposits according to the law (the amount changes — check the current rules). It supports long-term saving for retirement.',
      'The sooner you start, the longer small contributions compound. Watch the fund’s fees and its investment strategy.',
      'The state contribution isn’t “all free” — early withdrawals before retirement are restricted; plan for the long horizon.',
      'Mistake: not claiming a contribution you’re entitled to because the contract isn’t set up properly, if it suits you.',
    ],
  },
  dailyTip18: {
    title: 'Paying off a mortgage early',
    paragraphs: [
      'Every extra payment reduces the principal and the total interest paid — on long mortgages that’s hundreds of thousands. But you need to factor in fees for extra payments or refinancing under your contract.',
      'Compare the mortgage rate with the expected after-tax return of an investment — sometimes investing makes sense, sometimes paying off; it depends on your risk tolerance.',
      'Keep part of the money in your emergency fund even while paying off.',
      'Mistake: emptying the fund and being left without a reserve just for one big payment.',
    ],
  },
  dailyTip19: {
    title: 'The 48-hour rule',
    paragraphs: [
      'For purchases above a reasonable threshold (e.g. 1,000 Kč) wait two days. Your brain stops reacting only to the excitement of the ad and you have time to consider whether you really need it.',
      'Put it on a list and come back to it after the weekend — you’ll often find the urge has passed.',
      'When shopping online, leave the item in the basket or use a wish list.',
      'Mistake: getting around the rule with “small” purchases of 999 Kč — added up they still hurt your budget.',
    ],
  },
  dailyTip20: {
    title: 'A week of spending under the microscope',
    paragraphs: [
      'For one week, record every expense — cash, card, subscriptions. No judgement: just facts. You’ll see the hidden items: coffees, apps, vending-machine snacks.',
      'Block time in your calendar and add up the categories at the end of the week. Often one change is enough (e.g. cancelling an unused subscription).',
      'Involve your partner so the numbers add up for the whole household.',
      'Mistake: giving up after two days — incomplete data is more misleading than none.',
    ],
  },
  dailyTip21: {
    title: 'Credit card interest',
    paragraphs: [
      'Revolving interest on credit cards tends to be high — tens of percent a year. If you leave part of the balance unpaid after the due date, the interest wipes out any cashback.',
      'The most reliable strategy: pay 100 % of the balance by the due date. Set a reminder or a direct debit.',
      'If you already have debt, look into the snowball or avalanche method and put any extra money towards the most expensive debt.',
      'Mistake: withdrawing cash with a credit card — it’s often even more expensive than purchases.',
    ],
  },
  dailyTip22: {
    title: 'Car leasing vs. a car loan',
    paragraphs: [
      'With leasing you often pay a higher total price and the car legally belongs to the leasing company until the contract ends. With a loan you buy the car in your own name and repay the bank.',
      'Leasing can have advantages for businesses (accounting) — for private individuals a loan often wins when you compare APR and ownership.',
      'Always read the buyout price, mileage limits and insurance obligations.',
      'Mistake: taking a lease as a “cheaper payment” without adding up the total costs over the whole term.',
    ],
  },
  dailyTip23: {
    title: 'Index funds vs. active management',
    paragraphs: [
      'Many studies show that broad indices (e.g. the S&P 500) outperform a large share of actively managed funds over the long term, after higher fees and timing mistakes.',
      'A passive approach doesn’t mean zero work — you choose an allocation, invest regularly and rebalance now and then.',
      'A low fund fee (TER) is one of the few factors under your control with a big impact.',
      'Mistake: changing strategy every year based on media headlines.',
    ],
  },
  dailyTip24: {
    title: 'Credit and the value of things',
    paragraphs: [
      'Borrowing makes sense for things that bring long-term value (education, sensible housing). Consumer goods that lose value quickly only get more expensive on high-interest instalments.',
      'Before buying, ask: “How much will this cost in a year including interest?” and “Can I wait and save up?”',
      'Separate need from prestige.',
      'Mistake: consolidating cheap loans into one without changing your behaviour — the debt grows again.',
    ],
  },
  dailyTip25: {
    title: 'When to think about life insurance',
    paragraphs: [
      'Life insurance protects your loved ones in case of death or disability — it makes most sense when someone depends on you financially or when you carry a large debt (a mortgage).',
      'Without commitments or dependants, liability insurance and statutory health insurance are often enough.',
      'Arrange cover based on real needs, not on a salesperson’s pressure.',
      'Mistake: combined policies with a large investment component without understanding the fees.',
    ],
  },
  dailyTip26: {
    title: 'Rental yield from property',
    paragraphs: [
      'Gross rental yield is the annual rent divided by the purchase price; net yield deducts taxes, repairs, vacancies and management. In the Czech Republic yields are often quoted at a few percent a year after costs — it depends heavily on the location.',
      'The purchase price plus renovation must make sense against alternatives (ETFs, bonds) and the time it takes you.',
      'Plan for a repair fund and changes in legislation (e.g. tenancy agreements).',
      'Mistake: buying a flat just because “property never goes down”.',
    ],
  },
  dailyTip27: {
    title: 'Mutual fund fees',
    paragraphs: [
      'An annual fund fee (e.g. 2 % of assets) is deducted quietly every year. Over a long horizon it significantly reduces the final amount — the interaction with performance isn’t linear, but the effect is large.',
      'Compare the TER of ETFs and mutual funds; a difference of 1–1.5 % a year often means hundreds of thousands over a lifetime.',
      'Entry and exit fees make things even worse.',
      'Mistake: looking only at past performance and ignoring costs.',
    ],
  },
  dailyTip28: {
    title: 'Saving for a child',
    paragraphs: [
      'A regular amount from birth combined with some return can build a significant reserve for education or a start in life by adulthood — the exact amount depends on interest and inflation.',
      'Consider the tax and legal side (whose account it is, who owns it, when the child gets access).',
      'Mix a safe account with long-term investments depending on the horizon.',
      'Mistake: keeping everything in cash at home for zero risk — it loses purchasing power.',
    ],
  },
  dailyTip29: {
    title: 'Extended warranties',
    paragraphs: [
      'Retailers often offer an extended warranty for an extra fee. Statistically, most faults happen either early (under the manufacturer’s warranty) or after the extended warranty has expired or doesn’t apply.',
      'Compare the price of the cover with the cost of a possible repair and its probability.',
      'The EU statutory warranty gives you basic protection; make claims in time.',
      'Mistake: buying an extended warranty under pressure at the checkout without reading the exclusions.',
    ],
  },
  dailyTip30: {
    title: 'Financial freedom',
    paragraphs: [
      'Financial freedom usually means your passive income (rent, dividends, interest, business shares) covers your regular expenses — you don’t have to work full-time to get by. The number is different for everyone.',
      'Calculate your essential monthly expenses and set a goal: how much wealth at a conservative return generates a similar amount.',
      'The path leads through reducing debt, increasing income, saving and investing over decades.',
      'Mistake: waiting for the “perfect plan” — starting with a small regular step is better than nothing.',
    ],
  },
};
