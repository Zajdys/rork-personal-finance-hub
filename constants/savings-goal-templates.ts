export type SavingsGoalTemplate = {
  id: string;
  emoji: string;
  name: string;
  suggestedTarget: number;
  color: string;
};

export const SAVINGS_GOAL_TEMPLATES: SavingsGoalTemplate[] = [
  { id: 'holiday', emoji: '🏖️', name: 'Dovolená', suggestedTarget: 30000, color: '#0EA5E9' },
  { id: 'car', emoji: '🚗', name: 'Auto', suggestedTarget: 150000, color: '#6366F1' },
  { id: 'housing', emoji: '🏠', name: 'Bydlení / záloha', suggestedTarget: 50000, color: '#8B5CF6' },
  { id: 'emergency', emoji: '💊', name: 'Nouzový fond', suggestedTarget: 80000, color: '#10B981' },
  { id: 'electronics', emoji: '📱', name: 'Elektronika', suggestedTarget: 25000, color: '#F59E0B' },
  { id: 'education', emoji: '🎓', name: 'Vzdělání', suggestedTarget: 20000, color: '#EC4899' },
];

export const SAVINGS_GOAL_EMOJI_OPTIONS = [
  '🏖️',
  '🚗',
  '🏠',
  '💊',
  '📱',
  '🎓',
  '💰',
  '✈️',
  '🎁',
  '👶',
  '🐕',
  '⚽',
  '🎮',
  '💻',
];

export const SAVINGS_GOAL_COLOR_OPTIONS = [
  '#0EA5E9',
  '#6366F1',
  '#8B5CF6',
  '#10B981',
  '#14B8A6',
  '#F59E0B',
  '#EF4444',
  '#EC4899',
  '#84CC16',
  '#64748B',
];
