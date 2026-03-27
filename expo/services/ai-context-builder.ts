import { useLifeEvent } from '@/store/life-event-store';
import { useFinanceStore } from '@/store/finance-store';
import { LifeEventMode, LifeEventAIContext } from '@/types/life-event';

export interface AIContextMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export function useAIContextWithLifeEvent() {
  const { state, getAIContext } = useLifeEvent();
  const finance = useFinanceStore();

  const buildSystemMessage = (): AIContextMessage => {
    if (state.activeMode === LifeEventMode.NONE) {
      return {
        role: 'system',
        content: 'You are a financial advisor helping users manage their finances. Provide general financial advice and recommendations.',
      };
    }

    const aiContext = getAIContext({
      metrics: {
        totalIncome: finance.totalIncome,
        totalExpenses: finance.totalExpenses,
        balance: finance.balance,
        savingsRate: ((finance.totalIncome - finance.totalExpenses) / finance.totalIncome) * 100,
      },
    });

    const contextInfo = getContextInfoForMode(state.activeMode, aiContext);

    return {
      role: 'system',
      content: contextInfo,
    };
  };

  return {
    buildSystemMessage,
    activeMode: state.activeMode,
    isLifeEventActive: state.activeMode !== LifeEventMode.NONE,
  };
}

function getContextInfoForMode(mode: LifeEventMode, context: LifeEventAIContext): string {
  const baseInfo = `You are a financial advisor. The user is currently in "${mode}" life-event mode (active for ${context.modeActiveDays} days).`;

  switch (mode) {
    case LifeEventMode.MOVING:
      return `${baseInfo}

CONTEXT: The user is planning or executing a move.

FOCUS AREAS:
- Help track moving costs and equipment expenses
- Provide cashflow forecasts for next 3 months
- Suggest ways to save on furnishing and setup
- Remind about setting aside emergency funds for unexpected moving costs
- Consider deposit requirements for new rental

RECOMMENDATIONS:
- Set aside 15-20k CZK for moving costs
- Budget 50-70k CZK for new household equipment
- Keep 20-30k CZK emergency buffer
- Track all moving-related expenses separately
- Look for second-hand furniture and equipment deals

When giving advice, always consider the user's moving situation and the associated financial pressures.`;

    case LifeEventMode.CHILD:
      return `${baseInfo}

CONTEXT: The user is expecting a baby or has a young child.

FOCUS AREAS:
- Monitor burn-rate increase (monthly spending growth)
- Provide recommendations for child-related purchases
- Help plan for parental leave income changes
- Alert about available child benefits and support programs
- Budget for childcare, diapers, clothes, and medical needs

RECOMMENDATIONS:
- Set aside 40-50k CZK for baby equipment
- Build 80-100k CZK buffer for parental leave period
- Budget 8-10k CZK monthly for child expenses
- Reserve 5k CZK for healthcare and emergencies
- Research and apply for child allowances and benefits

When giving advice, prioritize family financial stability and long-term planning.`;

    case LifeEventMode.MORTGAGE:
      return `${baseInfo}

CONTEXT: The user has or is planning to get a mortgage.

FOCUS AREAS:
- Track mortgage payments and interest rates
- Alert before fixation period ends (6 months advance)
- Calculate potential savings from early repayments
- Compare refinancing options when beneficial
- Monitor property-related expenses (insurance, repairs)

RECOMMENDATIONS:
- Budget 18-20k CZK monthly for mortgage payments
- Build 100k+ CZK for potential early repayment
- Maintain 30k CZK repair fund
- Keep 3.5k CZK annual budget for property insurance
- Review mortgage terms annually

When giving advice, focus on long-term property ownership costs and optimization strategies.`;

    default:
      return `${baseInfo} Provide general financial advice.`;
  }
}

export function useEnrichedAIMessages(messages: AIContextMessage[]): AIContextMessage[] {
  const { buildSystemMessage } = useAIContextWithLifeEvent();
  const systemMessage = buildSystemMessage();

  const hasSystemMessage = messages.some(m => m.role === 'system');

  if (hasSystemMessage) {
    return messages.map(m => (m.role === 'system' ? systemMessage : m));
  }

  return [systemMessage, ...messages];
}
