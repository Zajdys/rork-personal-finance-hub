import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Stack, useRouter } from 'expo-router';
import {
  Send,
  User,
  Bot,
  AlertCircle,
  CheckCircle,
  ArrowLeft,
} from 'lucide-react-native';
import { trpc } from '@/lib/trpc';

interface Message {
  id: string;
  text: string;
  isUser: boolean;
  timestamp: Date;
}

const SUPPORT_CONTEXT = `
Jsi MoneyBuddy Support AI - asistent technické podpory pro aplikaci MoneyBuddy.

Tvoje hlavní úkoly:
1. Pomáhat uživatelům s technickými problémy v aplikaci
2. Odpovídat na otázky o funkcích aplikace
3. Řešit stížnosti a problémy uživatelů
4. Být přátelský, trpělivý a profesionální

Pokud nemůžeš problém vyřešit nebo je to mimo tvoje kompetence:
- Řekni uživateli, že jeho problém bude eskalován na lidskou podporu
- Zeptej se na email pro kontakt (pokud ho nemáš)
- Shrň problém jasně a stručně

FORMÁTOVÁNÍ ODPOVĚDÍ:
- Piš krátké, jasné věty
- Používej odrážky pro lepší čitelnost
- Buď konkrétní a praktický
- Používej emoji pro přátelštější tón (ale ne přehnaně)

Odpovídej v češtině.
`;

