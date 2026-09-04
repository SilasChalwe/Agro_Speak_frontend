import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Animated,
  StatusBar,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import VoiceRecording from '../../components/voiceRecording';
import WeatherDisplay from '../../components/WeatherDisplay';
import useWeather  from '../../hooks/useWeather';
import useLocation from '../../hooks/useLocation';
import { useVoiceAssistant } from '../../hooks/useVoiceAssistant';
import styles from './VoiceAssistantStyles';

import { Audio } from "expo-av";

const VoiceAssistantScreen = ({ navigation }) => {
  const [currentView, setCurrentView] = useState('home');
  const [userQuery, setUserQuery] = useState('');
  const [sttResults, setSttResults] = useState('');
  const [aiResponse, setAiResponse] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [userLanguage, setUserLanguage] = useState('Bemba');
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [conversation, setConversation] = useState([]);
  const scrollViewRef = useRef();
  
  const { location } = useLocation();
  const { weather, loading: weatherLoading } = useWeather(location);
  const { isListening, startListening, stopListening, speak, processCommand } = useVoiceAssistant();
  
  const pulseAnim = new Animated.Value(1);
  const waveformAnim = new Animated.Value(0);

  useEffect(() => {
    if (currentView === 'listening') {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.2,
            duration: 1000,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 1000,
            useNativeDriver: true,
          }),
        ])
      ).start();

      Animated.loop(
        Animated.sequence([
          Animated.timing(waveformAnim, {
            toValue: 1,
            duration: 800,
            useNativeDriver: true,
          }),
          Animated.timing(waveformAnim, {
            toValue: 0,
            duration: 800,
            useNativeDriver: true,
          }),
        ])
      ).start();
    } else {
      pulseAnim.setValue(1);
      waveformAnim.setValue(0);
    }
  }, [currentView]);

  useEffect(() => {
    // Scroll to bottom when conversation updates
    if (scrollViewRef.current) {
      scrollViewRef.current.scrollToEnd({ animated: true });
    }
  }, [conversation]);
