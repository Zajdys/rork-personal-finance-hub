import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Switch,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Stack } from 'expo-router';
import { Bell, MessageCircle, TrendingUp, AlertTriangle } from 'lucide-react-native';

export default function NotificationsSettingsScreen() {
  const [pushNotifications, setPushNotifications] = React.useState(true);
  const [dailyTips, setDailyTips] = React.useState(true);
  const [investmentAlerts, setInvestmentAlerts] = React.useState(true);
  const [budgetWarnings, setBudgetWarnings] = React.useState(true);

  const NotificationItem = ({ icon: Icon, title, subtitle, value, onValueChange }: any) => (
    <View style={styles.notificationItem}>
      <View style={styles.notificationContent}>
        <View style={styles.iconContainer}>
          <Icon color="#667eea" size={24} />
        </View>
        <View style={styles.notificationText}>
          <Text style={styles.notificationTitle}>{title}</Text>
          <Text style={styles.notificationSubtitle}>{subtitle}</Text>
        </View>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: '#E5E7EB', true: '#10B981' }}
        thumbColor={value ? 'white' : '#9CA3AF'}
      />
    </View>
  );

  return (
    <>
      <Stack.Screen 
        options={{
          title: 'Notifikace',
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
          <Text style={styles.headerTitle}>Notifikace</Text>
          <Text style={styles.headerSubtitle}>Správa upozornění a tipů</Text>
        </LinearGradient>

        <View style={styles.content}>
          <NotificationItem
            icon={Bell}
            title="Push notifikace"
            subtitle="Základní upozornění aplikace"
            value={pushNotifications}
            onValueChange={setPushNotifications}
          />

          <NotificationItem
            icon={MessageCircle}
            title="Denní tipy"
            subtitle="MoneyBuddy tipy každý den"
            value={dailyTips}
            onValueChange={setDailyTips}
          />

          <NotificationItem
            icon={TrendingUp}
            title="Investiční upozornění"
            subtitle="Změny v portfoliu a doporučení"
            value={investmentAlerts}
            onValueChange={setInvestmentAlerts}
          />

          <NotificationItem
            icon={AlertTriangle}
            title="Rozpočtová varování"
            subtitle="Upozornění na překročení limitů"
            value={budgetWarnings}
            onValueChange={setBudgetWarnings}
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
  notificationItem: {
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
  notificationContent: {
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
  notificationText: {
    flex: 1,
  },
  notificationTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 2,
  },
  notificationSubtitle: {
    fontSize: 14,
    color: '#6B7280',
  },
});