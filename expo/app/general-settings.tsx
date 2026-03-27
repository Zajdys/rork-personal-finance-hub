import React, { useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Stack } from 'expo-router';
import { 
  Smartphone, 
  Download, 
  Trash2, 
  RefreshCw,
  Database,
  ChevronRight,
  LayoutGrid
} from 'lucide-react-native';

import { useFinanceStore, FinancialGoal } from '@/store/finance-store';

const GOAL_TEMPLATES = [
  {
    id: 'starter',
    title: 'Startér',
    desc: 'Rychlý rozjezd se základní rezervou',
    color: '#10B981',
    goals: [
      { title: 'Rezerva 20 000 Kč', targetAmount: 20000, category: 'Spoření', type: 'saving' as const },
      { title: 'Dovolená', targetAmount: 30000, category: 'Ostatní', type: 'saving' as const },
      { title: 'Limit na jídlo (měsíčně)', targetAmount: 6000, category: 'Jídlo', type: 'spending_limit' as const },
    ],
  },
  {
    id: 'family',
    title: 'Rodina',
    desc: 'Domácí rozpočet s rezervou',
    color: '#6366F1',
    goals: [
      { title: 'Rezerva 3× nájem', targetAmount: 45000, category: 'Bydlení', type: 'saving' as const },
      { title: 'Auto servis/pojistka', targetAmount: 15000, category: 'Doprava', type: 'saving' as const },
      { title: 'Limit na nákupy (měsíčně)', targetAmount: 5000, category: 'Nákupy', type: 'spending_limit' as const },
    ],
  },
  {
    id: 'investor',
    title: 'Investor',
    desc: 'Dlouhodobé budování majetku',
    color: '#F59E0B',
    goals: [
      { title: 'Investiční kapitál', targetAmount: 100000, category: 'Investice', type: 'saving' as const },
      { title: 'Rezerva na daně', targetAmount: 20000, category: 'Ostatní', type: 'saving' as const },
      { title: 'Limit na zbytné výdaje', targetAmount: 3000, category: 'Ostatní', type: 'spending_limit' as const },
    ],
  },
] as const;

