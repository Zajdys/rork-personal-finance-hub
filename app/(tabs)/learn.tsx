import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  Modal,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  BookOpen,
  Play,
  Award,
  Target,
  TrendingUp,
  Shield,
  PiggyBank,
  Calculator,
  Lightbulb,
  Star,
  X,
  CheckCircle,
  ArrowRight,
} from 'lucide-react-native';
import { useBuddyStore } from '@/store/buddy-store';
import { useLanguageStore } from '@/store/language-store';
import { useSettingsStore } from '@/store/settings-store';

const { width } = Dimensions.get('window');

const LESSONS = [
  {
    id: '1',
    title: 'Co je inflace?',
    description: 'Proč tvé peníze ztrácejí hodnotu',
    duration: '2 min',
    points: 10,
    difficulty: 'Začátečník',
    icon: TrendingUp,
    color: ['#F59E0B', '#D97706'],
    content: {
      sections: [
        {
          title: 'Co je inflace?',
          text: 'Inflace je růst obecné cenové hladiny v ekonomice. Jednoduše řečeno - věci se časem zdražují. Když inflace roste o 3% ročně, znamená to, že to, co dnes stojí 100 Kč, bude za rok stát 103 Kč.'
        },
        {
          title: 'Proč inflace vzniká?',
          text: 'Inflace vzniká několika způsoby:\n\n• Když je v oběhu více peněz (tisknutí peněz)\n• Když roste poptávka rychleji než nabídka\n• Když rostou náklady výroby (energie, mzdy)\n• Když se zvyšují daně'
        },
        {
          title: 'Jak inflace ovlivňuje tvé peníze?',
          text: 'Pokud máš 100 000 Kč na spořicím účtu s úrokem 1% a inflace je 4%, reálně každý rok přicházíš o 3% kupní síly. Za 10 let bude tvých 100 000 Kč mít kupní sílu pouze 74 000 Kč!'
        },
        {
          title: 'Jak se bránit inflaci?',
          text: 'Nejlepší ochranou proti inflaci jsou:\n\n• Akcie a ETF (historicky rostou rychleji než inflace)\n• Nemovitosti\n• Komodity (zlato, stříbro)\n• Investice do vzdělání a dovedností'
        }
      ]
    }
  },
  {
    id: '2',
    title: 'Složený úrok',
    description: 'Osmý div světa podle Einsteina',
    duration: '3 min',
    points: 15,
    difficulty: 'Začátečník',
    icon: Calculator,
    color: ['#10B981', '#059669'],
    content: {
      sections: [
        {
          title: 'Co je složený úrok?',
          text: 'Složený úrok znamená, že získáváš úroky nejen z původní částky, ale i z dříve získaných úroků. Je to "úrok z úroku" - tvé peníze rostou exponenciálně, ne lineárně.'
        },
        {
          title: 'Praktický příklad',
          text: 'Investuješ 10 000 Kč s výnosem 8% ročně:\n\n• Rok 1: 10 000 + 800 = 10 800 Kč\n• Rok 2: 10 800 + 864 = 11 664 Kč\n• Rok 10: 21 589 Kč\n• Rok 20: 46 610 Kč\n• Rok 30: 100 627 Kč'
        },
        {
          title: 'Pravidlo 72',
          text: 'Chceš rychle spočítat, za kolik let se tvé peníze zdvojnásobí? Vyděl číslo 72 očekávaným výnosem v procentech.\n\nPříklad: Při 8% výnosu se peníze zdvojnásobí za 72 ÷ 8 = 9 let.'
        },
        {
          title: 'Čas je klíčový',
          text: 'Složený úrok funguje nejlépe s časem. Rozdíl mezi začátkem investování ve 20 a 30 letech může být miliony korun! Začni investovat co nejdříve, i kdyby to bylo jen 1000 Kč měsíčně.'
        }
      ]
    }
  },
  {
    id: '3',
    title: 'ETF vs. akcie',
    description: 'Jak diverzifikovat portfolio',
    duration: '4 min',
    points: 20,
    difficulty: 'Pokročilý',
    icon: Shield,
    color: ['#8B5CF6', '#7C3AED'],
    content: {
      sections: [
        {
          title: 'Co jsou akcie?',
          text: 'Akcie jsou podíly ve firmě. Když koupíš akcii Apple, staneš se spoluvlastníkem této společnosti. Pokud firma roste a vydělává, cena akcií obvykle roste. Ale pokud firma krachuje, můžeš přijít o všechny peníze.'
        },
        {
          title: 'Co je ETF?',
          text: 'ETF (Exchange Traded Fund) je jako košík plný různých akcií. Místo kupování jedné akcie koupíš malý kousek stovek firem najednou. Například S&P 500 ETF obsahuje 500 největších amerických firem.'
        },
        {
          title: 'Výhody ETF',
          text: '• Diverzifikace - riziko je rozloženo mezi stovky firem\n• Nižší poplatky než aktivní fondy\n• Jednoduchost - nemusíš vybírat jednotlivé akcie\n• Transparentnost - víš přesně, co vlastníš\n• Likvidita - můžeš koupit/prodat kdykoliv'
        },
        {
          title: 'Kdy vybrat akcie vs ETF?',
          text: 'ETF pro začátečníky:\n• Chceš jednoduchost\n• Nemáš čas na analýzy\n• Chceš nižší riziko\n\nAkcie pro pokročilé:\n• Máš znalosti o firmách\n• Chceš vyšší potenciální výnosy\n• Jsi ochotný věnovat čas analýzám'
        }
      ]
    }
  },
  {
    id: '4',
    title: 'Nouzová rezerva',
    description: 'Kolik peněz mít stranou',
    duration: '2 min',
    points: 10,
    difficulty: 'Začátečník',
    icon: PiggyBank,
    color: ['#EF4444', '#DC2626'],
    content: {
      sections: [
        {
          title: 'Co je nouzová rezerva?',
          text: 'Nouzová rezerva jsou peníze, které máš odložené na neočekávané výdaje nebo ztrátu příjmu. Je to tvá finanční pojistka proti životním překvapením - ztráta práce, nemoc, oprava auta, nebo rozbité spotřebiče.'
        },
        {
          title: 'Kolik peněz mít stranou?',
          text: 'Doporučuje se mít rezervu na 3-6 měsíců běžných výdajů:\n\n• 3 měsíce - pokud máš stabilní práci\n• 6 měsíců - pokud jsi OSVČ nebo máš nestabilní příjem\n• Více - pokud máš rodinu nebo hypotéku'
        },
        {
          title: 'Kde držet nouzovou rezervu?',
          text: 'Rezerva musí být rychle dostupná a bezpečná:\n\n• Spořicí účet s vyšším úrokem\n• Termínované vklady s krátkou výpovědní lhůtou\n• Peněžní fondy\n\nNEinvestuj rezervu do akcií nebo ETF!'
        },
        {
          title: 'Jak vybudovat rezervu?',
          text: '1. Spočítej si měsíční výdaje\n2. Vynásob 3-6x podle tvé situace\n3. Nastav si automatický převod každý měsíc\n4. Začni i s malou částkou - 1000 Kč měsíčně\n5. Nepoužívej rezervu na běžné výdaje!'
        }
      ]
    }
  },
];

