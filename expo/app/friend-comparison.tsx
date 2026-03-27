import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { Stack } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Target,
  Award,
  Calendar,
} from 'lucide-react-native';
import { useSettingsStore } from '@/store/settings-store';
import { useLanguageStore } from '@/store/language-store';
import { useFinanceStore } from '@/store/finance-store';
import { useBuddyStore } from '@/store/buddy-store';

export default function FriendComparisonScreen() {
  const { isDarkMode } = useSettingsStore();
  const { language } = useLanguageStore();
  const { totalIncome, totalExpenses, balance } = useFinanceStore();
  const { level, points, completedLessons } = useBuddyStore();

  const friendData = {
    name: 'Demo Friend',
    level: 8,
    points: 750,
    completedLessons: 12,
    totalIncome: 45000,
    totalExpenses: 32000,
    balance: 13000,
  };

  const ComparisonCard = ({ title, myValue, friendValue, icon: Icon, color, unit = '' }: any) => {
    const diff = myValue - friendValue;
    const isPositive = diff > 0;
    const percentage = friendValue !== 0 ? Math.abs((diff / friendValue) * 100) : 0;

    return (
      <View style={[styles.comparisonCard, { backgroundColor: isDarkMode ? '#374151' : 'white' }]}>
        <View style={styles.cardHeader}>
          <View style={[styles.iconContainer, { backgroundColor: color + '20' }]}>
            <Icon color={color} size={24} />
          </View>
          <Text style={[styles.cardTitle, { color: isDarkMode ? 'white' : '#1F2937' }]}>
            {title}
          </Text>
        </View>

        <View style={styles.valuesContainer}>
          <View style={styles.valueColumn}>
            <Text style={[styles.valueLabel, { color: isDarkMode ? '#9CA3AF' : '#6B7280' }]}>
              {language === 'cs' ? 'Ty' : 'You'}
            </Text>
            <Text style={[styles.valueText, { color: isDarkMode ? 'white' : '#1F2937' }]}>
              {myValue.toLocaleString('cs-CZ')}{unit}
            </Text>
          </View>

          <View style={styles.valueColumn}>
            <Text style={[styles.valueLabel, { color: isDarkMode ? '#9CA3AF' : '#6B7280' }]}>
              {language === 'cs' ? 'Přítel' : 'Friend'}
            </Text>
            <Text style={[styles.valueText, { color: isDarkMode ? 'white' : '#1F2937' }]}>
              {friendValue.toLocaleString('cs-CZ')}{unit}
            </Text>
          </View>
        </View>

        <View style={styles.differenceContainer}>
          <View style={[
            styles.differenceBadge,
            { backgroundColor: isPositive ? '#10B98120' : '#EF444420' }
          ]}>
            {isPositive ? (
              <TrendingUp color="#10B981" size={16} />
            ) : (
              <TrendingDown color="#EF4444" size={16} />
            )}
            <Text style={[
              styles.differenceText,
              { color: isPositive ? '#10B981' : '#EF4444' }
            ]}>
              {isPositive ? '+' : ''}{Math.round(percentage)}%
            </Text>
          </View>
        </View>
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: isDarkMode ? '#111827' : '#F8FAFC' }]}>
      <Stack.Screen
        options={{
          title: language === 'cs' ? 'Porovnání' : 'Comparison',
          headerStyle: {
            backgroundColor: isDarkMode ? '#1F2937' : 'white',
          },
          headerTintColor: isDarkMode ? 'white' : '#1F2937',
        }}
      />

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <LinearGradient
          colors={['#667eea', '#764ba2']}
          style={styles.header}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <Text style={styles.headerTitle}>
            {language === 'cs' ? 'Porovnání s přítelem' : 'Compare with Friend'}
          </Text>
          <Text style={styles.headerSubtitle}>
            {friendData.name}
          </Text>
        </LinearGradient>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: isDarkMode ? 'white' : '#1F2937' }]}>
            {language === 'cs' ? 'Pokrok v učení' : 'Learning Progress'}
          </Text>

          <ComparisonCard
            title={language === 'cs' ? 'Level' : 'Level'}
            myValue={level}
            friendValue={friendData.level}
            icon={Award}
            color="#F59E0B"
          />

          <ComparisonCard
            title={language === 'cs' ? 'Body' : 'Points'}
            myValue={points}
            friendValue={friendData.points}
            icon={Target}
            color="#8B5CF6"
          />

          <ComparisonCard
            title={language === 'cs' ? 'Dokončené lekce' : 'Completed Lessons'}
            myValue={completedLessons.length}
            friendValue={friendData.completedLessons}
            icon={Calendar}
            color="#10B981"
          />
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: isDarkMode ? 'white' : '#1F2937' }]}>
            {language === 'cs' ? 'Finanční statistiky' : 'Financial Statistics'}
          </Text>

          <ComparisonCard
            title={language === 'cs' ? 'Celkový příjem' : 'Total Income'}
            myValue={totalIncome}
            friendValue={friendData.totalIncome}
            icon={TrendingUp}
            color="#10B981"
            unit=" Kč"
          />

          <ComparisonCard
            title={language === 'cs' ? 'Celkové výdaje' : 'Total Expenses'}
            myValue={totalExpenses}
            friendValue={friendData.totalExpenses}
            icon={TrendingDown}
            color="#EF4444"
            unit=" Kč"
          />

          <ComparisonCard
            title={language === 'cs' ? 'Zůstatek' : 'Balance'}
            myValue={balance}
            friendValue={friendData.balance}
            icon={DollarSign}
            color="#667eea"
            unit=" Kč"
          />
        </View>

        <View style={[styles.motivationCard, { backgroundColor: isDarkMode ? '#374151' : 'white' }]}>
          <Text style={[styles.motivationTitle, { color: isDarkMode ? 'white' : '#1F2937' }]}>
            {language === 'cs' ? '💪 Motivace' : '💪 Motivation'}
          </Text>
          <Text style={[styles.motivationText, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>
            {language === 'cs'
              ? 'Skvělá práce! Pokračuj v učení a zlepšování svých finančních návyků.'
              : 'Great job! Keep learning and improving your financial habits.'}
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
  header: {
    padding: 32,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 8,
  },
  headerSubtitle: {
    fontSize: 18,
    color: 'white',
    opacity: 0.9,
  },
  section: {
    padding: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  comparisonCard: {
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  valuesContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 16,
  },
  valueColumn: {
    alignItems: 'center',
  },
  valueLabel: {
    fontSize: 14,
    marginBottom: 8,
  },
  valueText: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  differenceContainer: {
    alignItems: 'center',
  },
  differenceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 6,
  },
  differenceText: {
    fontSize: 14,
    fontWeight: '600',
  },
  motivationCard: {
    margin: 16,
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  motivationTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  motivationText: {
    fontSize: 16,
    lineHeight: 24,
  },
});
