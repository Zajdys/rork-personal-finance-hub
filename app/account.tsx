import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  User,
  Mail,
  Calendar,
  Crown,
  CreditCard,
  Settings,
  LogOut,
  Edit3,
  Shield,
  Bell,
  ExternalLink,
  CheckCircle,
  ArrowLeft,
} from 'lucide-react-native';
import { useSettingsStore } from '@/store/settings-store';
import { useLanguageStore } from '@/store/language-store';
import { useRouter } from 'expo-router';

interface UserAccount {
  id: string;
  name: string;
  email: string;
  registrationDate: Date;
  subscription: {
    plan: string;
    active: boolean;
    expiresAt: Date;
  } | null;
}

export default function AccountScreen() {
  const [userAccount] = useState<UserAccount>({
    id: '1',
    name: 'Jan Novák',
    email: 'jan.novak@email.com',
    registrationDate: new Date('2024-01-15'),
    subscription: {
      plan: 'premium',
      active: true,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
  });

  const { isDarkMode } = useSettingsStore();
  const { t } = useLanguageStore();
  const router = useRouter();

  const handleEditProfile = () => {
    Alert.alert(
      'Upravit profil',
      'Tato funkce bude dostupná v plné verzi aplikace.',
      [{ text: 'OK' }]
    );
  };

  const handleManageSubscription = () => {
    router.push('/subscription');
  };

  const handleLogout = () => {
    Alert.alert(
      'Odhlásit se',
      'Opravdu se chcete odhlásit?',
      [
        { text: 'Zrušit', style: 'cancel' },
        { 
          text: 'Odhlásit', 
          style: 'destructive',
          onPress: () => {
            // V reálné aplikaci by zde bylo odhlášení
            Alert.alert('Info', 'Odhlášení bude implementováno v plné verzi.');
          }
        }
      ]
    );
  };

  const getSubscriptionPlanName = (plan: string) => {
    switch (plan) {
      case 'basic': return 'Základní';
      case 'premium': return 'Premium';
      case 'pro': return 'Pro';
      default: return 'Neznámý';
    }
  };

  const AccountInfoCard = () => (
    <View style={[styles.accountCard, { backgroundColor: isDarkMode ? '#374151' : 'white' }]}>
      <View style={styles.accountHeader}>
        <View style={styles.avatarContainer}>
          <LinearGradient
            colors={['#667eea', '#764ba2']}
            style={styles.avatar}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <User color="white" size={32} />
          </LinearGradient>
        </View>
        <View style={styles.accountInfo}>
          <Text style={[styles.accountName, { color: isDarkMode ? 'white' : '#1F2937' }]}>
            {userAccount.name}
          </Text>
          <Text style={[styles.accountEmail, { color: isDarkMode ? '#9CA3AF' : '#6B7280' }]}>
            {userAccount.email}
          </Text>
        </View>
        <TouchableOpacity style={styles.editButton} onPress={handleEditProfile}>
          <Edit3 color="#667eea" size={20} />
        </TouchableOpacity>
      </View>

      <View style={styles.accountDetails}>
        <View style={styles.accountDetail}>
          <Calendar color={isDarkMode ? '#9CA3AF' : '#6B7280'} size={16} />
          <Text style={[styles.accountDetailText, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>
            Člen od {userAccount.registrationDate.toLocaleDateString('cs-CZ')}
          </Text>
        </View>
      </View>
    </View>
  );

  const SubscriptionCard = () => (
    <View style={[styles.subscriptionCard, { backgroundColor: isDarkMode ? '#374151' : 'white' }]}>
      <View style={styles.subscriptionHeader}>
        <View style={styles.subscriptionIcon}>
          <Crown color="#F59E0B" size={24} />
        </View>
        <View style={styles.subscriptionInfo}>
          <Text style={[styles.subscriptionTitle, { color: isDarkMode ? 'white' : '#1F2937' }]}>
            Předplatné
          </Text>
          <Text style={[styles.subscriptionSubtitle, { color: isDarkMode ? '#9CA3AF' : '#6B7280' }]}>
            {userAccount.subscription ? (
              <>
                {getSubscriptionPlanName(userAccount.subscription.plan)} • 
                {userAccount.subscription.active ? ' Aktivní' : ' Neaktivní'}
              </>
            ) : (
              'Žádné aktivní předplatné'
            )}
          </Text>
        </View>
        <View style={[
          styles.subscriptionBadge,
          { backgroundColor: userAccount.subscription?.active ? '#10B981' : '#EF4444' }
        ]}>
          <Text style={styles.subscriptionBadgeText}>
            {userAccount.subscription?.active ? 'Aktivní' : 'Neaktivní'}
          </Text>
        </View>
      </View>

      {userAccount.subscription?.active && (
        <View style={styles.subscriptionDetails}>
          <View style={styles.subscriptionDetail}>
            <CheckCircle color="#10B981" size={16} />
            <Text style={[styles.subscriptionDetailText, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>
              Platné do: {userAccount.subscription.expiresAt.toLocaleDateString('cs-CZ')}
            </Text>
          </View>
        </View>
      )}

      <TouchableOpacity 
        style={styles.manageSubscriptionButton}
        onPress={handleManageSubscription}
      >
        <LinearGradient
          colors={['#667eea', '#764ba2']}
          style={styles.manageSubscriptionGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <CreditCard color="white" size={20} />
          <Text style={styles.manageSubscriptionText}>
            {userAccount.subscription?.active ? 'Spravovat předplatné' : 'Aktivovat předplatné'}
          </Text>
          <ExternalLink color="white" size={16} />
        </LinearGradient>
      </TouchableOpacity>
    </View>
  );

  const MenuButton = ({ icon: Icon, title, subtitle, onPress, danger = false }: any) => (
    <TouchableOpacity 
      style={[styles.menuButton, { backgroundColor: isDarkMode ? '#374151' : 'white' }]} 
      onPress={onPress}
    >
      <View style={styles.menuButtonContent}>
        <View style={[styles.menuButtonIcon, { backgroundColor: danger ? '#FEE2E2' : '#F3F4F6' }]}>
          <Icon color={danger ? '#EF4444' : '#667eea'} size={20} />
        </View>
        <View style={styles.menuButtonText}>
          <Text style={[
            styles.menuButtonTitle, 
            { color: danger ? '#EF4444' : (isDarkMode ? 'white' : '#1F2937') }
          ]}>
            {title}
          </Text>
          {subtitle && (
            <Text style={[styles.menuButtonSubtitle, { color: isDarkMode ? '#9CA3AF' : '#6B7280' }]}>
              {subtitle}
            </Text>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );

  return (
    <ScrollView 
      style={[styles.container, { backgroundColor: isDarkMode ? '#111827' : '#F8FAFC' }]} 
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <LinearGradient
        colors={['#667eea', '#764ba2']}
        style={styles.header}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <View style={styles.headerTop}>
          <TouchableOpacity 
            style={styles.backButton} 
            onPress={() => router.back()}
          >
            <ArrowLeft color="white" size={24} />
          </TouchableOpacity>
          <View style={styles.headerTitleContainer}>
            <Text style={styles.headerTitle}>Můj účet</Text>
            <Text style={styles.headerSubtitle}>Správa profilu a předplatného</Text>
          </View>
        </View>
      </LinearGradient>

      <View style={styles.content}>
        {/* Account Info */}
        <AccountInfoCard />

        {/* Subscription */}
        <SubscriptionCard />

        {/* Menu Options */}
        <View style={styles.menuSection}>
          <Text style={[styles.sectionTitle, { color: isDarkMode ? 'white' : '#1F2937' }]}>
            Nastavení účtu
          </Text>

          <MenuButton
            icon={Bell}
            title="Notifikace"
            subtitle="Správa upozornění a tipů"
            onPress={() => router.push('/notifications-settings')}
          />

          <MenuButton
            icon={Shield}
            title="Soukromí a bezpečnost"
            subtitle="Ochrana vašich dat"
            onPress={() => router.push('/privacy-settings')}
          />

          <MenuButton
            icon={Settings}
            title="Obecná nastavení"
            subtitle="Jazyk, měna, téma"
            onPress={() => router.push('/general-settings')}
          />
        </View>

        {/* Logout */}
        <View style={styles.logoutSection}>
          <MenuButton
            icon={LogOut}
            title="Odhlásit se"
            subtitle="Odhlásit se z aplikace"
            onPress={handleLogout}
            danger={true}
          />
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  header: {
    paddingTop: 60,
    paddingBottom: 32,
    paddingHorizontal: 20,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  headerTitleContainer: {
    flex: 1,
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
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  accountCard: {
    backgroundColor: 'white',
    borderRadius: 20,
    padding: 24,
    marginBottom: 20,
    marginTop: -20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 6,
  },
  accountHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  avatarContainer: {
    marginRight: 16,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  accountInfo: {
    flex: 1,
  },
  accountName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: 4,
  },
  accountEmail: {
    fontSize: 14,
    color: '#6B7280',
  },
  editButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  accountDetails: {
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  accountDetail: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  accountDetailText: {
    fontSize: 14,
    color: '#6B7280',
  },
  subscriptionCard: {
    backgroundColor: 'white',
    borderRadius: 20,
    padding: 24,
    marginBottom: 32,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 6,
  },
  subscriptionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  subscriptionIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  subscriptionInfo: {
    flex: 1,
  },
  subscriptionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: 4,
  },
  subscriptionSubtitle: {
    fontSize: 14,
    color: '#6B7280',
  },
  subscriptionBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: '#10B981',
  },
  subscriptionBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: 'white',
  },
  subscriptionDetails: {
    marginBottom: 20,
  },
  subscriptionDetail: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  subscriptionDetailText: {
    fontSize: 14,
    color: '#6B7280',
  },
  manageSubscriptionButton: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  manageSubscriptionGradient: {
    paddingVertical: 16,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  manageSubscriptionText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
    flex: 1,
    textAlign: 'center',
  },
  menuSection: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: 16,
  },
  menuButton: {
    backgroundColor: 'white',
    borderRadius: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  menuButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  menuButtonIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  menuButtonText: {
    flex: 1,
  },
  menuButtonTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 2,
  },
  menuButtonSubtitle: {
    fontSize: 14,
    color: '#6B7280',
  },
  logoutSection: {
    marginBottom: 32,
  },
});