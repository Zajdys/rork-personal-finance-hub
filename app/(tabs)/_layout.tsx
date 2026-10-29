import { Tabs } from "expo-router";
import { 
  Home, 
  Plus,
  Users,
  User,
  Lock,
  Target,
} from "lucide-react-native";
import React from "react";
import { View, StyleSheet } from "react-native";
import { useLanguageStore } from '@/store/language-store';
import { useTheme } from '@/hooks/use-theme';
import { usePremium } from '@/hooks/usePremium';
import { useQuickAddSheetStore } from '@/store/quick-add-sheet-store';
import { QuickAddTransactionSheet } from '@/components/QuickAddTransactionSheet';

function TabIconWithLock({
  children,
  showLock,
  accent,
}: {
  children: React.ReactNode;
  showLock: boolean;
  accent: string;
}) {
  return (
    <View style={{ width: 28, height: 28, alignItems: 'center', justifyContent: 'center' }}>
      {children}
      {showLock ? (
        <View
          style={{
            position: 'absolute',
            top: -2,
            right: -6,
            width: 14,
            height: 14,
            borderRadius: 7,
            backgroundColor: accent,
            alignItems: 'center',
            justifyContent: 'center',
          }}
          pointerEvents="none"
        >
          <Lock color="white" size={9} strokeWidth={2.5} />
        </View>
      ) : null}
    </View>
  );
}

export default function TabLayout() {
  const { colors, isDark } = useTheme();
  const { t } = useLanguageStore();
  const { isHouseholdPremium } = usePremium();
  const showHouseholdLock = !isHouseholdPremium;
  const quickAdd = useQuickAddSheetStore();
  
  return (
    <>
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSecondary,
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.tabBar,
          borderTopWidth: 0,
          borderTopColor: colors.border,
          elevation: 8,
          shadowColor: isDark ? '#000' : '#000',
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.1,
          shadowRadius: 8,
          height: 88,
          paddingBottom: 24,
          paddingTop: 8,
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '600',
          marginTop: 4,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t('overview'),
          tabBarIcon: ({ color, size }) => <Home color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="plan"
        options={{
          title: 'Plán',
          tabBarIcon: ({ color, size }) => <Target color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="add"
        options={{
          title: '',
          tabBarIcon: () => (
            <View style={[styles.fab, { backgroundColor: colors.primary, shadowColor: colors.primary }]}>
              <Plus color="#fff" size={28} strokeWidth={2.5} />
            </View>
          ),
        }}
        listeners={{
          tabPress: (e) => {
            e.preventDefault();
            quickAdd.open('expense');
          },
        }}
      />
      <Tabs.Screen
        name="household"
        options={{
          title: t('household'),
          tabBarIcon: ({ color, size }) => (
            <TabIconWithLock showLock={showHouseholdLock} accent={colors.primary}>
              <Users color={color} size={size} />
            </TabIconWithLock>
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t('profile'),
          tabBarIcon: ({ color, size }) => <User color={color} size={size} />,
        }}
      />
    </Tabs>

    <QuickAddTransactionSheet
      visible={quickAdd.visible}
      onClose={quickAdd.close}
      type={quickAdd.type}
      allowTypeToggle
      onTypeChange={quickAdd.setType}
      showMoreOptions
    />
    </>
  );
}

const styles = StyleSheet.create({
  fab: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 6,
  },
});