export default function GeneralSettingsScreen() {
  const { financialGoals, addFinancialGoal, deleteFinancialGoal } = useFinanceStore();
  const [autoBackup, setAutoBackup] = React.useState<boolean>(true);
  const [offlineMode, setOfflineMode] = React.useState<boolean>(false);

  const SettingItem = ({ icon: Icon, title, subtitle, onPress, rightElement }: { icon: any; title: string; subtitle?: string; onPress?: () => void; rightElement?: React.ReactNode; }) => (
    <TouchableOpacity style={styles.settingItem} onPress={onPress}>
      <View style={styles.settingContent}>
        <View style={styles.iconContainer}>
          <Icon color="#667eea" size={24} />
        </View>
        <View style={styles.settingText}>
          <Text style={styles.settingTitle}>{title}</Text>
          {subtitle ? <Text style={styles.settingSubtitle}>{subtitle}</Text> : null}
        </View>
      </View>
      {rightElement || <ChevronRight color="#9CA3AF" size={20} />}
    </TouchableOpacity>
  );

  const defaultDeadline = useMemo(() => {
    const d = new Date();
    d.setMonth(d.getMonth() + 12);
    return d;
  }, []);

  const applyTemplate = useCallback((id: string) => {
    const t = GOAL_TEMPLATES.find(x => x.id === id);
    if (!t) return;
    try {
      financialGoals.forEach(g => deleteFinancialGoal(g.id));
      t.goals.forEach((g, idx) => {
        const goal: FinancialGoal = {
          id: `${id}-${Date.now()}-${idx}`,
          title: g.title,
          targetAmount: g.targetAmount,
          currentAmount: 0,
          category: g.category,
          deadline: defaultDeadline,
          type: g.type,
        };
        addFinancialGoal(goal);
      });


    } catch (e) {
      console.error('Template apply failed', e);
    }
  }, [financialGoals, deleteFinancialGoal, addFinancialGoal, defaultDeadline]);

  return (
    <>
      <Stack.Screen 
        options={{
          title: 'Obecné nastavení',
          headerStyle: { backgroundColor: '#667eea' },
          headerTintColor: 'white',
          headerTitleStyle: { fontWeight: 'bold' },
        }} 
      />
      
      <ScrollView style={styles.container}>
        <LinearGradient
          colors={['#667eea', '#764ba2']}
          style={styles.header}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <Text style={styles.headerTitle}>Obecné nastavení</Text>
          <Text style={styles.headerSubtitle}>Správa aplikace a dat</Text>
        </LinearGradient>

        <View style={styles.content}>
          <Text style={styles.sectionTitle}>Šablony cílů</Text>

          <View style={styles.templatesRow}>
            {GOAL_TEMPLATES.map(t => (
              <TouchableOpacity
                key={t.id}
                onPress={() => applyTemplate(t.id)}
                style={[styles.templateButton, { borderColor: t.color }]}
                testID={`settings-apply-template-${t.id}`}
              >
                <View style={[styles.templateIconWrap, { backgroundColor: t.color + '22' }]}>
                  <LayoutGrid color={t.color} size={18} />
                </View>
                <View style={styles.templateTextWrap}>
                  <Text style={styles.templateTitle}>{t.title}</Text>
                  <Text style={styles.templateDesc}>{t.desc}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.sectionTitle}>Data a synchronizace</Text>
          
          <SettingItem
            icon={Database}
            title="Automatické zálohování"
            subtitle="Zálohuj data do cloudu"
            rightElement={
              <Switch
                value={autoBackup}
                onValueChange={setAutoBackup}
                trackColor={{ false: '#E5E7EB', true: '#10B981' }}
                thumbColor={autoBackup ? 'white' : '#9CA3AF'}
              />
            }
          />

          <SettingItem
            icon={Smartphone}
            title="Offline režim"
            subtitle="Používej aplikaci bez internetu"
            rightElement={
              <Switch
                value={offlineMode}
                onValueChange={setOfflineMode}
                trackColor={{ false: '#E5E7EB', true: '#10B981' }}
                thumbColor={offlineMode ? 'white' : '#9CA3AF'}
              />
            }
          />

          <SettingItem
            icon={Download}
            title="Export dat"
            subtitle="Stáhni svá data jako CSV"
            onPress={() => console.log('Export data')}
          />

          <Text style={styles.sectionTitle}>Údržba</Text>

          <SettingItem
            icon={RefreshCw}
            title="Synchronizovat data"
            subtitle="Aktualizuj data ze serveru"
            onPress={() => console.log('Sync data')}
          />

          <SettingItem
            icon={Trash2}
            title="Vymazat cache"
            subtitle="Uvolni místo na zařízení"
            onPress={() => console.log('Clear cache')}
          />
        </View>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  header: {
    paddingTop: 20,
    paddingBottom: 24,
    paddingHorizontal: 20,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 16,
    color: 'white',
    opacity: 0.9,
  },
  content: {
    padding: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700' as const,
    color: '#1F2937',
    marginBottom: 16,
    marginTop: 16,
  },
  settingItem: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  settingContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  settingText: {
    flex: 1,
  },
  settingTitle: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: '#1F2937',
    marginBottom: 2,
  },
  settingSubtitle: {
    fontSize: 14,
    color: '#6B7280',
  },
  templatesRow: {
    gap: 12,
    marginBottom: 12,
  },
  templateButton: {
    backgroundColor: 'white',
    borderWidth: 2,
    borderRadius: 16,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  templateIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  templateTextWrap: {
    flex: 1,
  },
  templateTitle: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: '#111827',
    marginBottom: 2,
  },
  templateDesc: {
    fontSize: 12,
    color: '#6B7280',
  },
});

