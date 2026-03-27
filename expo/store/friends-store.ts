import createContextHook from '@nkzw/create-context-hook';
import { useState, useCallback, useMemo } from 'react';

export interface Friend {
  id: string;
  email: string;
  username: string;
  displayName: string;
  status: 'accepted' | 'pending';
  friendsSince?: string;
  requestedAt?: string;
}

export interface FriendRequest {
  id: string;
  email: string;
  username: string;
  displayName: string;
  requestedAt: string;
}

export const [FriendsProvider, useFriendsStore] = createContextHook(() => {
  const [friends, setFriends] = useState<Friend[]>([]);
  const [incomingRequests, setIncomingRequests] = useState<FriendRequest[]>([]);
  const [outgoingRequests, setOutgoingRequests] = useState<FriendRequest[]>([]);
  const [searchResults, setSearchResults] = useState<Friend[]>([]);

  const addFriend = useCallback((friend: Friend) => {
    setFriends(prev => {
      const exists = prev.find(f => f.id === friend.id);
      if (exists) return prev;
      return [...prev, friend];
    });
  }, []);

  const removeFriend = useCallback((friendId: string) => {
    setFriends(prev => prev.filter(f => f.id !== friendId));
  }, []);

  const addIncomingRequest = useCallback((request: FriendRequest) => {
    setIncomingRequests(prev => {
      const exists = prev.find(r => r.id === request.id);
      if (exists) return prev;
      return [...prev, request];
    });
  }, []);

  const removeIncomingRequest = useCallback((requestId: string) => {
    setIncomingRequests(prev => prev.filter(r => r.id !== requestId));
  }, []);

  const addOutgoingRequest = useCallback((request: FriendRequest) => {
    setOutgoingRequests(prev => {
      const exists = prev.find(r => r.id === request.id);
      if (exists) return prev;
      return [...prev, request];
    });
  }, []);

  const removeOutgoingRequest = useCallback((requestId: string) => {
    setOutgoingRequests(prev => prev.filter(r => r.id !== requestId));
  }, []);

  const updateSearchResults = useCallback((results: Friend[]) => {
    setSearchResults(results);
  }, []);

  const clearSearchResults = useCallback(() => {
    setSearchResults([]);
  }, []);

  const acceptRequest = useCallback((requestId: string) => {
    const request = incomingRequests.find(r => r.id === requestId);
    if (request) {
      addFriend({
        ...request,
        status: 'accepted' as const,
        friendsSince: new Date().toISOString(),
      });
      removeIncomingRequest(requestId);
    }
  }, [incomingRequests, addFriend, removeIncomingRequest]);

  const rejectRequest = useCallback((requestId: string) => {
    removeIncomingRequest(requestId);
  }, [removeIncomingRequest]);

  const cancelRequest = useCallback((requestId: string) => {
    removeOutgoingRequest(requestId);
  }, [removeOutgoingRequest]);

  const totalFriends = useMemo(() => friends.length, [friends]);
  const totalIncomingRequests = useMemo(() => incomingRequests.length, [incomingRequests]);
  const totalOutgoingRequests = useMemo(() => outgoingRequests.length, [outgoingRequests]);

  return useMemo(() => ({
    friends,
    incomingRequests,
    outgoingRequests,
    searchResults,
    addFriend,
    removeFriend,
    addIncomingRequest,
    removeIncomingRequest,
    addOutgoingRequest,
    removeOutgoingRequest,
    updateSearchResults,
    clearSearchResults,
    acceptRequest,
    rejectRequest,
    cancelRequest,
    totalFriends,
    totalIncomingRequests,
    totalOutgoingRequests,
    setFriends,
    setIncomingRequests,
    setOutgoingRequests,
  }), [
    friends,
    incomingRequests,
    outgoingRequests,
    searchResults,
    addFriend,
    removeFriend,
    addIncomingRequest,
    removeIncomingRequest,
    addOutgoingRequest,
    removeOutgoingRequest,
    updateSearchResults,
    clearSearchResults,
    acceptRequest,
    rejectRequest,
    cancelRequest,
    totalFriends,
    totalIncomingRequests,
    totalOutgoingRequests,
  ]);
});