const speakText = async (text, language = 'bemba') => {
  const TTS_ENDPOINT = "http://110.107.1.142:5000/api/speak";

  try {
    setIsSpeaking(true);

    // Use device TTS for English
    if (language.toLowerCase() === 'english') {
      await speak(text);
      return;
    }

    // Request TTS audio URL from backend
    const response = await fetch(TTS_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });

    if (!response.ok) throw new Error("TTS server failed");

    const result = await response.json();
    const audioUrl = result.audioUrl;

    if (!audioUrl) throw new Error("No audio URL returned from server");

    const sound = new Audio.Sound();
    await sound.loadAsync({ uri: audioUrl });
    await sound.playAsync();

    sound.setOnPlaybackStatusUpdate((status) => {
      if (status.didJustFinish) {
        sound.unloadAsync();
      }
    });

  } catch (err) {
    console.log("TTS Error:", err);
    // Fallback to device TTS
    await speak(text);
  } finally {
    setIsSpeaking(false);
  }
};
 

  // Translation function
  const translateText = async (text, sourceLang, targetLang) => {
    const TRANSLATION_ENDPOINT = "http://110.107.1.142:5000/api/translate";

    try {
      const response = await fetch(TRANSLATION_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: text,
          sourceLang: sourceLang,
          targetLang: targetLang,
        }),
      });

      if (!response.ok) {
        throw new Error(`Translation failed: ${response.status}`);
      }

      const data = await response.json();
      return data.translation || text;
    } catch (error) {
      console.error("Translation Error:", error);
      return text;
    }
  };

  // AI Function
  const sendToAI = async (query) => {
    const OPENROUTER_API_KEY = process.env.EXPO_PUBLIC_OPENROUTER_API_KEY;
    const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

    if (!OPENROUTER_API_KEY) {
      console.error("OpenRouter API key is not configured");
      return "Sorry, the AI service is not configured right now.";
    }

    try {
      const response = await fetch(OPENROUTER_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
          "HTTP-Referer": "http://localhost",
          "X-Title": "AgroSpeak",
        },
        body: JSON.stringify({
          model: "openai/gpt-3.5-turbo",
          messages: [
            {
              role: "system",
              content: `You are AgroSpeak, a helpful agricultural assistant for Zambian farmers. 
              Provide concise, practical answers about farming, crops, weather, soil, and agriculture. 
              Focus on local Zambian context. Keep responses clear, actionable and under 150 words.`
            },
            {
              role: "user",
              content: query
            }
          ],
          max_tokens: 500,
          temperature: 0.7,
        }),
      });

      if (!response.ok) {
        throw new Error(`AI API failed: ${response.status}`);
      }

      const data = await response.json();
      return data.choices?.[0]?.message?.content || "I couldn't process your question. Please try again.";
    } catch (error) {
      console.error("AI Error:", error);
      return "Sorry, I'm having trouble connecting right now. Please check your connection and try again.";
    }
  };

  // Function to check if query contains predefined options
  const hasPredefinedOptions = (query) => {
    const predefinedKeywords = [
      'weather', 'forecast', 'rain', 'temperature', 'humidity', 'wind',
      'crop', 'farm', 'soil', 'plant', 'harvest', 'irrigation',
      'trends', 'profile', 'market', 'prices', 'time'
    ];
    
    return predefinedKeywords.some(keyword => 
      query.toLowerCase().includes(keyword.toLowerCase())
    );
  };

  const handleVoiceStart = async () => {
    setCurrentView('listening');
    setUserQuery('');
    setSttResults('');
    setAiResponse('');
    await startListening();
  };

  const handleVoiceStop = async () => {
    setIsProcessing(true);
    try {
      const audioUri = await stopListening();
      
      if (audioUri) {
        const transcript = await sendToSTT(audioUri);
        setSttResults(transcript);
        setUserQuery(transcript);
        
        // Add user message to conversation
        const userMessage = {
          id: Date.now().toString(),
          type: 'user',
          text: transcript,
          timestamp: new Date(),
        };
        setConversation(prev => [...prev, userMessage]);
        
        const hasWeatherKeywords = /weather|forecast|rain|temperature|humidity|wind/i.test(transcript);
        const hasCropKeywords = /crop|farm|soil|plant|harvest|irrigation/i.test(transcript);
        
        if (hasPredefinedOptions(transcript)) {
          let englishQuery = transcript;
          if (userLanguage !== 'English') {
            englishQuery = await translateText(transcript, userLanguage, 'English');
          }
          
          const result = processCommand(englishQuery);
          
          let responseToSpeak = result.response;
          if (userLanguage !== 'English' && result.response) {
            responseToSpeak = await translateText(result.response, 'English', userLanguage);
          }
          
          // Add AI response to conversation
          const aiMessage = {
            id: (Date.now() + 1).toString(),
            type: 'assistant',
            text: responseToSpeak,
            timestamp: new Date(),
          };
          setConversation(prev => [...prev, aiMessage]);
          
          if (result.action === 'weather' || hasWeatherKeywords) {
            setTimeout(() => setCurrentView('weather'), 1500);
          } else {
            setCurrentView('aiResponse');
          }
          
          if (responseToSpeak) {
            await speakText(responseToSpeak, userLanguage.toLowerCase());
          }
        } else {
          setIsProcessing(true);
          let englishQuery = transcript;
          if (userLanguage !== 'English') {
            englishQuery = await translateText(transcript, userLanguage, 'English');
          }
          
          const aiResult = await sendToAI(englishQuery);
          
          let translatedResponse = aiResult;
          if (userLanguage !== 'English') {
            translatedResponse = await translateText(aiResult, 'English', userLanguage);
          }
          
          setAiResponse(translatedResponse);
          
          // Add AI response to conversation
          const aiMessage = {
            id: (Date.now() + 1).toString(),
            type: 'assistant',
            text: translatedResponse,
            timestamp: new Date(),
          };
          setConversation(prev => [...prev, aiMessage]);
          
          setCurrentView('aiResponse');
          await speakText(translatedResponse, userLanguage.toLowerCase());
        }
      }
    } catch (error) {
      console.error('Error processing voice command:', error);
      setSttResults('Error processing audio. Please try again.');
      
      const errorMessage = {
        id: Date.now().toString(),
        type: 'error',
        text: 'Error processing audio. Please try again.',
        timestamp: new Date(),
      };
      setConversation(prev => [...prev, errorMessage]);
      
      setCurrentView('aiResponse');
    } finally {
      setIsProcessing(false);
    }
  };

  const sendToSTT = async (audioUri) => {
    const sttEndpoint = "http://110.107.1.142:5000/api/transcribe"; 

    try {
      const formData = new FormData();
      formData.append("audio", {
        uri: audioUri,
        type: "audio/wav",
        name: "recording.wav",
      });
      formData.append("language", userLanguage.toLowerCase());

      const response = await fetch(sttEndpoint, {
        method: "POST",
        body: formData,
        headers: {
          "Accept": "application/json",
        },
      });

      if (!response.ok) {
        const err = await response.text();
        throw new Error(`STT failed: ${err}`);
      }

      const data = await response.json();
      return data.transcription || "No transcript received";
    } catch (error) {
      console.error("STT Error:", error);
      return "Error processing STT. Try again.";
    }
  };

  const LanguageSelector = () => (
    <View style={styles.languageSelector}>
      <Text style={styles.languageLabel}>Language: </Text>
      <TouchableOpacity 
        style={[styles.languageButton, userLanguage === 'Bemba' && styles.languageButtonActive]}
        onPress={() => setUserLanguage('Bemba')}
      >
        <Text style={[styles.languageText, userLanguage === 'Bemba' && styles.languageTextActive]}>
          Bemba
        </Text>
      </TouchableOpacity>
      <TouchableOpacity 
        style={[styles.languageButton, userLanguage === 'English' && styles.languageButtonActive]}
        onPress={() => setUserLanguage('English')}
      >
        <Text style={[styles.languageText, userLanguage === 'English' && styles.languageTextActive]}>
          English
        </Text>
      </TouchableOpacity>
    </View>
  );

  const renderWaveform = () => {
    const bars = [1, 2, 3, 4, 5, 6, 7, 8];
    
    return (
      <View style={styles.waveformContainer}>
        {bars.map((_, index) => (
          <Animated.View
            key={index}
            style={[
              styles.waveformBar,
              {
                opacity: waveformAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.3, 1],
                }),
                transform: [
                  { 
                    scaleY: waveformAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.5, 1.5 + Math.random() * 0.5],
                    }) 
                  }
                ],
              },
            ]}
          />
        ))}
      </View>
    );
  };

  const renderMessageBubble = (message) => {
    const isUser = message.type === 'user';
    const isError = message.type === 'error';
    
    return (
      <View key={message.id} style={[
        styles.messageContainer,
        isUser ? styles.userMessageContainer : styles.assistantMessageContainer
      ]}>
        <View style={[
          styles.messageBubble,
          isUser ? styles.userMessageBubble : styles.assistantMessageBubble,
          isError && styles.errorMessageBubble
        ]}>
          <Text style={[
            styles.messageText,
            isUser ? styles.userMessageText : styles.assistantMessageText
          ]}>
            {message.text}
          </Text>
          <Text style={styles.messageTime}>
            {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </Text>
        </View>
        
        {!isUser && !isError && (
          <TouchableOpacity 
            style={styles.speakButton}
            onPress={() => speakText(message.text, userLanguage.toLowerCase())}
            disabled={isSpeaking}
          >
            <Feather 
              name={isSpeaking ? "volume-2" : "volume-1"} 
              size={16} 
              color="#6b8cff" 
            />
          </TouchableOpacity>
        )}
      </View>
    );
  };

  const renderAIResponseScreen = () => (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#1a1a3e" />
      
      <View style={styles.header}>
        <TouchableOpacity onPress={() => setCurrentView('home')}>
          <Feather name="arrow-left" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>AgroSpeak</Text>
        <LanguageSelector />
      </View>

      <ScrollView 
        ref={scrollViewRef}
        style={styles.conversationContainer}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.conversationContent}
      >
        {conversation.length === 0 ? (
          <View style={styles.emptyState}>
            <Feather name="message-circle" size={48} color="rgba(255,255,255,0.3)" />
            <Text style={styles.emptyStateText}>Start a conversation with AgroSpeak</Text>
          </View>
        ) : (
          conversation.map(renderMessageBubble)
        )}
        
        {isProcessing && (
          <View style={styles.typingIndicator}>
            <View style={styles.typingBubble}>
              <Text style={styles.typingText}>AgroSpeak is typing</Text>
              <View style={styles.typingDots}>
                <View style={styles.typingDot} />
                <View style={styles.typingDot} />
                <View style={styles.typingDot} />
              </View>
            </View>
          </View>
        )}
      </ScrollView>

      <View style={styles.bottomContainer}>
        <View style={styles.micButtonContainer}>
          <TouchableOpacity
            style={styles.micButton}
            onPress={handleVoiceStart}
            disabled={isProcessing}
          >
            <Feather name="mic" size={32} color="#fff" />
          </TouchableOpacity>
        </View>
        <View style={styles.bottomButtons}>
          <TouchableOpacity 
            style={styles.bottomIcon}
            onPress={() => setConversation([])}
          >
            <Feather name="trash-2" size={20} color="rgba(107, 140, 255, 0.7)" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.bottomIcon}>
            <Feather name="keyboard" size={20} color="rgba(107, 140, 255, 0.7)" />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );

  const renderHomeScreen = () => (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#1a1a3e" />
      
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Feather name="arrow-left" size={24} color="#fff" />
        </TouchableOpacity>
        <LanguageSelector />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Ask AgroSpeak</Text>

        <View style={styles.greetingCard}>
          <View style={styles.avatarIcon}>
            <View style={styles.avatarDot} />
          </View>
          <Text style={styles.greetingText}>
            Hi, I am AgroSpeak.{'\n'}
            What can I do for you today?
          </Text>
        </View>

        <View style={styles.suggestionsContainer}>
          <TouchableOpacity 
            style={styles.suggestionButton}
            onPress={() => {
              speakText("ifilimwa fusekele", userLanguage.toLowerCase());
              navigation.navigate('CropTrends');
            }}
          >
            <Text style={styles.suggestionText}>Crop trends</Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={styles.suggestionButton}
            onPress={() => {
              speakText("isuleni ichipungu chebala lyenu", userLanguage.toLowerCase());
              navigation.navigate('Profile');
            }}
          >
            <Text style={styles.suggestionText}>My farm info</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.suggestionButton}
            onPress={() => {
              speakText("Loading today's weather forecast", userLanguage.toLowerCase());
              setCurrentView('weather');
            }}
          >
            <Text style={styles.suggestionText}>Today's Weather</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.suggestionButton}
            onPress={() => {
              speakText("Showing weekly weather forecast", userLanguage.toLowerCase());
              navigation.navigate('WeatherTest');
            }}
          >
            <Text style={styles.suggestionText}>Weekly forecast</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.suggestionButton}
            onPress={() => speakText("Soil analysis coming soon", userLanguage.toLowerCase())}
          >
            <Text style={styles.suggestionText}>Soil tips</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.suggestionButton}
            onPress={() => speakText("Market prices feature coming soon", userLanguage.toLowerCase())}
          >
            <Text style={styles.suggestionText}>Market prices</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <View style={styles.bottomContainer}>
        <View style={styles.micButtonContainer}>
          <TouchableOpacity
            style={styles.micButton}
            onPress={handleVoiceStart}
          >
            <Feather name="mic" size={32} color="#fff" />
          </TouchableOpacity>
        </View>
        <View style={styles.bottomButtons}>
          <TouchableOpacity style={styles.bottomIcon}>
            <Feather name="image" size={20} color="rgba(107, 140, 255, 0.7)" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.bottomIcon}>
            <Feather name="keyboard" size={20} color="rgba(107, 140, 255, 0.7)" />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );

  const renderListeningScreen = () => (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#1a1a3e" />
      
      <View style={styles.header}>
        <TouchableOpacity onPress={() => {
          stopListening();
          setCurrentView('home');
        }}>
          <Feather name="arrow-left" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        <Text style={styles.statusText}>
          {isProcessing ? 'Processing...' : 'Listening...'}
        </Text>

        {renderWaveform()}

        <View style={styles.queryCard}>
          <View style={styles.pauseIcon}>
            <View style={styles.pauseBar} />
            <View style={styles.pauseBar} />
          </View>
          <Text style={styles.queryText}>
            {userQuery || "Speak now...\nI'm listening to your question"}
          </Text>
        </View>

        {isProcessing && (
          <View style={styles.processingContainer}>
            <ActivityIndicator size="small" color="#6b8cff" />
            <Text style={styles.processingText}>
              {userQuery ? 'Processing with AI...' : 'Transcribing audio...'}
            </Text>
          </View>
        )}
      </View>

      <View style={styles.bottomContainer}>
        <View style={styles.micButtonContainer}>
          <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
            <TouchableOpacity
              style={[styles.micButton, styles.activeListening]}
              onPress={handleVoiceStop}
              disabled={isProcessing}
            >
              <View style={styles.micDot} />
            </TouchableOpacity>
          </Animated.View>
        </View>
        <View style={styles.bottomButtons}>
          <TouchableOpacity style={styles.bottomIcon}>
            <Feather name="image" size={20} color="rgba(107, 140, 255, 0.7)" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.bottomIcon}>
            <Feather name="keyboard" size={20} color="rgba(107, 140, 255, 0.7)" />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );

  const renderWeatherScreen = () => (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#1a1a3e" />
      
      <View style={styles.header}>
        <TouchableOpacity onPress={() => setCurrentView('home')}>
          <Feather name="arrow-left" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.resultText}>
          Here is your result for today's forecast!
        </Text>

        <WeatherDisplay 
          weather={weather}
          location={location}
          loading={weatherLoading}
        />

        <View style={styles.followUpContainer}>
          <TouchableOpacity 
            style={styles.suggestionButton}
            onPress={() => {
              speakText("Checking tomorrow's weather", userLanguage.toLowerCase());
              navigation.navigate('WeatherTest');
            }}
          >
            <Text style={styles.suggestionText}>What about tomorrow?</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.suggestionButton}
            onPress={() => {
              speakText("Loading next week's forecast", userLanguage.toLowerCase());
              navigation.navigate('WeatherTest');
            }}
          >
            <Text style={styles.suggestionText}>About next week?</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.suggestionButton}
            onPress={() => {
              const now = new Date();
              speakText(`The current time is ${now.toLocaleTimeString()}`, userLanguage.toLowerCase());
            }}
          >
            <Text style={styles.suggestionText}>What time is it?</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <View style={styles.bottomContainer}>
        <View style={styles.micButtonContainer}>
          <TouchableOpacity
            style={styles.micButton}
            onPress={handleVoiceStart}
          >
            <Feather name="mic" size={32} color="#fff" />
          </TouchableOpacity>
        </View>
        <View style={styles.bottomButtons}>
          <TouchableOpacity style={styles.bottomIcon}>
            <Feather name="image" size={20} color="rgba(107, 140, 255, 0.7)" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.bottomIcon}>
            <Feather name="keyboard" size={20} color="rgba(107, 140, 255, 0.7)" />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );

  return (
    <>
      {currentView === 'home' && renderHomeScreen()}
      {currentView === 'listening' && renderListeningScreen()}
      {currentView === 'weather' && renderWeatherScreen()}
      {currentView === 'aiResponse' && renderAIResponseScreen()}
    </>
  );
};

export default VoiceAssistantScreen;