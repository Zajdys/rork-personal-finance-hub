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
  Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Stack } from 'expo-router';
import {
  Send,
  User,
  Lightbulb,
  TrendingUp,
  PiggyBank,
  CreditCard,
  Target,
  ArrowLeft,
} from 'lucide-react-native';
import { useFinanceStore } from '@/store/finance-store';
import { useBuddyStore } from '@/store/buddy-store';
import { useRouter } from 'expo-router';

interface Message {
  id: string;
  text: string;
  isUser: boolean;
  timestamp: Date;
}

interface QuickAction {
  id: string;
  title: string;
  icon: React.ComponentType<any>;
  color: readonly [string, string];
  prompt: string;
}

const QUICK_ACTIONS: QuickAction[] = [
  {
    id: 'budget',
    title: 'Rozpočet',
    icon: Target,
    color: ['#F59E0B', '#D97706'] as const,
    prompt: 'Pomoz mi vytvořit měsíční rozpočet. Mám příjem X Kč a chci vědět, jak rozdělit peníze na výdaje, spoření a investice.',
  },
  {
    id: 'investment',
    title: 'Investice',
    icon: TrendingUp,
    color: ['#10B981', '#059669'] as const,
    prompt: 'Vysvětli mi základy investování. Jaké jsou nejlepší možnosti pro začátečníka v České republice?',
  },
  {
    id: 'savings',
    title: 'Spoření',
    icon: PiggyBank,
    color: ['#8B5CF6', '#7C3AED'] as const,
    prompt: 'Jak mám spořit peníze efektivně? Jaké jsou nejlepší spořicí účty a strategie?',
  },
  {
    id: 'debt',
    title: 'Dluhy',
    icon: CreditCard,
    color: ['#EF4444', '#DC2626'] as const,
    prompt: 'Mám několik dluhů a nevím, jak je nejlépe splácet. Poraď mi se strategií splácení.',
  },
];

const FINANCIAL_CONTEXT = `
Jsi MoneyBuddy - AI asistent pro osobní finance v České republice. Tvoje znalosti pocházejí od nejlepších investorů světa jako Warren Buffett, Ray Dalio, Benjamin Graham a dalších uznávaných finančních expertů.

Tvoje hlavní principy:
1. Vždy poskytuj ověřené a praktické rady
2. Zaměř se na dlouhodobé budování bohatství
3. Zdůrazňuj důležitost diverzifikace
4. Doporučuj nízkonnákladové ETF a indexové fondy
5. Varuj před spekulacemi a get-rich-quick schématy
6. Přizpůsob rady českému trhu a legislativě
7. Buď přátelský, ale profesionální
8. Používej konkrétní příklady a čísla
9. Vždy zdůrazni důležitost emergency fondu
10. Doporučuj pouze regulované a důvěryhodné finanční produkty

FORMÁTOVÁNÍ ODPOVĚDÍ - VELMI DŮLEŽITÉ:
- Piš krátké, jasné věty (maximálně 15-20 slov)
- Používej odstavce - každá hlavní myšlenka = nový řádek
- Strukturuj odpovědi pomocí odrážek nebo číslování
- Vyvaruj se dlouhých souvětí
- Každý odstavec by měl mít maximálně 2-3 věty
- Používej mezery mezi sekcemi pro lepší čitelnost
- Zdůrazňuj klíčové informace pomocí jednoduchých frází

Odpovídej v češtině, stručně ale informativně. Pokud se uživatel ptá na něco mimo finance, zdvořile ho přesměruj zpět k finančním tématům.
`;

