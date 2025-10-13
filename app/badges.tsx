import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft, X, Award, Lock } from 'lucide-react-native';
import { useBuddyStore } from '@/store/buddy-store';
import { useSettingsStore } from '@/store/settings-store';
import { useLanguageStore } from '@/store/language-store';
import { ALL_BADGES } from '@/constants/badges';
import { Badge } from '@/types/gaming';

export default function BadgesScreen() {
  const router = useRouter();
  const { gamingStats } = useBuddyStore();
  const { isDarkMode } = useSettingsStore();
  const { language } = useLanguageStore();
  const [selectedBadge, setSelectedBadge] = useState<Badge | null>(null);
  const [filter, setFilter] = useState<'all' | 'standard' | 'epic' | 'legacy' | 'meta'>('all');

  const earnedBadgeIds = gamingStats.badges.map(b => b.badgeId);
  
  const filteredBadges = ALL_BADGES.filter(badge => {
    if (filter === 'all') return true;
    return badge.type === filter;
  });

  const earnedCount = filteredBadges.filter(b => earnedBadgeIds.includes(b.id)).length;
  const totalCount = filteredBadges.length;

  const getRarityColor = (rarity: string) => {
    switch (rarity) {
      case 'common': return '#10B981';
      case 'rare': return '#3B82F6';
      case 'epic': return '#8B5CF6';
      case 'legendary': return '#F59E0B';
      default: return '#6B7280';
    }
  };

  const getRarityLabel = (rarity: string) => {
    switch (rarity) {
      case 'common': return language === 'cs' ? 'Běžný' : 'Common';
      case 'rare': return language === 'cs' ? 'Vzácný' : 'Rare';
      case 'epic': return language === 'cs' ? 'Epický' : 'Epic';
      case 'legendary': return language === 'cs' ? 'Legendární' : 'Legendary';
      default: return rarity;
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'standard': return language === 'cs' ? 'Standardní' : 'Standard';
      case 'epic': return language === 'cs' ? 'Epický' : 'Epic';
      case 'legacy': return language === 'cs' ? 'Legacy' : 'Legacy';
      case 'meta': return language === 'cs' ? 'Meta' : 'Meta';
      default: return type;
    }
  };

  const BadgeCard = ({ badge }: { badge: Badge }) => {
    const isEarned = earnedBadgeIds.includes(badge.id);
    const earnedBadge = gamingStats.badges.find(b => b.badgeId === badge.id);

    return (
      <TouchableOpacity
        style={[
          styles.badgeCard,
          { backgroundColor: isDarkMode ? '#374151' : 'white' },
          !isEarned && styles.badgeCardLocked,
        ]}
        onPress={() => setSelectedBadge(badge)}
      >
        <View style={[styles.badgeIconContainer, { backgroundColor: badge.color + '20' }]}>
          <Text style={styles.badgeEmoji}>{badge.icon}</Text>
          {!isEarned && (
            <View style={styles.lockOverlay}>
              <Lock color="#9CA3AF" size={24} />
            </View>
          )}
        </View>
        <Text
          style={[
            styles.badgeName,
            { color: isDarkMode ? 'white' : '#1F2937' },
            !isEarned && styles.badgeNameLocked,
          ]}
          numberOfLines={2}
        >
          {badge.name}
        </Text>
        <View style={[styles.rarityBadge, { backgroundColor: getRarityColor(badge.rarity) }]}>
          <Text style={styles.rarityText}>{getRarityLabel(badge.rarity)}</Text>
        </View>
        {isEarned && earnedBadge && (
          <Text style={styles.earnedDate}>
            {new Date(earnedBadge.earnedAt).toLocaleDateString('cs-CZ')}
          </Text>
        )}
      </TouchableOpacity>
    );
  };

  const FilterButton = ({ type, label }: { type: typeof filter; label: string }) => (
    <TouchableOpacity
      style={[
        styles.filterButton,
        filter === type && styles.filterButtonActive,
        { backgroundColor: isDarkMode ? '#374151' : 'white' },
      ]}
      onPress={() => setFilter(type)}
    >
      <Text
        style={[
          styles.filterButtonText,
          filter === type && styles.filterButtonTextActive,
          { color: isDarkMode ? '#D1D5DB' : '#6B7280' },
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );

  return (
    <View style={[styles.container, { backgroundColor: isDarkMode ? '#111827' : '#F8FAFC' }]}>
      <Stack.Screen
        options={{
          headerShown: true,
          title: language === 'cs' ? 'Odznaky' : 'Badges',
          headerStyle: {
            backgroundColor: isDarkMode ? '#1F2937' : 'white',
          },
          headerTintColor: isDarkMode ? 'white' : '#1F2937',
          headerLeft: () => (
            <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
              <ArrowLeft color={isDarkMode ? 'white' : '#1F2937'} size={24} />
            </TouchableOpacity>
          ),
        }}
      />

      <ScrollView showsVerticalScrollIndicator={false}>
        <LinearGradient
          colors={['#667eea', '#764ba2']}
          style={styles.header}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <Award color="white" size={48} />
          <Text style={styles.headerTitle}>
            {earnedCount} / {totalCount}
          </Text>
          <Text style={styles.headerSubtitle}>
            {language === 'cs' ? 'Odemčených odznaků' : 'Unlocked badges'}
          </Text>
        </LinearGradient>

        <View style={styles.filterContainer}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <FilterButton type="all" label={language === 'cs' ? 'Vše' : 'All'} />
            <FilterButton type="standard" label={language === 'cs' ? 'Standardní' : 'Standard'} />
            <FilterButton type="epic" label={language === 'cs' ? 'Epické' : 'Epic'} />
            <FilterButton type="legacy" label="Legacy" />
            <FilterButton type="meta" label="Meta" />
          </ScrollView>
        </View>

        <View style={styles.badgesGrid}>
          {filteredBadges.map((badge) => (
            <BadgeCard key={badge.id} badge={badge} />
          ))}
        </View>
      </ScrollView>

      <Modal
        visible={selectedBadge !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedBadge(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: isDarkMode ? '#1F2937' : 'white' }]}>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => setSelectedBadge(null)}
            >
              <X color={isDarkMode ? 'white' : '#1F2937'} size={24} />
            </TouchableOpacity>

            {selectedBadge && (
              <>
                <View style={[styles.modalBadgeIcon, { backgroundColor: selectedBadge.color + '20' }]}>
                  <Text style={styles.modalBadgeEmoji}>{selectedBadge.icon}</Text>
                </View>

                <Text style={[styles.modalBadgeName, { color: isDarkMode ? 'white' : '#1F2937' }]}>
                  {selectedBadge.name}
                </Text>

                <View style={[styles.modalRarityBadge, { backgroundColor: getRarityColor(selectedBadge.rarity) }]}>
                  <Text style={styles.modalRarityText}>{getRarityLabel(selectedBadge.rarity)}</Text>
                </View>

                <Text style={[styles.modalBadgeDescription, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>
                  {selectedBadge.description}
                </Text>

                <View style={styles.modalStats}>
                  <View style={styles.modalStatItem}>
                    <Text style={[styles.modalStatLabel, { color: isDarkMode ? '#9CA3AF' : '#6B7280' }]}>
                      {language === 'cs' ? 'Typ' : 'Type'}
                    </Text>
                    <Text style={[styles.modalStatValue, { color: isDarkMode ? 'white' : '#1F2937' }]}>
                      {getTypeLabel(selectedBadge.type)}
                    </Text>
                  </View>

                  <View style={styles.modalStatItem}>
                    <Text style={[styles.modalStatLabel, { color: isDarkMode ? '#9CA3AF' : '#6B7280' }]}>
                      {language === 'cs' ? 'Odměna XP' : 'XP Reward'}
                    </Text>
                    <Text style={[styles.modalStatValue, { color: isDarkMode ? 'white' : '#1F2937' }]}>
                      +{selectedBadge.rewardXp} XP
                    </Text>
                  </View>

                  <View style={styles.modalStatItem}>
                    <Text style={[styles.modalStatLabel, { color: isDarkMode ? '#9CA3AF' : '#6B7280' }]}>
                      {language === 'cs' ? 'Odměna Coins' : 'Coins Reward'}
                    </Text>
                    <Text style={[styles.modalStatValue, { color: isDarkMode ? 'white' : '#1F2937' }]}>
                      +{selectedBadge.rewardCoins} BC
                    </Text>
                  </View>

                  {selectedBadge.passiveBonus > 0 && (
                    <View style={styles.modalStatItem}>
                      <Text style={[styles.modalStatLabel, { color: isDarkMode ? '#9CA3AF' : '#6B7280' }]}>
                        {language === 'cs' ? 'Pasivní bonus' : 'Passive Bonus'}
                      </Text>
                      <Text style={[styles.modalStatValue, { color: isDarkMode ? 'white' : '#1F2937' }]}>
                        +{(selectedBadge.passiveBonus * 100).toFixed(0)}% XP
                      </Text>
                    </View>
                  )}
                </View>

                {earnedBadgeIds.includes(selectedBadge.id) && (
                  <View style={styles.earnedBanner}>
                    <Award color="#10B981" size={20} />
                    <Text style={styles.earnedBannerText}>
                      {language === 'cs' ? 'Odemčeno!' : 'Unlocked!'}
                    </Text>
                  </View>
                )}
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  backButton: {
    padding: 8,
    marginLeft: 8,
  },
  header: {
    padding: 32,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 48,
    fontWeight: 'bold',
    color: 'white',
    marginTop: 16,
  },
  headerSubtitle: {
    fontSize: 16,
    color: 'white',
    opacity: 0.9,
    marginTop: 8,
  },
  filterContainer: {
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  filterButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    marginRight: 12,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  filterButtonActive: {
    borderColor: '#667eea',
  },
  filterButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  filterButtonTextActive: {
    color: '#667eea',
  },
  badgesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 12,
    paddingBottom: 32,
  },
  badgeCard: {
    width: '31%',
    aspectRatio: 0.8,
    margin: '1%',
    borderRadius: 16,
    padding: 12,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  badgeCardLocked: {
    opacity: 0.5,
  },
  badgeIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    position: 'relative',
  },
  badgeEmoji: {
    fontSize: 32,
  },
  lockOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeName: {
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 4,
  },
  badgeNameLocked: {
    color: '#9CA3AF',
  },
  rarityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    marginTop: 4,
  },
  rarityText: {
    fontSize: 10,
    fontWeight: '600',
    color: 'white',
  },
  earnedDate: {
    fontSize: 10,
    color: '#10B981',
    marginTop: 4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
  },
  closeButton: {
    position: 'absolute',
    top: 16,
    right: 16,
    padding: 8,
    zIndex: 1,
  },
  modalBadgeIcon: {
    width: 120,
    height: 120,
    borderRadius: 60,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  modalBadgeEmoji: {
    fontSize: 64,
  },
  modalBadgeName: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 8,
  },
  modalRarityBadge: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 12,
    marginBottom: 16,
  },
  modalRarityText: {
    fontSize: 14,
    fontWeight: '600',
    color: 'white',
  },
  modalBadgeDescription: {
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 24,
  },
  modalStats: {
    width: '100%',
    gap: 12,
  },
  modalStatItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.1)',
  },
  modalStatLabel: {
    fontSize: 14,
  },
  modalStatValue: {
    fontSize: 16,
    fontWeight: '600',
  },
  earnedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 24,
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: '#D1FAE5',
    borderRadius: 12,
  },
  earnedBannerText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#10B981',
  },
});
