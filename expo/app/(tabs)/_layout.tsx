import { Tabs } from "expo-router";
import { 
  Home, 
  PlusCircle, 
  TrendingUp, 
  PiggyBank, 
  User
} from "lucide-react-native";
import React from "react";
import { useSettingsStore } from '@/store/settings-store';
import { useLanguageStore } from '@/store/language-store';

export default function TabLayout() {
  const { isDarkMode } = useSettingsStore();
  const { t, updateCounter } = useLanguageStore();
  
  // This will force re-render when language changes
  React.useEffect(() => {
    console.log('Language changed, updateCounter:', updateCounter);
  }, [updateCounter]);
  
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#667eea',
        tabBarInactiveTintColor: isDarkMode ? '#9CA3AF' : '#9CA3AF',
        headerShown: false,
        tabBarStyle: {
          backgroundColor: isDarkMode ? '#1F2937' : 'white',
          borderTopWidth: 0,
          elevation: 8,
          shadowColor: '#000',
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
        name="add"
        options={{
          title: t('add'),
          tabBarIcon: ({ color, size }) => <PlusCircle color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="investments"
        options={{
          title: t('investments'),
          tabBarIcon: ({ color, size }) => <TrendingUp color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="save"
        options={{
          title: t('save'),
          tabBarIcon: ({ color, size }) => <PiggyBank color={color} size={size} />,
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
  );
}