export default function MoneyBuddyChatScreen() {
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      text: 'Ahoj! 👋 Jsem MoneyBuddy, tvůj AI asistent pro osobní finance. Moje znalosti pocházejí od nejlepších investorů světa jako Warren Buffett a Ray Dalio. Jak ti dnes mohu pomoci s financemi?',
      isUser: false,
      timestamp: new Date(),
    },
  ]);
  const [inputText, setInputText] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const scrollViewRef = useRef<ScrollView>(null);
  const { balance, totalIncome, totalExpenses } = useFinanceStore();
  const { addPoints } = useBuddyStore();

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 100);
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
      const userFinanceContext = `
Kontextové informace o uživateli:
- Aktuální zůstatek: ${balance.toLocaleString('cs-CZ')} Kč
- Měsíční příjmy: ${totalIncome.toLocaleString('cs-CZ')} Kč
- Měsíční výdaje: ${totalExpenses.toLocaleString('cs-CZ')} Kč
      `;

      const response = await fetch('https://toolkit.rork.com/text/llm/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: [
            {
              role: 'system',
              content: FINANCIAL_CONTEXT + userFinanceContext,
            },
            ...messages.slice(-5).map(msg => ({
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
      addPoints(5);
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

  const handleQuickAction = (action: QuickAction) => {
    sendMessage(action.prompt);
  };

  const MessageBubble = ({ message }: { message: Message }) => (
    <View style={[styles.messageBubble, message.isUser ? styles.userBubble : styles.aiBubble]}>
      <View style={styles.messageHeader}>
        {message.isUser ? (
          <User color="#667eea" size={16} />
        ) : (
          <Image 
            source={{ uri: 'https://pub-e001eb4506b145aa938b5d3badbff6a5.r2.dev/attachments/i8pqfufwbqzz9xq46kmzx' }}
            style={styles.moneyBuddyAvatar}
          />
        )}
        <Text style={styles.messageAuthor}>
          {message.isUser ? 'Ty' : 'MoneyBuddy'}
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

  const QuickActionButton = ({ action }: { action: QuickAction }) => (
    <TouchableOpacity
      style={styles.quickActionButton}
      onPress={() => handleQuickAction(action)}
      disabled={isLoading}
    >
      <LinearGradient
        colors={action.color}
        style={styles.quickActionGradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <action.icon color="white" size={20} />
        <Text style={styles.quickActionText}>{action.title}</Text>
      </LinearGradient>
    </TouchableOpacity>
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
          headerTitle: 'MoneyBuddy',
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
          <Image 
            source={{ uri: 'https://pub-e001eb4506b145aa938b5d3badbff6a5.r2.dev/attachments/i8pqfufwbqzz9xq46kmzx' }}
            style={styles.headerMoneyBuddyAvatar}
          />
          <View style={styles.headerText}>
            <Text style={styles.headerSubtitle}>AI Finanční Poradce</Text>
          </View>
          <View style={styles.statusIndicator}>
            <View style={styles.onlineIndicator} />
            <Text style={styles.statusText}>Online</Text>
          </View>
        </LinearGradient>
      </View>

      <View style={styles.quickActionsContainer}>
        <View style={styles.quickActionsHeader}>
          <Lightbulb color="#F59E0B" size={20} />
          <Text style={styles.quickActionsTitle}>Rychlé otázky</Text>
        </View>
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false}
          style={styles.quickActionsScroll}
        >
          {QUICK_ACTIONS.map(action => (
            <QuickActionButton key={action.id} action={action} />
          ))}
        </ScrollView>
      </View>

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
            <Text style={styles.loadingText}>MoneyBuddy přemýšlí...</Text>
          </View>
        )}
      </ScrollView>

      <View style={styles.inputContainer}>
        <View style={styles.inputWrapper}>
          <TextInput
            style={styles.textInput}
            value={inputText}
            onChangeText={setInputText}
            placeholder="Zeptej se na cokoliv o financích..."
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
  headerSubtitle: {
    fontSize: 14,
    color: 'white',
    fontWeight: '600',
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
  quickActionsContainer: {
    backgroundColor: 'white',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  quickActionsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  quickActionsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    marginLeft: 8,
  },
  quickActionsScroll: {
    paddingLeft: 20,
  },
  quickActionButton: {
    marginRight: 12,
    borderRadius: 12,
    overflow: 'hidden',
  },
  quickActionGradient: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 120,
  },
  quickActionText: {
    fontSize: 14,
    fontWeight: '600',
    color: 'white',
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
  moneyBuddyAvatar: {
    width: 16,
    height: 16,
    borderRadius: 8,
  },
  headerMoneyBuddyAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: 'white',
  },
});
