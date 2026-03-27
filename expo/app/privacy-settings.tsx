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
import { Shield, Lock, Eye, Database, Trash2, ChevronRight } from 'lucide-react-native';

export default function PrivacySettingsScreen() {
  const PrivacyItem = ({ icon: Icon, title, subtitle, onPress }: any) => (
    <TouchableOpacity style={styles.privacyItem} onPress={onPress}>
      <View style={styles.privacyContent}>
        <View style={styles.iconContainer}>
          <Icon color="#667eea" size={24} />
        </View>
        <View style={styles.privacyText}>
          <Text style={styles.privacyTitle}>{title}</Text>
          <Text style={styles.privacySubtitle}>{subtitle}</Text>
        </View>
      </View>
      <ChevronRight color="#9CA3AF" size={20} />
    </TouchableOpacity>
  );

  return (
    <>
      <Stack.Screen 
        options={{
          title: 'Soukromí a bezpečnost',
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
          <Text style={styles.headerTitle}>Soukromí a bezpečnost</Text>
          <Text style={styles.headerSubtitle}>Ochrana tvých dat</Text>
        </LinearGradient>

        <View style={styles.content}>
          <PrivacyItem
            icon={Lock}
            title="Biometrické přihlášení"
            subtitle="Otisk prstu nebo Face ID"
            onPress={() => console.log('Biometric login')}
          />

          <PrivacyItem
            icon={Eye}
            title="Soukromí dat"
            subtitle="Kdo může vidět tvé informace"
            onPress={() => console.log('Data privacy')}
          />

          <PrivacyItem
            icon={Database}
            title="Správa dat"
            subtitle="Export a smazání osobních dat"
            onPress={() => console.log('Data management')}
          />

          <PrivacyItem
            icon={Shield}
            title="Zásady ochrany soukromí"
            subtitle="Přečti si naše zásady"
            onPress={() => console.log('Privacy policy')}
          />

          <View style={styles.dangerZone}>
            <Text style={styles.dangerTitle}>Nebezpečná zóna</Text>
            <TouchableOpacity style={styles.dangerItem}>
              <View style={styles.dangerContent}>
                <View style={[styles.iconContainer, { backgroundColor: '#FEE2E2' }]}>
                  <Trash2 color="#EF4444" size={24} />
                </View>
                <View style={styles.privacyText}>
                  <Text style={[styles.privacyTitle, { color: '#EF4444' }]}>Smazat účet</Text>
                  <Text style={styles.privacySubtitle}>Trvale smaž všechna data</Text>
                </View>
              </View>
              <ChevronRight color="#EF4444" size={20} />
            </TouchableOpacity>
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
  privacyItem: {
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
  privacyContent: {
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
  privacyText: {
    flex: 1,
  },
  privacyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 2,
  },
  privacySubtitle: {
    fontSize: 14,
    color: '#6B7280',
  },
  dangerZone: {
    marginTop: 32,
  },
  dangerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#EF4444',
    marginBottom: 16,
  },
  dangerItem: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
    borderWidth: 1,
    borderColor: '#FEE2E2',
  },
  dangerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
});