const QUIZZES = [
  {
    id: 'q1',
    title: 'Test inflace',
    questions: 5,
    points: 25,
    difficulty: 'Střední',
    color: ['#667eea', '#764ba2'],
    data: [
      {
        question: 'Co je inflace?',
        options: [
          'Růst cen v ekonomice',
          'Pokles cen v ekonomice', 
          'Stabilní ceny',
          'Růst mezd'
        ],
        correct: 0,
        explanation: 'Inflace je růst obecné cenové hladiny - věci se časem zdražují.'
      },
      {
        question: 'Pokud je inflace 4% a úrok na spořicím účtu 1%, reálně:',
        options: [
          'Vydělávám 3%',
          'Ztrácím 3% kupní síly',
          'Jsem na nule',
          'Vydělávám 5%'
        ],
        correct: 1,
        explanation: 'Reálný výnos = nominální úrok - inflace. 1% - 4% = -3%.'
      },
      {
        question: 'Nejlepší ochrana proti inflaci je:',
        options: [
          'Držet peníze v hotovosti',
          'Spořicí účet',
          'Investice do akcií a ETF',
          'Termínované vklady'
        ],
        correct: 2,
        explanation: 'Akcie a ETF historicky rostou rychleji než inflace.'
      },
      {
        question: 'Pokud inflace roste o 3% ročně, za 10 let bude mít 100 000 Kč kupní sílu:',
        options: [
          '130 000 Kč',
          '100 000 Kč',
          'Přibližně 74 000 Kč',
          '70 000 Kč'
        ],
        correct: 2,
        explanation: 'Kupní síla klesá podle vzorce: 100 000 / (1.03)^10 ≈ 74 000 Kč.'
      },
      {
        question: 'Hlavní příčiny inflace jsou:',
        options: [
          'Pouze tisknutí peněz',
          'Pouze růst poptávky',
          'Tisknutí peněz, růst poptávky, růst nákladů',
          'Pouze růst mezd'
        ],
        correct: 2,
        explanation: 'Inflace má více příčin: monetární politika, poptávka vs nabídka, náklady.'
      }
    ]
  },
  {
    id: 'q2',
    title: 'Složený úrok',
    questions: 4,
    points: 20,
    difficulty: 'Střední',
    color: ['#10B981', '#059669'],
    data: [
      {
        question: 'Co je složený úrok?',
        options: [
          'Úrok pouze z původní částky',
          'Úrok z původní částky + z dříve získaných úroků',
          'Dvojnásobný úrok',
          'Úrok bez poplatků'
        ],
        correct: 1,
        explanation: 'Složený úrok znamená "úrok z úroku" - exponenciální růst.'
      },
      {
        question: 'Podle pravidla 72, při 9% výnosu se peníze zdvojnásobí za:',
        options: [
          '7 let',
          '8 let',
          '9 let',
          '10 let'
        ],
        correct: 1,
        explanation: '72 ÷ 9 = 8 let. Pravidlo 72 je rychlý způsob výpočtu.'
      },
      {
        question: 'Investuješ 10 000 Kč s 10% výnosem. Za 2 roky budeš mít:',
        options: [
          '12 000 Kč',
          '12 100 Kč',
          '11 000 Kč',
          '13 000 Kč'
        ],
        correct: 1,
        explanation: 'Rok 1: 11 000 Kč, Rok 2: 11 000 + 1 100 = 12 100 Kč.'
      },
      {
        question: 'Nejdůležitější faktor pro složený úrok je:',
        options: [
          'Vysoký výnos',
          'Velká počáteční částka',
          'Čas',
          'Nízké poplatky'
        ],
        correct: 2,
        explanation: 'Čas je nejdůležitější - i malé částky mohou vyrůst ve velké sumy.'
      }
    ]
  },
  {
    id: 'q3',
    title: 'ETF vs Akcie',
    questions: 4,
    points: 20,
    difficulty: 'Pokročilý',
    color: ['#8B5CF6', '#7C3AED'],
    data: [
      {
        question: 'Hlavní výhoda ETF oproti jednotlivým akciím je:',
        options: [
          'Vyšší výnosy',
          'Diverzifikace rizika',
          'Nižší cena',
          'Rychlejší růst'
        ],
        correct: 1,
        explanation: 'ETF obsahuje stovky akcií, takže riziko je rozloženo.'
      },
      {
        question: 'S&P 500 ETF obsahuje:',
        options: [
          '100 největších amerických firem',
          '500 největších amerických firem',
          '1000 amerických firem',
          'Všechny americké firmy'
        ],
        correct: 1,
        explanation: 'S&P 500 sleduje 500 největších amerických společností.'
      },
      {
        question: 'Pro začátečníka je lepší:',
        options: [
          'Vybírat jednotlivé akcie',
          'Investovat do ETF',
          'Obchodovat denně',
          'Investovat pouze do jedné firmy'
        ],
        correct: 1,
        explanation: 'ETF je jednodušší, bezpečnější a nevyžaduje hluboké znalosti.'
      },
      {
        question: 'Pokud krachne jedna firma v ETF:',
        options: [
          'Ztratíš všechny peníze',
          'Ztratíš 50% hodnoty',
          'Dopad je minimální',
          'ETF přestane existovat'
        ],
        correct: 2,
        explanation: 'Jedna firma tvoří malou část ETF, takže dopad je minimální.'
      }
    ]
  }
];