export default function SupportChatScreen() {
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      text: 'Ahoj! 👋 Jsem MoneyBuddy Support AI. S čím ti mohu pomoci?',
      isUser: false,
      timestamp: new Date(),
    },
  ]);
  const [inputText, setInputText] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [userEmail, setUserEmail] = useState<string>('');
  const [needsEscalation, setNeedsEscalation] = useState<boolean>(false);
  const scrollViewRef = useRef<ScrollView>(null);

  const sendNotificationMutation = trpc.support.sendNotification.useMutation();

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 100);
  };

  const checkIfNeedsEscalation = (aiResponse: string): boolean => {
    const escalationKeywords = [
      'eskalovat',
      'lidská podpora',
      'kontaktovat tým',
      'nemůžu vyřešit',
      'mimo moje kompetence',
      'předat dál',
    ];
    
    return escalationKeywords.some(keyword => 
      aiResponse.toLowerCase().includes(keyword)
    );
  };

  const sendMessage = async (text: string) => {
    if (!text.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      text: text.trim(),
      isUser: true,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInputText('');
    setIsLoading(true);

    try {
      const response = await fetch('https://toolkit.rork.com/text/llm/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: [
            {
              role: 'system',
              content: SUPPORT_CONTEXT,
            },
            ...messages.slice(-8).map(msg => ({
              role: msg.isUser ? 'user' : 'assistant',
              content: msg.text,
            })),
            {
              role: 'user',
              content: text.trim(),
            },
          ],
        }),
      });

      if (!response.ok) {
        throw new Error('Chyba při komunikaci s AI');
      }

      const data = await response.json();
      
      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        text: data.completion,
        isUser: false,
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, aiMessage]);

      if (checkIfNeedsEscalation(data.completion)) {
        setNeedsEscalation(true);
      }
    } catch (error) {
      console.error('Error sending message:', error);
      Alert.alert(
        'Chyba',
        'Nepodařilo se odeslat zprávu. Zkuste to prosím znovu.',
        [{ text: 'OK' }]
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleEscalation = async () => {
    if (!userEmail.trim()) {
      Alert.alert('Email chybí', 'Prosím zadej svůj email pro kontakt.');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(userEmail.trim())) {
      Alert.alert('Neplatný email', 'Prosím zadej platnou emailovou adresu.');
      return;
    }

    setIsLoading(true);

    try {
      const lastUserMessage = messages.filter(m => m.isUser).pop();
      const issue = lastUserMessage?.text || 'Problém nebyl specifikován';

      await sendNotificationMutation.mutateAsync({
        userName: 'Uživatel',
        userEmail: userEmail.trim(),
        issue,
        conversationHistory: messages.map(m => ({
          role: m.isUser ? 'user' as const : 'assistant' as const,
          content: m.text,
          timestamp: m.timestamp.toISOString(),
        })),
      });

      Alert.alert(
        'Odesláno! ✅',
        'Tvůj problém byl odeslán našemu týmu. Ozveme se ti na email co nejdříve.',
        [
          {
            text: 'OK',
            onPress: () => router.back(),
          },
        ]
      );
    } catch (error) {
      console.error('Error escalating support:', error);
      Alert.alert(
        'Chyba',
        'Nepodařilo se odeslat notifikaci. Zkus to prosím znovu nebo nás kontaktuj na moneybuddy@email.cz',
        [{ text: 'OK' }]
      );
    } finally {
      setIsLoading(false);
    }
  };

  const MessageBubble = ({ message }: { message: Message }) => (
    <View style={[styles.messageBubble, message.isUser ? styles.userBubble : styles.aiBubble]}>
      <View style={styles.messageHeader}>
        {message.isUser ? (
          <User color="#667eea" size={16} />
        ) : (
          <Bot color="#10B981" size={16} />
        )}
        <Text style={styles.messageAuthor}>
          {message.isUser ? 'Ty' : 'Support AI'}
        </Text>
      </View>
      <Text style={[styles.messageText, message.isUser ? styles.userText : styles.aiText]}>
        {message.text}
      </Text>
      <Text style={styles.messageTime}>
        {message.timestamp.toLocaleTimeString('cs-CZ', {
          hour: '2-digit',
          minute: '2-digit',
        })}
      </Text>
    </View>
  );

  return (
    <KeyboardAvoidingView 
      style={styles.container} 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <Stack.Screen 
        options={{
          headerShown: true,
          headerStyle: {
            backgroundColor: '#667eea',
          },
          headerTintColor: 'white',
          headerTitle: 'Live Chat Podpora',
          headerTitleStyle: {
            fontWeight: 'bold',
          },
          headerLeft: () => (
            <TouchableOpacity onPress={() => router.back()} style={{ marginLeft: 8 }}>
              <ArrowLeft color="white" size={24} />
            </TouchableOpacity>
          ),
        }}
      />

      <View style={styles.headerBanner}>
        <LinearGradient
          colors={['#667eea', '#764ba2'] as const}
          style={styles.headerGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <Bot color="white" size={32} />
          <View style={styles.headerText}>
            <Text style={styles.headerTitle}>Support AI</Text>
            <Text style={styles.headerSubtitle}>Jsme tu pro tebe 24/7</Text>
          </View>
          <View style={styles.statusIndicator}>
            <View style={styles.onlineIndicator} />
            <Text style={styles.statusText}>Online</Text>
          </View>
        </LinearGradient>
      </View>

      {needsEscalation && (
        <View style={styles.escalationBanner}>
          <AlertCircle color="#F59E0B" size={20} />
          <Text style={styles.escalationText}>
            Problém bude předán lidské podpoře
          </Text>
        </View>
      )}

      <ScrollView
        ref={scrollViewRef}
        style={styles.messagesContainer}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.messagesContent}
      >
        {messages.map(message => (
          <MessageBubble key={message.id} message={message} />
        ))}
        {isLoading && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator color="#667eea" size="small" />
            <Text style={styles.loadingText}>Support AI přemýšlí...</Text>
          </View>
        )}
      </ScrollView>

      {needsEscalation && (
        <View style={styles.escalationForm}>
          <Text style={styles.escalationFormTitle}>Zadej svůj email pro kontakt:</Text>
          <TextInput
            style={styles.emailInput}
            value={userEmail}
            onChangeText={setUserEmail}
            placeholder="tvuj@email.cz"
            placeholderTextColor="#9CA3AF"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TouchableOpacity
            style={styles.escalationButton}
            onPress={handleEscalation}
            disabled={isLoading}
          >
            <LinearGradient
              colors={['#10B981', '#059669'] as const}
              style={styles.escalationButtonGradient}
            >
              <CheckCircle color="white" size={20} />
              <Text style={styles.escalationButtonText}>Odeslat týmu podpory</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.inputContainer}>
        <View style={styles.inputWrapper}>
          <TextInput
            style={styles.textInput}
            value={inputText}
            onChangeText={setInputText}
            placeholder="Popiš svůj problém..."
            placeholderTextColor="#9CA3AF"
            multiline
            maxLength={500}
            editable={!isLoading}
          />
          <TouchableOpacity
            style={[styles.sendButton, (!inputText.trim() || isLoading) && styles.sendButtonDisabled]}
            onPress={() => sendMessage(inputText)}
            disabled={!inputText.trim() || isLoading}
          >
            <LinearGradient
              colors={(!inputText.trim() || isLoading) ? ['#D1D5DB', '#9CA3AF'] as const : ['#667eea', '#764ba2'] as const}
              style={styles.sendButtonGradient}
            >
              <Send color="white" size={20} />
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  headerBanner: {
    overflow: 'hidden',
  },
  headerGradient: {
    paddingVertical: 16,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerText: {
    marginLeft: 12,
    flex: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: 'white',
  },
  headerSubtitle: {
    fontSize: 14,
    color: 'white',
    opacity: 0.9,
  },
  statusIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  onlineIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10B981',
    marginRight: 6,
  },
  statusText: {
    fontSize: 12,
    color: 'white',
    opacity: 0.8,
  },
  escalationBanner: {
    backgroundColor: '#FEF3C7',
    paddingVertical: 12,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#FCD34D',
  },
  escalationText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#92400E',
    marginLeft: 8,
  },
  messagesContainer: {
    flex: 1,
  },
  messagesContent: {
    padding: 20,
    paddingBottom: 10,
  },
  messageBubble: {
    marginBottom: 16,
    maxWidth: '85%',
  },
  userBubble: {
    alignSelf: 'flex-end',
  },
  aiBubble: {
    alignSelf: 'flex-start',
  },
  messageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  messageAuthor: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
    marginLeft: 6,
  },
  messageText: {
    fontSize: 15,
    lineHeight: 22,
    padding: 12,
    borderRadius: 16,
  },
  userText: {
    backgroundColor: '#667eea',
    color: 'white',
    borderBottomRightRadius: 4,
  },
  aiText: {
    backgroundColor: 'white',
    color: '#1F2937',
    borderBottomLeftRadius: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  messageTime: {
    fontSize: 11,
    color: '#9CA3AF',
    marginTop: 4,
    marginLeft: 12,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: 'white',
    padding: 12,
    borderRadius: 16,
    borderBottomLeftRadius: 4,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  loadingText: {
    fontSize: 14,
    color: '#6B7280',
    marginLeft: 8,
    fontStyle: 'italic',
  },
  escalationForm: {
    backgroundColor: 'white',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  escalationFormTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 12,
  },
  emailInput: {
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: '#1F2937',
    marginBottom: 12,
  },
  escalationButton: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  escalationButtonGradient: {
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  escalationButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
    marginLeft: 8,
  },
  inputContainer: {
    backgroundColor: 'white',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: '#F3F4F6',
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  textInput: {
    flex: 1,
    fontSize: 16,
    color: '#1F2937',
    maxHeight: 100,
    paddingVertical: 8,
  },
  sendButton: {
    marginLeft: 12,
    borderRadius: 20,
    overflow: 'hidden',
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
  sendButtonGradient: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
