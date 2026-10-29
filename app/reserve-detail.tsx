import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Redirect } from 'expo-router';
import { useAuth } from '@/store/auth-store';
import { fetchSavingsGoals } from '@/lib/supabase-plan';
import { migrateLocalPlanDataToSupabase } from '@/lib/supabase-plan';
import { useTheme } from '@/hooks/use-theme';

/** Legacy rezerva → emergency_fund v Plánu */
export default function ReserveDetailRedirect() {
  const { user } = useAuth();
  const { colors } = useTheme();
  const [goalId, setGoalId] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user?.id) {
        setGoalId(null);
        return;
      }
      await migrateLocalPlanDataToSupabase(user.id);
      const goals = await fetchSavingsGoals(user.id);
      const ef = goals.find((g) => g.kind === 'emergency_fund');
      if (!cancelled) setGoalId(ef?.id ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  if (goalId === undefined) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }
  if (goalId) {
    return <Redirect href={{ pathname: '/plan-goal-detail', params: { id: goalId } }} />;
  }
  return <Redirect href="/(tabs)/plan" />;
}
