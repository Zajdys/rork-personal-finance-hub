import React from 'react';
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
  ChevronRight 
} from 'lucide-react-native';

export default function GeneralSettingsScreen() {
  const [autoBackup, setAutoBackup] = React.useState(true);
  const [offlineMode, setOfflineMode] = React.useState(false);

  const SettingItem = ({ icon: Icon, title, subtitle, onPress, rightElement }: any) => (
    <TouchableOpacity style={styles.settingItem} onPress={onPress}>
      <View style={styles.settingContent}>
        <View style={styles.iconContainer}>
          <Icon color="#667eea" size={24} />
        </View>
        <View style={styles.settingText}>
          <Text style={styles.settingTitle}>{title}</Text>
          {subtitle && <Text style={styles.settingSubtitle}>{subtitle}</Text>}
        </View>
      </View>
      {rightElement || <ChevronRight color="#9CA3AF" size={20} />}
    </TouchableOpacity>
  );

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
    fontWeight: 'bold',
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
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 2,
  },
  settingSubtitle: {
    fontSize: 14,
    color: '#6B7280',
  },
});