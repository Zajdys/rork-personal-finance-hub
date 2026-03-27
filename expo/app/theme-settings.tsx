import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Stack } from 'expo-router';
import { Check, Sun, Moon, Smartphone } from 'lucide-react-native';
import { useSettingsStore, Theme } from '@/store/settings-store';

const THEMES = [
  { id: 'light', name: 'Světlé', description: 'Klasické světlé téma', icon: Sun },
  { id: 'dark', name: 'Tmavé', description: 'Šetrné k očím v noci', icon: Moon },
  { id: 'auto', name: 'Automatické', description: 'Podle nastavení systému', icon: Smartphone },
];

export default function ThemeSettingsScreen() {
  const { theme, isDarkMode, setTheme } = useSettingsStore();

  return (
    <>
      <Stack.Screen 
        options={{
          title: 'Téma',
          headerStyle: { backgroundColor: '#667eea' },
          headerTintColor: 'white',
          headerTitleStyle: { fontWeight: 'bold' },
        }} 
      />
      
      <ScrollView style={[
        styles.container,
        { backgroundColor: isDarkMode ? '#111827' : '#F8FAFC' }
      ]}>
        <LinearGradient
          colors={['#667eea', '#764ba2']}
          style={styles.header}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <Text style={styles.headerTitle}>Téma aplikace</Text>
          <Text style={styles.headerSubtitle}>Vyber si vzhled aplikace</Text>
        </LinearGradient>

        <View style={styles.content}>
          {THEMES.map((themeItem) => {
            const IconComponent = themeItem.icon;
            return (
              <TouchableOpacity
                key={themeItem.id}
                style={[
                  styles.themeOption,
                  { backgroundColor: isDarkMode ? '#374151' : 'white' }
                ]}
                onPress={() => setTheme(themeItem.id as Theme)}
              >
                <View style={styles.themeInfo}>
                  <View style={styles.iconContainer}>
                    <IconComponent color="#667eea" size={24} />
                  </View>
                  <View>
                    <Text style={[
                      styles.themeName,
                      { color: isDarkMode ? 'white' : '#1F2937' }
                    ]}>
                      {themeItem.name}
                    </Text>
                    <Text style={[
                      styles.themeDescription,
                      { color: isDarkMode ? '#D1D5DB' : '#6B7280' }
                    ]}>
                      {themeItem.description}
                    </Text>
                  </View>
                </View>
                {theme === themeItem.id && (
                  <Check color="#10B981" size={24} />
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
  themeOption: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 20,
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  themeInfo: {
    flexDirection: 'row',
    alignItems: 'center',
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
  themeName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 2,
  },
  themeDescription: {
    fontSize: 14,
    color: '#6B7280',
  },
});