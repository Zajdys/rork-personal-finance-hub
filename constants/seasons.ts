import { Season } from '@/types/gaming';

export const SEASONS: Season[] = [
  {
    id: 'season_2025_q1',
    name: 'Jarní úklid financí',
    theme: 'spring_clean',
    description: 'Očisti svůj rozpočet a srovnej výdaje',
    startDate: new Date('2025-01-01'),
    endDate: new Date('2025-03-31'),
    quests: [
      'spring_review_expenses',
      'spring_cancel_subscriptions',
      'spring_optimize_budget',
      'spring_debt_reduction',
    ],
    rewards: {
      top1Percent: {
        badgeId: 'spring_legend',
        avatarFrame: 'spring_gold_frame',
      },
      top5Percent: {
        badgeId: 'spring_master',
      },
      top10Percent: {
        badgeId: 'spring_champion',
      },
    },
  },
  {
    id: 'season_2025_q2',
    name: 'Letní spořicí vlna',
    theme: 'summer_save',
    description: 'Spořicí výzvy a minimální zbytečné výdaje',
    startDate: new Date('2025-04-01'),
    endDate: new Date('2025-06-30'),
    quests: [
      'summer_save_challenge',
      'summer_no_impulse',
      'summer_emergency_fund',
      'summer_vacation_budget',
    ],
    rewards: {
      top1Percent: {
        badgeId: 'summer_legend',
        avatarFrame: 'summer_gold_frame',
      },
      top5Percent: {
        badgeId: 'summer_master',
      },
      top10Percent: {
        badgeId: 'summer_champion',
      },
    },
  },
  {
    id: 'season_2025_q3',
    name: 'Podzimní investice',
    theme: 'invest_autumn',
    description: 'DCA a diverzifikace portfolia',
    startDate: new Date('2025-07-01'),
    endDate: new Date('2025-09-30'),
    quests: [
      'autumn_start_investing',
      'autumn_dca_strategy',
      'autumn_diversify',
      'autumn_learn_investing',
    ],
    rewards: {
      top1Percent: {
        badgeId: 'autumn_legend',
        avatarFrame: 'autumn_gold_frame',
      },
      top5Percent: {
        badgeId: 'autumn_master',
      },
      top10Percent: {
        badgeId: 'autumn_champion',
      },
    },
  },
  {
    id: 'season_2025_q4',
    name: 'Zimní štít',
    theme: 'winter_shield',
    description: 'Tvorba rezervy, pojištění, plánování na rok',
    startDate: new Date('2025-10-01'),
    endDate: new Date('2025-12-31'),
    quests: [
      'winter_insurance_review',
      'winter_year_planning',
      'winter_tax_optimization',
      'winter_emergency_fund',
    ],
    rewards: {
      top1Percent: {
        badgeId: 'winter_legend',
        avatarFrame: 'winter_gold_frame',
      },
      top5Percent: {
        badgeId: 'winter_master',
      },
      top10Percent: {
        badgeId: 'winter_champion',
      },
    },
  },
  {
    id: 'season_2026_q1',
    name: 'Jarní úklid financí 2026',
    theme: 'spring_clean',
    description: 'Očisti svůj rozpočet a srovnej výdaje na nový rok',
    startDate: new Date('2026-01-01'),
    endDate: new Date('2026-03-31'),
    quests: [
      'spring_review_expenses',
      'spring_cancel_subscriptions',
      'spring_optimize_budget',
      'spring_debt_reduction',
    ],
    rewards: {
      top1Percent: {
        badgeId: 'spring_legend',
        avatarFrame: 'spring_gold_frame',
      },
      top5Percent: {
        badgeId: 'spring_master',
      },
      top10Percent: {
        badgeId: 'spring_champion',
      },
    },
  },
  {
    id: 'season_2026_q2',
    name: 'Letní spořicí vlna 2026',
    theme: 'summer_save',
    description: 'Spořicí výzvy a minimální zbytečné výdaje',
    startDate: new Date('2026-04-01'),
    endDate: new Date('2026-06-30'),
    quests: [
      'summer_save_challenge',
      'summer_no_impulse',
      'summer_emergency_fund',
      'summer_vacation_budget',
    ],
    rewards: {
      top1Percent: {
        badgeId: 'summer_legend',
        avatarFrame: 'summer_gold_frame',
      },
      top5Percent: {
        badgeId: 'summer_master',
      },
      top10Percent: {
        badgeId: 'summer_champion',
      },
    },
  },
  {
    id: 'season_2026_q3',
    name: 'Podzimní investice 2026',
    theme: 'invest_autumn',
    description: 'DCA a diverzifikace portfolia',
    startDate: new Date('2026-07-01'),
    endDate: new Date('2026-09-30'),
    quests: [
      'autumn_start_investing',
      'autumn_dca_strategy',
      'autumn_diversify',
      'autumn_learn_investing',
    ],
    rewards: {
      top1Percent: {
        badgeId: 'autumn_legend',
        avatarFrame: 'autumn_gold_frame',
      },
      top5Percent: {
        badgeId: 'autumn_master',
      },
      top10Percent: {
        badgeId: 'autumn_champion',
      },
    },
  },
  {
    id: 'season_2026_q4',
    name: 'Zimní štít 2026',
    theme: 'winter_shield',
    description: 'Tvorba rezervy, pojištění, plánování na rok',
    startDate: new Date('2026-10-01'),
    endDate: new Date('2026-12-31'),
    quests: [
      'winter_insurance_review',
      'winter_year_planning',
      'winter_tax_optimization',
      'winter_emergency_fund',
    ],
    rewards: {
      top1Percent: {
        badgeId: 'winter_legend',
        avatarFrame: 'winter_gold_frame',
      },
      top5Percent: {
        badgeId: 'winter_master',
      },
      top10Percent: {
        badgeId: 'winter_champion',
      },
    },
  },
];

export function getCurrentSeason(): Season | undefined {
  const now = new Date();
  return SEASONS.find(season => {
    return now >= season.startDate && now <= season.endDate;
  });
}

export function getSeasonProgress(season: Season): number {
  const now = new Date();
  const total = season.endDate.getTime() - season.startDate.getTime();
  const elapsed = now.getTime() - season.startDate.getTime();
  return Math.min(100, Math.max(0, (elapsed / total) * 100));
}
