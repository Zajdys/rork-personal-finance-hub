import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';

import {
  Search,
  UserPlus,
  Users,
  X,
  Check,
  Trash2,
  ChevronRight,
  ArrowLeft,
} from 'lucide-react-native';
import { useSettingsStore } from '@/store/settings-store';
import { useLanguageStore } from '@/store/language-store';
import { useFriendsStore } from '@/store/friends-store';
import { trpc, trpcClient } from '@/lib/trpc';

export default function FriendsScreen() {
  const { isDarkMode } = useSettingsStore();
  const { language } = useLanguageStore();
  const router = useRouter();
  const friendsStore = useFriendsStore();
  
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'friends' | 'requests' | 'search'>('friends');
  const [isSearching, setIsSearching] = useState<boolean>(false);

  const currentUserId = '1';

  const friendsQuery = trpc.friends.list.useQuery({ userId: currentUserId });
  const pendingQuery = trpc.friends.pending.useQuery({ userId: currentUserId });

  React.useEffect(() => {
    if (friendsQuery.data) {
      friendsStore.setFriends(friendsQuery.data.map(f => ({
        ...f,
        status: 'accepted' as const,
      })));
    }
  }, [friendsQuery.data, friendsStore]);

  React.useEffect(() => {
    if (pendingQuery.data) {
      friendsStore.setIncomingRequests(pendingQuery.data.incoming);
      friendsStore.setOutgoingRequests(pendingQuery.data.outgoing);
    }
  }, [pendingQuery.data, friendsStore]);

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    
    setIsSearching(true);
    try {
      const results = await trpcClient.friends.search.query({
        query: searchQuery,
        currentUserId,
      });
      friendsStore.updateSearchResults(results.map((r: any) => ({
        ...r,
        status: 'pending' as const,
      })));
      setActiveTab('search');
    } catch (error) {
      console.error('Search error:', error);
      Alert.alert(
        language === 'cs' ? 'Chyba' : 'Error',
        language === 'cs' ? 'Nepodařilo se vyhledat uživatele' : 'Failed to search users'
      );
    } finally {
      setIsSearching(false);
    }
  };

  const handleSendRequest = async (friendId: string) => {
    try {
      await trpcClient.friends.sendRequest.mutate({ userId: currentUserId, friendId });
      Alert.alert(
        language === 'cs' ? 'Úspěch' : 'Success',
        language === 'cs' ? 'Žádost o přátelství odeslána' : 'Friend request sent'
      );
      pendingQuery.refetch();
    } catch (error) {
      console.error('Send request error:', error);
      Alert.alert(
        language === 'cs' ? 'Chyba' : 'Error',
        language === 'cs' ? 'Nepodařilo se odeslat žádost' : 'Failed to send request'
      );
    }
  };

  const handleAcceptRequest = async (friendId: string) => {
    try {
      await trpcClient.friends.acceptRequest.mutate({ userId: currentUserId, friendId });
      friendsQuery.refetch();
      pendingQuery.refetch();
    } catch (error) {
      console.error('Accept request error:', error);
      Alert.alert(
        language === 'cs' ? 'Chyba' : 'Error',
        language === 'cs' ? 'Nepodařilo se přijmout žádost' : 'Failed to accept request'
      );
    }
  };

  const handleRejectRequest = async (friendId: string) => {
    try {
      await trpcClient.friends.rejectRequest.mutate({ userId: currentUserId, friendId });
      pendingQuery.refetch();
    } catch (error) {
      console.error('Reject request error:', error);
      Alert.alert(
        language === 'cs' ? 'Chyba' : 'Error',
        language === 'cs' ? 'Nepodařilo se odmítnout žádost' : 'Failed to reject request'
      );
    }
  };

  const handleRemoveFriend = async (friendId: string) => {
    Alert.alert(
      language === 'cs' ? 'Odebrat přítele' : 'Remove Friend',
      language === 'cs' ? 'Opravdu chcete odebrat tohoto přítele?' : 'Are you sure you want to remove this friend?',
      [
        { text: language === 'cs' ? 'Zrušit' : 'Cancel', style: 'cancel' },
        {
          text: language === 'cs' ? 'Odebrat' : 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await trpcClient.friends.remove.mutate({ userId: currentUserId, friendId });
              friendsQuery.refetch();
            } catch (error) {
              console.error('Remove friend error:', error);
              Alert.alert(
                language === 'cs' ? 'Chyba' : 'Error',
                language === 'cs' ? 'Nepodařilo se odebrat přítele' : 'Failed to remove friend'
              );
            }
          },
        },
      ]
    );
  };

  const FriendCard = ({ friend, showActions = false }: any) => (
    <TouchableOpacity
      style={[styles.friendCard, { backgroundColor: isDarkMode ? '#374151' : 'white' }]}
      onPress={() => router.push('/friend-comparison' as any)}
    >
      <View style={styles.friendAvatar}>
        <Text style={styles.friendAvatarText}>
          {friend.displayName.charAt(0).toUpperCase()}
        </Text>
      </View>
      <View style={styles.friendInfo}>
        <Text style={[styles.friendName, { color: isDarkMode ? 'white' : '#1F2937' }]}>
          {friend.displayName}
        </Text>
        <Text style={[styles.friendUsername, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>
          @{friend.username}
        </Text>
      </View>
      {showActions ? (
        <TouchableOpacity
          style={styles.removeButton}
          onPress={() => handleRemoveFriend(friend.id)}
        >
          <Trash2 color="#EF4444" size={20} />
        </TouchableOpacity>
      ) : (
        <ChevronRight color="#9CA3AF" size={20} />
      )}
    </TouchableOpacity>
  );

  const RequestCard = ({ request, type }: any) => (
    <View style={[styles.requestCard, { backgroundColor: isDarkMode ? '#374151' : 'white' }]}>
      <View style={styles.friendAvatar}>
        <Text style={styles.friendAvatarText}>
          {request.displayName.charAt(0).toUpperCase()}
        </Text>
      </View>
      <View style={styles.friendInfo}>
        <Text style={[styles.friendName, { color: isDarkMode ? 'white' : '#1F2937' }]}>
          {request.displayName}
        </Text>
        <Text style={[styles.friendUsername, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>
          @{request.username}
        </Text>
      </View>
      {type === 'incoming' ? (
        <View style={styles.requestActions}>
          <TouchableOpacity
            style={styles.acceptButton}
            onPress={() => handleAcceptRequest(request.id)}
          >
            <Check color="white" size={20} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.rejectButton}
            onPress={() => handleRejectRequest(request.id)}
          >
            <X color="white" size={20} />
          </TouchableOpacity>
        </View>
      ) : (
        <Text style={[styles.pendingText, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>
          {language === 'cs' ? 'Čeká' : 'Pending'}
        </Text>
      )}
    </View>
  );

  const SearchResultCard = ({ user }: any) => {
    const isFriend = friendsStore.friends.some(f => f.id === user.id);
    const hasPendingRequest = friendsStore.outgoingRequests.some(r => r.id === user.id);

    return (
      <View style={[styles.searchResultCard, { backgroundColor: isDarkMode ? '#374151' : 'white' }]}>
        <View style={styles.friendAvatar}>
          <Text style={styles.friendAvatarText}>
            {user.displayName.charAt(0).toUpperCase()}
          </Text>
        </View>
        <View style={styles.friendInfo}>
          <Text style={[styles.friendName, { color: isDarkMode ? 'white' : '#1F2937' }]}>
            {user.displayName}
          </Text>
          <Text style={[styles.friendUsername, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>
            @{user.username}
          </Text>
        </View>
        {isFriend ? (
          <Text style={[styles.friendBadge, { color: '#10B981' }]}>
            {language === 'cs' ? 'Přítel' : 'Friend'}
          </Text>
        ) : hasPendingRequest ? (
          <Text style={[styles.pendingText, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>
            {language === 'cs' ? 'Čeká' : 'Pending'}
          </Text>
        ) : (
          <TouchableOpacity
            style={styles.addButton}
            onPress={() => handleSendRequest(user.id)}
          >
            <UserPlus color="white" size={20} />
          </TouchableOpacity>
        )}
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: isDarkMode ? '#111827' : '#F8FAFC' }]}>
      <Stack.Screen
        options={{
          title: language === 'cs' ? 'Přátelé' : 'Friends',
          headerStyle: {
            backgroundColor: isDarkMode ? '#1F2937' : 'white',
          },
          headerTintColor: isDarkMode ? 'white' : '#1F2937',
          headerLeft: () => (
            <TouchableOpacity
              onPress={() => router.back()}
              style={{ marginLeft: 16 }}
            >
              <ArrowLeft color={isDarkMode ? 'white' : '#1F2937'} size={24} />
            </TouchableOpacity>
          ),
        }}
      />

      <View style={[styles.searchContainer, { backgroundColor: isDarkMode ? '#1F2937' : 'white' }]}>
        <View style={[styles.searchInputContainer, { backgroundColor: isDarkMode ? '#374151' : '#F3F4F6' }]}>
          <Search color={isDarkMode ? '#9CA3AF' : '#6B7280'} size={20} />
          <TextInput
            style={[styles.searchInput, { color: isDarkMode ? 'white' : '#1F2937' }]}
            placeholder={language === 'cs' ? 'Hledat uživatele...' : 'Search users...'}
            placeholderTextColor={isDarkMode ? '#9CA3AF' : '#6B7280'}
            value={searchQuery}
            onChangeText={setSearchQuery}
            onSubmitEditing={handleSearch}
          />
          {isSearching && <ActivityIndicator color="#667eea" />}
        </View>
      </View>

      <View style={styles.tabsContainer}>
        <TouchableOpacity
          style={[
            styles.tab,
            activeTab === 'friends' && styles.activeTab,
          ]}
          onPress={() => setActiveTab('friends')}
        >
          <Users
            color={activeTab === 'friends' ? '#667eea' : (isDarkMode ? '#9CA3AF' : '#6B7280')}
            size={20}
          />
          <Text
            style={[
              styles.tabText,
              { color: activeTab === 'friends' ? '#667eea' : (isDarkMode ? '#9CA3AF' : '#6B7280') },
            ]}
          >
            {language === 'cs' ? 'Přátelé' : 'Friends'} ({friendsStore.totalFriends})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.tab,
            activeTab === 'requests' && styles.activeTab,
          ]}
          onPress={() => setActiveTab('requests')}
        >
          <UserPlus
            color={activeTab === 'requests' ? '#667eea' : (isDarkMode ? '#9CA3AF' : '#6B7280')}
            size={20}
          />
          <Text
            style={[
              styles.tabText,
              { color: activeTab === 'requests' ? '#667eea' : (isDarkMode ? '#9CA3AF' : '#6B7280') },
            ]}
          >
            {language === 'cs' ? 'Žádosti' : 'Requests'} ({friendsStore.totalIncomingRequests})
          </Text>
        </TouchableOpacity>

        {friendsStore.searchResults.length > 0 && (
          <TouchableOpacity
            style={[
              styles.tab,
              activeTab === 'search' && styles.activeTab,
            ]}
            onPress={() => setActiveTab('search')}
          >
            <Search
              color={activeTab === 'search' ? '#667eea' : (isDarkMode ? '#9CA3AF' : '#6B7280')}
              size={20}
            />
            <Text
              style={[
                styles.tabText,
                { color: activeTab === 'search' ? '#667eea' : (isDarkMode ? '#9CA3AF' : '#6B7280') },
              ]}
            >
              {language === 'cs' ? 'Výsledky' : 'Results'}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {activeTab === 'friends' && (
          <View style={styles.section}>
            {friendsQuery.isLoading ? (
              <ActivityIndicator color="#667eea" size="large" style={styles.loader} />
            ) : friendsStore.friends.length === 0 ? (
              <View style={styles.emptyState}>
                <Users color={isDarkMode ? '#9CA3AF' : '#6B7280'} size={48} />
                <Text style={[styles.emptyStateText, { color: isDarkMode ? '#9CA3AF' : '#6B7280' }]}>
                  {language === 'cs' ? 'Zatím nemáte žádné přátele' : 'No friends yet'}
                </Text>
                <Text style={[styles.emptyStateSubtext, { color: isDarkMode ? '#6B7280' : '#9CA3AF' }]}>
                  {language === 'cs' ? 'Vyhledejte uživatele a přidejte si je' : 'Search for users and add them'}
                </Text>
              </View>
            ) : (
              friendsStore.friends.map((friend) => (
                <FriendCard key={friend.id} friend={friend} showActions={true} />
              ))
            )}
          </View>
        )}

        {activeTab === 'requests' && (
          <View style={styles.section}>
            {pendingQuery.isLoading ? (
              <ActivityIndicator color="#667eea" size="large" style={styles.loader} />
            ) : (
              <>
                {friendsStore.incomingRequests.length > 0 && (
                  <View style={styles.subsection}>
                    <Text style={[styles.subsectionTitle, { color: isDarkMode ? 'white' : '#1F2937' }]}>
                      {language === 'cs' ? 'Příchozí žádosti' : 'Incoming Requests'}
                    </Text>
                    {friendsStore.incomingRequests.map((request) => (
                      <RequestCard key={request.id} request={request} type="incoming" />
                    ))}
                  </View>
                )}

                {friendsStore.outgoingRequests.length > 0 && (
                  <View style={styles.subsection}>
                    <Text style={[styles.subsectionTitle, { color: isDarkMode ? 'white' : '#1F2937' }]}>
                      {language === 'cs' ? 'Odeslané žádosti' : 'Sent Requests'}
                    </Text>
                    {friendsStore.outgoingRequests.map((request) => (
                      <RequestCard key={request.id} request={request} type="outgoing" />
                    ))}
                  </View>
                )}

                {friendsStore.incomingRequests.length === 0 && friendsStore.outgoingRequests.length === 0 && (
                  <View style={styles.emptyState}>
                    <UserPlus color={isDarkMode ? '#9CA3AF' : '#6B7280'} size={48} />
                    <Text style={[styles.emptyStateText, { color: isDarkMode ? '#9CA3AF' : '#6B7280' }]}>
                      {language === 'cs' ? 'Žádné žádosti o přátelství' : 'No friend requests'}
                    </Text>
                  </View>
                )}
              </>
            )}
          </View>
        )}

        {activeTab === 'search' && (
          <View style={styles.section}>
            {friendsStore.searchResults.length === 0 ? (
              <View style={styles.emptyState}>
                <Search color={isDarkMode ? '#9CA3AF' : '#6B7280'} size={48} />
                <Text style={[styles.emptyStateText, { color: isDarkMode ? '#9CA3AF' : '#6B7280' }]}>
                  {language === 'cs' ? 'Žádné výsledky' : 'No results'}
                </Text>
              </View>
            ) : (
              friendsStore.searchResults.map((user) => (
                <SearchResultCard key={user.id} user={user} />
              ))
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  searchContainer: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  searchInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    gap: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
  },
  tabsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 8,
  },
  activeTab: {
    backgroundColor: '#EEF2FF',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
  },
  content: {
    flex: 1,
  },
  section: {
    padding: 16,
  },
  subsection: {
    marginBottom: 24,
  },
  subsectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  friendCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  requestCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  searchResultCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  friendAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#667eea',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  friendAvatarText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: 'white',
  },
  friendInfo: {
    flex: 1,
  },
  friendName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  friendUsername: {
    fontSize: 14,
  },
  removeButton: {
    padding: 8,
  },
  requestActions: {
    flexDirection: 'row',
    gap: 8,
  },
  acceptButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#10B981',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rejectButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#667eea',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pendingText: {
    fontSize: 14,
    fontWeight: '600',
  },
  friendBadge: {
    fontSize: 14,
    fontWeight: '600',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
  },
  emptyStateText: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: 16,
  },
  emptyStateSubtext: {
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
  },
  loader: {
    marginTop: 48,
  },
});