export default function LearnScreen() {
  const { level, points, completedLessons, completeLesson, addPoints } = useBuddyStore();
  const { t } = useLanguageStore();
  const { isDarkMode } = useSettingsStore();
  const [selectedTab, setSelectedTab] = useState<'lessons' | 'quizzes'>('lessons');
  const [selectedLesson, setSelectedLesson] = useState<any>(null);
  const [selectedQuiz, setSelectedQuiz] = useState<any>(null);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState<number>(0);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [quizScore, setQuizScore] = useState<number>(0);
  const [showQuizResult, setShowQuizResult] = useState<boolean>(false);
  const [currentLessonSection, setCurrentLessonSection] = useState<number>(0);

  const LessonCard = ({ lesson }: { lesson: any }) => {
    const Icon = lesson.icon;
    const isCompleted = completedLessons.includes(lesson.id);

    return (
      <TouchableOpacity 
        style={styles.lessonCard}
        onPress={() => setSelectedLesson(lesson)}
      >
        <LinearGradient
          colors={lesson.color}
          style={styles.lessonGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <View style={styles.lessonHeader}>
            <View style={styles.lessonIconContainer}>
              <Icon color="white" size={24} />
            </View>
            {isCompleted && (
              <View style={styles.completedBadge}>
                <Star color="#F59E0B" size={16} fill="#F59E0B" />
              </View>
            )}
          </View>
          
          <View style={styles.lessonContent}>
            <Text style={styles.lessonTitle}>{lesson.title}</Text>
            <Text style={styles.lessonDescription}>{lesson.description}</Text>
            
            <View style={styles.lessonMeta}>
              <View style={styles.lessonMetaItem}>
                <Play color="white" size={12} />
                <Text style={styles.lessonMetaText}>{lesson.duration}</Text>
              </View>
              <View style={styles.lessonMetaItem}>
                <Award color="white" size={12} />
                <Text style={styles.lessonMetaText}>+{lesson.points} bodů</Text>
              </View>
            </View>
            
            <View style={styles.difficultyBadge}>
              <Text style={styles.difficultyText}>{lesson.difficulty}</Text>
            </View>
          </View>
        </LinearGradient>
      </TouchableOpacity>
    );
  };

  const QuizCard = ({ quiz }: { quiz: any }) => (
    <TouchableOpacity 
      style={styles.quizCard}
      onPress={() => {
        setSelectedQuiz(quiz);
        setCurrentQuestionIndex(0);
        setQuizScore(0);
        setSelectedAnswer(null);
        setShowQuizResult(false);
      }}
    >
      <LinearGradient
        colors={quiz.color}
        style={styles.quizGradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <View style={styles.quizContent}>
          <Text style={styles.quizTitle}>{quiz.title}</Text>
          <Text style={styles.quizMeta}>
            {quiz.questions} otázek • +{quiz.points} bodů
          </Text>
          <View style={styles.quizDifficultyBadge}>
            <Text style={styles.quizDifficultyText}>{quiz.difficulty}</Text>
          </View>
        </View>
        <View style={styles.quizIcon}>
          <Target color="white" size={32} />
        </View>
      </LinearGradient>
    </TouchableOpacity>
  );

  const handleLessonComplete = () => {
    if (selectedLesson && !completedLessons.includes(selectedLesson.id)) {
      completeLesson(selectedLesson.id);
      Alert.alert(
        'Gratulujeme! 🎉',
        `Dokončil jsi lekci "${selectedLesson.title}" a získal ${selectedLesson.points} bodů!`,
        [{ text: 'OK', onPress: () => setSelectedLesson(null) }]
      );
    } else {
      setSelectedLesson(null);
    }
  };

  const handleQuizAnswer = (answerIndex: number) => {
    setSelectedAnswer(answerIndex);
    
    setTimeout(() => {
      const currentQuestion = selectedQuiz.data[currentQuestionIndex];
      const isCorrect = answerIndex === currentQuestion.correct;
      
      if (isCorrect) {
        setQuizScore(prev => prev + 1);
      }
      
      if (currentQuestionIndex < selectedQuiz.data.length - 1) {
        setCurrentQuestionIndex(prev => prev + 1);
        setSelectedAnswer(null);
      } else {
        setShowQuizResult(true);
        const finalScore = isCorrect ? quizScore + 1 : quizScore;
        const percentage = (finalScore / selectedQuiz.data.length) * 100;
        const earnedPoints = Math.round((percentage / 100) * selectedQuiz.points);
        addPoints(earnedPoints);
      }
    }, 1500);
  };

  const resetQuiz = () => {
    setSelectedQuiz(null);
    setCurrentQuestionIndex(0);
    setQuizScore(0);
    setSelectedAnswer(null);
    setShowQuizResult(false);
  };

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Header */}
      <LinearGradient
        colors={['#667eea', '#764ba2']}
        style={styles.header}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <View style={styles.headerContent}>
          <View>
            <Text style={styles.headerTitle}>{t('financialEducation')}</Text>
            <Text style={styles.headerSubtitle}>{t('language') === 'cs' ? 'Staň se finančním expertem' : t('language') === 'en' ? 'Become a financial expert' : 'Staň sa finančným expertom'}</Text>
          </View>
          <View style={styles.statsContainer}>
            <View style={styles.statItem}>
              <Award color="white" size={20} />
              <Text style={styles.statText}>Level {level}</Text>
            </View>
            <View style={styles.statItem}>
              <Star color="white" size={20} />
              <Text style={styles.statText}>{points} bodů</Text>
            </View>
          </View>
        </View>
      </LinearGradient>

      {/* Progress Card */}
      <View style={styles.progressContainer}>
        <View style={styles.progressCard}>
          <LinearGradient
            colors={['#ffecd2', '#fcb69f']}
            style={styles.progressGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
          >
            <Lightbulb color="#F59E0B" size={24} />
            <View style={styles.progressContent}>
              <Text style={styles.progressTitle}>{t('progress')}</Text>
              <Text style={styles.progressText}>
                {t('language') === 'cs' ? `Dokončil jsi ${completedLessons.length} z ${LESSONS.length} lekcí` : t('language') === 'en' ? `Completed ${completedLessons.length} of ${LESSONS.length} lessons` : `Dokončil si ${completedLessons.length} z ${LESSONS.length} lekcií`}
              </Text>
              <View style={styles.progressBar}>
                <View 
                  style={[
                    styles.progressFill, 
                    { width: `${(completedLessons.length / LESSONS.length) * 100}%` }
                  ]} 
                />
              </View>
            </View>
          </LinearGradient>
        </View>
      </View>

      {/* Tab Selector */}
      <View style={styles.tabSelector}>
        <TouchableOpacity
          style={[styles.tabButton, selectedTab === 'lessons' && styles.tabButtonActive]}
          onPress={() => setSelectedTab('lessons')}
        >
          <BookOpen 
            color={selectedTab === 'lessons' ? 'white' : '#6B7280'} 
            size={20} 
          />
          <Text style={[
            styles.tabButtonText, 
            selectedTab === 'lessons' && styles.tabButtonTextActive
          ]}>
            {t('lessons')}
          </Text>
        </TouchableOpacity>
        
        <TouchableOpacity
          style={[styles.tabButton, selectedTab === 'quizzes' && styles.tabButtonActive]}
          onPress={() => setSelectedTab('quizzes')}
        >
          <Target 
            color={selectedTab === 'quizzes' ? 'white' : '#6B7280'} 
            size={20} 
          />
          <Text style={[
            styles.tabButtonText, 
            selectedTab === 'quizzes' && styles.tabButtonTextActive
          ]}>
            {t('quizzes')}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Content */}
      <View style={styles.content}>
        {selectedTab === 'lessons' ? (
          <View style={styles.lessonsContainer}>
            {LESSONS.map((lesson) => (
              <LessonCard key={lesson.id} lesson={lesson} />
            ))}
          </View>
        ) : (
          <View style={styles.quizzesContainer}>
            {QUIZZES.map((quiz) => (
              <QuizCard key={quiz.id} quiz={quiz} />
            ))}
          </View>
        )}
      </View>

      {/* Lesson Modal */}
      <Modal
        visible={selectedLesson !== null}
        animationType="slide"
        presentationStyle="pageSheet"
      >
        {selectedLesson && (
          <View style={styles.modalContainer}>
            <LinearGradient
              colors={selectedLesson.color}
              style={styles.modalHeader}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <View style={styles.modalHeaderContent}>
                <TouchableOpacity
                  onPress={() => setSelectedLesson(null)}
                  style={styles.closeButton}
                >
                  <X color="white" size={24} />
                </TouchableOpacity>
                <Text style={styles.modalTitle}>{selectedLesson.title}</Text>
                <View style={styles.modalProgress}>
                  <Text style={styles.modalProgressText}>
                    {currentLessonSection + 1} / {selectedLesson.content.sections.length}
                  </Text>
                </View>
              </View>
            </LinearGradient>

            <ScrollView style={styles.modalContent}>
              <View style={styles.lessonSection}>
                <Text style={styles.sectionTitle}>
                  {selectedLesson.content.sections[currentLessonSection].title}
                </Text>
                <Text style={styles.sectionText}>
                  {selectedLesson.content.sections[currentLessonSection].text}
                </Text>
              </View>
            </ScrollView>

            <View style={styles.modalFooter}>
              {currentLessonSection > 0 && (
                <TouchableOpacity
                  style={styles.prevButton}
                  onPress={() => setCurrentLessonSection(prev => prev - 1)}
                >
                  <Text style={styles.prevButtonText}>Předchozí</Text>
                </TouchableOpacity>
              )}
              
              <TouchableOpacity
                style={styles.nextButton}
                onPress={() => {
                  if (currentLessonSection < selectedLesson.content.sections.length - 1) {
                    setCurrentLessonSection(prev => prev + 1);
                  } else {
                    handleLessonComplete();
                    setCurrentLessonSection(0);
                  }
                }}
              >
                <LinearGradient
                  colors={selectedLesson.color}
                  style={styles.nextButtonGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                >
                  <Text style={styles.nextButtonText}>
                    {currentLessonSection < selectedLesson.content.sections.length - 1 
                      ? 'Další' 
                      : completedLessons.includes(selectedLesson.id) 
                        ? 'Dokončit' 
                        : 'Dokončit lekci'
                    }
                  </Text>
                  <ArrowRight color="white" size={16} />
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </Modal>

      {/* Quiz Modal */}
      <Modal
        visible={selectedQuiz !== null}
        animationType="slide"
        presentationStyle="pageSheet"
      >
        {selectedQuiz && (
          <View style={styles.modalContainer}>
            <LinearGradient
              colors={selectedQuiz.color}
              style={styles.modalHeader}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <View style={styles.modalHeaderContent}>
                <TouchableOpacity
                  onPress={resetQuiz}
                  style={styles.closeButton}
                >
                  <X color="white" size={24} />
                </TouchableOpacity>
                <Text style={styles.modalTitle}>{selectedQuiz.title}</Text>
                <View style={styles.modalProgress}>
                  <Text style={styles.modalProgressText}>
                    {showQuizResult ? 'Výsledek' : `${currentQuestionIndex + 1} / ${selectedQuiz.data.length}`}
                  </Text>
                </View>
              </View>
            </LinearGradient>

            <View style={styles.modalContent}>
              {!showQuizResult ? (
                <View style={styles.quizQuestion}>
                  <Text style={styles.questionText}>
                    {selectedQuiz.data[currentQuestionIndex].question}
                  </Text>
                  
                  <View style={styles.answersContainer}>
                    {selectedQuiz.data[currentQuestionIndex].options.map((option: string, index: number) => {
                      const isSelected = selectedAnswer === index;
                      const isCorrect = index === selectedQuiz.data[currentQuestionIndex].correct;
                      const showResult = selectedAnswer !== null;
                      
                      return (
                        <TouchableOpacity
                          key={index}
                          style={[
                            styles.answerButton,
                            isSelected && styles.selectedAnswer,
                            showResult && isCorrect && styles.correctAnswer,
                            showResult && isSelected && !isCorrect && styles.wrongAnswer,
                          ]}
                          onPress={() => selectedAnswer === null && handleQuizAnswer(index)}
                          disabled={selectedAnswer !== null}
                        >
                          <Text style={[
                            styles.answerText,
                            (isSelected || (showResult && isCorrect)) && styles.selectedAnswerText
                          ]}>
                            {option}
                          </Text>
                          {showResult && isCorrect && (
                            <CheckCircle color="white" size={20} />
                          )}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  
                  {selectedAnswer !== null && (
                    <View style={styles.explanationContainer}>
                      <Text style={styles.explanationText}>
                        {selectedQuiz.data[currentQuestionIndex].explanation}
                      </Text>
                    </View>
                  )}
                </View>
              ) : (
                <View style={styles.quizResult}>
                  <View style={styles.resultHeader}>
                    <Text style={styles.resultTitle}>Výsledek kvízu</Text>
                    <Text style={styles.resultScore}>
                      {quizScore} / {selectedQuiz.data.length}
                    </Text>
                    <Text style={styles.resultPercentage}>
                      {Math.round((quizScore / selectedQuiz.data.length) * 100)}%
                    </Text>
                  </View>
                  
                  <View style={styles.resultStats}>
                    <Text style={styles.resultStatsText}>
                      Získal jsi {Math.round(((quizScore / selectedQuiz.data.length) * 100 / 100) * selectedQuiz.points)} bodů!
                    </Text>
                  </View>
                  
                  <TouchableOpacity
                    style={styles.retryButton}
                    onPress={() => {
                      setCurrentQuestionIndex(0);
                      setQuizScore(0);
                      setSelectedAnswer(null);
                      setShowQuizResult(false);
                    }}
                  >
                    <LinearGradient
                      colors={selectedQuiz.color}
                      style={styles.retryButtonGradient}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                    >
                      <Text style={styles.retryButtonText}>Zkusit znovu</Text>
                    </LinearGradient>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </View>
        )}
      </Modal>
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
    paddingBottom: 24,
    paddingHorizontal: 20,
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
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
  statsContainer: {
    alignItems: 'flex-end',
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  statText: {
    fontSize: 14,
    fontWeight: '600',
    color: 'white',
    marginLeft: 6,
  },
  progressContainer: {
    marginHorizontal: 20,
    marginTop: -12,
    marginBottom: 24,
  },
  progressCard: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  progressGradient: {
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  progressContent: {
    marginLeft: 12,
    flex: 1,
  },
  progressTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#92400E',
    marginBottom: 4,
  },
  progressText: {
    fontSize: 14,
    color: '#92400E',
    marginBottom: 8,
  },
  progressBar: {
    height: 6,
    backgroundColor: '#FED7AA',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#F59E0B',
    borderRadius: 3,
  },
  tabSelector: {
    flexDirection: 'row',
    marginHorizontal: 20,
    marginBottom: 24,
    gap: 12,
  },
  tabButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: 'white',
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  tabButtonActive: {
    backgroundColor: '#667eea',
  },
  tabButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
    marginLeft: 6,
  },
  tabButtonTextActive: {
    color: 'white',
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 32,
  },
  lessonsContainer: {
    gap: 16,
  },
  lessonCard: {
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 6,
  },
  lessonGradient: {
    padding: 20,
  },
  lessonHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  lessonIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  completedBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'white',
    alignItems: 'center',
    justifyContent: 'center',
  },
  lessonContent: {
    flex: 1,
  },
  lessonTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 6,
  },
  lessonDescription: {
    fontSize: 14,
    color: 'white',
    opacity: 0.9,
    marginBottom: 16,
    lineHeight: 20,
  },
  lessonMeta: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 12,
  },
  lessonMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  lessonMetaText: {
    fontSize: 12,
    color: 'white',
    opacity: 0.9,
    marginLeft: 4,
  },
  difficultyBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  difficultyText: {
    fontSize: 12,
    fontWeight: '600',
    color: 'white',
  },
  quizzesContainer: {
    gap: 16,
  },
  quizCard: {
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 6,
  },
  quizGradient: {
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
  },
  quizContent: {
    flex: 1,
  },
  quizTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 6,
  },
  quizMeta: {
    fontSize: 14,
    color: 'white',
    opacity: 0.9,
    marginBottom: 12,
  },
  quizDifficultyBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  quizDifficultyText: {
    fontSize: 12,
    fontWeight: '600',
    color: 'white',
  },
  quizIcon: {
    marginLeft: 16,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  modalHeader: {
    paddingTop: 60,
    paddingBottom: 20,
    paddingHorizontal: 20,
  },
  modalHeaderContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: 'white',
    flex: 1,
    textAlign: 'center',
  },
  modalProgress: {
    width: 40,
    alignItems: 'flex-end',
  },
  modalProgressText: {
    fontSize: 14,
    color: 'white',
    opacity: 0.9,
  },
  modalContent: {
    flex: 1,
    padding: 20,
  },
  lessonSection: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: 16,
  },
  sectionText: {
    fontSize: 16,
    color: '#4B5563',
    lineHeight: 24,
  },
  modalFooter: {
    flexDirection: 'row',
    padding: 20,
    gap: 12,
  },
  prevButton: {
    flex: 1,
    paddingVertical: 16,
    backgroundColor: '#E5E7EB',
    borderRadius: 12,
    alignItems: 'center',
  },
  prevButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6B7280',
  },
  nextButton: {
    flex: 2,
    borderRadius: 12,
    overflow: 'hidden',
  },
  nextButtonGradient: {
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  nextButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
    marginRight: 8,
  },
  quizQuestion: {
    flex: 1,
  },
  questionText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: 24,
    lineHeight: 28,
  },
  answersContainer: {
    gap: 12,
  },
  answerButton: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 2,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  selectedAnswer: {
    borderColor: '#3B82F6',
    backgroundColor: '#EFF6FF',
  },
  correctAnswer: {
    borderColor: '#10B981',
    backgroundColor: '#10B981',
  },
  wrongAnswer: {
    borderColor: '#EF4444',
    backgroundColor: '#EF4444',
  },
  answerText: {
    fontSize: 16,
    color: '#1F2937',
    flex: 1,
  },
  selectedAnswerText: {
    color: 'white',
    fontWeight: '600',
  },
  explanationContainer: {
    marginTop: 20,
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    padding: 16,
  },
  explanationText: {
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 20,
  },
  quizResult: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultHeader: {
    alignItems: 'center',
    marginBottom: 32,
  },
  resultTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: 16,
  },
  resultScore: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#3B82F6',
    marginBottom: 8,
  },
  resultPercentage: {
    fontSize: 20,
    color: '#6B7280',
  },
  resultStats: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 20,
    marginBottom: 32,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  resultStatsText: {
    fontSize: 16,
    color: '#1F2937',
    textAlign: 'center',
  },
  retryButton: {
    borderRadius: 12,
    overflow: 'hidden',
    width: '100%',
  },
  retryButtonGradient: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  retryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
  },
});