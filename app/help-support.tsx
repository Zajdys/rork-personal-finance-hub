import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Linking,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Stack, useRouter } from 'expo-router';
import { 
  HelpCircle, 
  MessageCircle, 
  Mail, 
  ExternalLink,
  BookOpen,
  ChevronRight 
} from 'lucide-react-native';

export default function HelpSupportScreen() {
  const router = useRouter();
  
  const HelpItem = ({ icon: Icon, title, subtitle, onPress }: any) => (
    <TouchableOpacity style={styles.helpItem} onPress={onPress}>
      <View style={styles.helpContent}>
        <View style={styles.iconContainer}>
          <Icon color="#667eea" size={24} />
        </View>
        <View style={styles.helpText}>
          <Text style={styles.helpTitle}>{title}</Text>
          <Text style={styles.helpSubtitle}>{subtitle}</Text>
        </View>
      </View>
      <ChevronRight color="#9CA3AF" size={20} />
    </TouchableOpacity>
  );

  return (
    <>
      <Stack.Screen 
        options={{
          title: 'Nápověda a podpora',
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
          <Text style={styles.headerTitle}>Nápověda a podpora</Text>
          <Text style={styles.headerSubtitle}>Jsme tu pro tebe</Text>
        </LinearGradient>

        <View style={styles.content}>
          <Text style={styles.sectionTitle}>Často kladené otázky</Text>
          
          <HelpItem
            icon={HelpCircle}
            title="FAQ"
            subtitle="Odpovědi na nejčastější otázky"
            onPress={() => console.log('FAQ')}
          />

          <HelpItem
            icon={BookOpen}
            title="Uživatelská příručka"
            subtitle="Kompletní návod k použití"
            onPress={() => console.log('User guide')}
          />

          <Text style={styles.sectionTitle}>Kontaktuj nás</Text>

          <HelpItem
            icon={MessageCircle}
            title="Live chat"
            subtitle="Okamžitá pomoc online"
            onPress={() => router.push('/support-chat' as any)}
          />

          <HelpItem
            icon={Mail}
            title="Email podpora"
            subtitle="moneybuddy@email.cz"
            onPress={() => Linking.openURL('mailto:moneybuddy@email.cz')}
          />

          <Text style={styles.sectionTitle}>Další informace</Text>

          <HelpItem
            icon={ExternalLink}
            title="Webové stránky"
            subtitle="moneybuddy.cz"
            onPress={() => Linking.openURL('https://moneybuddy.cz')}
          />

          <View style={styles.versionInfo}>
            <Text style={styles.versionText}>MoneyBuddy verze 1.0.0</Text>
            <Text style={styles.buildText}>Build 2024.1.1</Text>
          </View>
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
  helpItem: {
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
  helpContent: {
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
  helpText: {
    flex: 1,
  },
  helpTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 2,
  },
  helpSubtitle: {
    fontSize: 14,
    color: '#6B7280',
  },
  versionInfo: {
    alignItems: 'center',
    marginTop: 32,
    paddingTop: 24,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  versionText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 4,
  },
  buildText: {
    fontSize: 14,
    color: '#6B7280',
  },
});