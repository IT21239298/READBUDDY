import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Dimensions,
  Alert,
  Platform,
  PermissionsAndroid,
  Image,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import words from '../data/speach_words.json';
import AudioRecorderPlayer from 'react-native-audio-recorder-player';
import Sound from 'react-native-sound';
import storage from '@react-native-firebase/storage';
import { myurl } from '../data/url';

const audioRecorderPlayer = new AudioRecorderPlayer();

export default function LetterAnimation({ navigation, route }) {
  const level = route.params?.level || 1;
  const [animationStep, setAnimationStep] = useState(1);
  const [status, setStatus] = useState('Say the word you see!');
  const [isAnimating, setIsAnimating] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [countdown, setCountdown] = useState(5);
  const [modelResult, setModelResult] = useState(null);
  const [currentWordIndex, setCurrentWordIndex] = useState(0);
  const [wordResults, setWordResults] = useState([]);
  const [imageUrl, setImageUrl] = useState(null);

  const click = async () => {
    try {
      const response = await fetch(myurl + '/speech', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ word: word }),
      });
      const data = await response.json();
      console.log('API Response:', data);
      return data["res"];
    } catch (error) {
      console.error('Error:', error);
      return null;
    }
  };

  const levelWords = words.filter((word) => word.level === level);
  const MAX_LETTERS = 10;
  const letterAnimations = useRef(
    Array(MAX_LETTERS)
      .fill(null)
      .map(() => new Animated.ValueXY({ x: 0, y: -100 }))
  ).current;

  useEffect(() => {
    resetForNewWord(0);
    loadImage(0);
  }, [level, loadImage]);

  const selectedWord = levelWords[currentWordIndex] || levelWords[0];
  const letterGroups = selectedWord.letterGroups;
  const word = selectedWord.word;
  const letterColors = selectedWord.letterColors;
  const audioPath = selectedWord.audio;

  const screenWidth = Dimensions.get('window').width;
  const fontSize = 50;
  const letterSpacing = 10;
  const initialPadding = 10;

  useEffect(() => {
    letterAnimations.forEach((anim) => {
      anim.setValue({ x: 0, y: -100 });
    });
  }, [currentWordIndex, letterAnimations]);

  const loadImage = useCallback(async (index) => {
    try {
      const imageRef = storage().ref(levelWords[index].image);
      const url = await imageRef.getDownloadURL();
      setImageUrl(url);
    } catch (error) {
      console.error('Error loading image:', error);
      setImageUrl(null);
    }
  }, [levelWords]);

  const resetForNewWord = (index) => {
    setCurrentWordIndex(index);
    setAnimationStep(1);
    setIsAnimating(false);
    setModelResult(null);
    setStatus('Say the word you see!');
    setCountdown(5);
  };

  const startAnimation = async () => {
    if (isAnimating) return;
    setIsAnimating(true);
    setStatus(`Animating "${word}" and playing audio...`);
    setAnimationStep(2);

    // Play the correct audio when animation starts
    await playCorrectAudio();

    const animations = letterGroups.map((_, index) => {
      return Animated.timing(letterAnimations[index], {
        toValue: { x: initialPadding + index * (20 + letterSpacing), y: 0 },
        duration: 800,
        delay: index * 100,
        useNativeDriver: true,
      });
    });

    Animated.parallel(animations).start(() => {
      setIsAnimating(false);
      setStatus('Animation complete! Click Reset to start over.');
    });
  };

  const resetAnimation = () => {
    setAnimationStep(1);
    setIsAnimating(false);
    setStatus('Say the word you see!');
    letterAnimations.forEach((anim) => {
      anim.setValue({ x: 0, y: -100 });
    });
  };

  const requestMicPermission = async () => {
    if (Platform.OS === 'android') { // Fixed typo here
      try {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
          {
            title: 'Microphone Permission',
            message: 'This app needs access to your microphone to record audio.',
            buttonNeutral: 'Ask Me Later',
            buttonNegative: 'Cancel',
            buttonPositive: 'OK',
          }
        );
        if (granted === PermissionsAndroid.RESULTS.GRANTED) {
          console.log('Microphone permission granted');
          return true;
        } else {
          console.log('Microphone permission denied');
          setStatus('Microphone permission denied. Please enable it in settings.');
          return false;
        }
      } catch (err) {
        console.warn('Permission request error:', err);
        setStatus('Error requesting permission. Try again.');
        return false;
      }
    }
    return true; // iOS handles via Info.plist
  };

  const startRecording = async () => {
    if (isRecording) return;

    const hasPermission = await requestMicPermission();
    if (!hasPermission) return;

    setIsRecording(true);
    setStatus('Recording...');
    setCountdown(5);

    try {
      const uri = await audioRecorderPlayer.startRecorder();
      console.log('Recording started at:', uri);

      let timeLeft = 5;
      const countdownInterval = setInterval(() => {
        timeLeft -= 1;
        setCountdown(timeLeft);
        if (timeLeft <= 0) {
          clearInterval(countdownInterval);
          stopRecording();
        }
      }, 1000);
    } catch (error) {
      console.error('Recording error:', error);
      setIsRecording(false);
      setStatus('Failed to start recording. Try again.');
    }
  };

  const stopRecording = async () => {
    try {
      const uri = await audioRecorderPlayer.stopRecorder();
      console.log('Recording stopped at:', uri);
      setIsRecording(false);
      setStatus('Uploading audio...');

      const reference = storage().ref(`speechrecord/audio.mp3`);
      await reference.putFile(uri);
      const downloadURL = await reference.getDownloadURL();
      console.log('Uploaded to Firebase:', downloadURL);

      const result = await click();
      console.log('Model Result:', result);
      if (result === null) {
        setStatus('Error fetching model result. Try again.');
        return;
      }

      setModelResult(result);
      setWordResults((prev) => [...prev.slice(0, currentWordIndex), result]);

      if (result === true) {
        Alert.alert('Success', 'Your Answer is correct');
        setStatus('Click Next to continue');
      } else {
        setStatus('Listen to the correct pronunciation');
        // playCorrectAudio();
        // startAnimation();
      }
    } catch (error) {
      console.error('Stop recording/upload error:', error);
      setStatus('Error uploading audio. Try again.');
    }
  };

  const playCorrectAudio = async () => {
    try {
      const soundRef = storage().ref(audioPath);
      const url = await soundRef.getDownloadURL();

      const sound = new Sound(url, null, (error) => {
        if (error) {
          console.log('Failed to load sound', error);
          setStatus('Error playing audio. Click Replay to try again.');
          return;
        }
        sound.play(() => {
          sound.release();
          setStatus('Click Replay to hear again');
        });
      });
    } catch (error) {
      console.error('Audio playback error:', error);
      setStatus('Error fetching audio. Try again.');
    }
  };

  const replayAudio = async () => {
    setStatus('Replaying audio...');
    await playCorrectAudio();
  };

  const goToNextWord = () => {
    if (currentWordIndex + 1 < levelWords.length) {
      const nextIndex = currentWordIndex + 1;
      resetForNewWord(nextIndex);
      loadImage(nextIndex);
    } else {
      const allCorrect = wordResults.every((result) => result === true);
      if (allCorrect) {
        Alert.alert(
          'Congratulations!',
          'All the Answers are Correct!',
          [{ text: 'Back to Levels', onPress: () => navigation.goBack() }]
        );
      } else {
        Alert.alert(
          'Keep Going!',
          'Some answers were incorrect. Try this level again to improve!',
          [
            { text: 'Try Again', onPress: () => resetLevel() },
            { text: 'Back to Levels', onPress: () => navigation.goBack() },
          ]
        );
      }
    }
  };

  const resetLevel = () => {
    setCurrentWordIndex(0);
    setWordResults([]);
    resetForNewWord(0);
    loadImage(0);
  };

  const renderInitialWord = () => (
    <View style={styles.dividedLettersInit}>
      <Text style={[styles.letter, { fontSize, color: '#000' }]}>{word}</Text>
    </View>
  );

  const renderAnimatedLetters = () => (
    <View style={styles.dividedLetters}>
      {letterGroups.map((group, index) => (
        <Animated.Text
          key={index}
          style={[
            styles.letter,
            { fontSize, color: letterColors[index % letterColors.length] },
            { transform: letterAnimations[index].getTranslateTransform() },
          ]}
        >
          {group}
        </Animated.Text>
      ))}
    </View>
  );

  return (
    <View style={styles.container}>
       <View style={styles.levelIndicator}>
        <Text style={styles.levelText}>{level}</Text>
      </View>
      <View style={styles.instructions}>
      <Text style={styles.titleText}>Say the word</Text>
      <Text style={styles.wordTitle}>{word}</Text>
      </View>
      <Text style={styles.status}>
        {isRecording ? `Recording: ${countdown}s` : status}
      </Text>

      <View style={styles.animationContainer}>
        {imageUrl && (
          <Image source={{ uri: imageUrl }} style={styles.image} resizeMode="contain" />
        )}
        {animationStep === 1 && renderInitialWord()}
        {animationStep === 2 && renderAnimatedLetters()}
      </View>

      {/* Initial State: Show only Speak button */}
      {modelResult === null && (
        <View style={styles.maincontrols}>
          <TouchableOpacity
            style={[isRecording && styles.buttonDisabled]}
            onPress={startRecording}
            disabled={isRecording}
          >
              <Image 
              source={require('../assets/voice.png')} 
              style={styles.microphoneIcon} 
            />
          </TouchableOpacity>
        </View>
      )}

      {/* Conditional Buttons */}
      <View style={styles.controls}>
        {/* If modelResult is false, show Start Animation, Reset, Replay */}
        {modelResult === false && (
          <>
          <View style={styles.maincontrols}>
            <TouchableOpacity
              style={[styles.buttonContainer, isAnimating && styles.buttonDisabled]}
              onPress={startAnimation}
              disabled={isAnimating}
            >
              <LinearGradient
                style={styles.gradientButton}
                colors={['#03cdc0', '#7e34de']}
                start={{x: 0, y: 0}}
                end={{x: 1, y: 0}}
              >
                <Text style={styles.buttonText}>Start Animation</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
          
          <TouchableOpacity
            style={[styles.buttonContainer, isRecording && styles.buttonDisabled]}
            onPress={startRecording}
            disabled={isRecording}
          >
            <LinearGradient
              style={styles.gradientButton}
              colors={['#03cdc0', '#7e34de']}
              start={{x: 0, y: 0}}
              end={{x: 1, y: 0}}
            >
              <Text style={styles.buttonText}>Speak</Text>
            </LinearGradient>
          </TouchableOpacity>
      
          <TouchableOpacity
            style={[styles.buttonContainer, animationStep === 1 && styles.buttonDisabled]}
            onPress={resetAnimation}
            disabled={animationStep === 1}
          >
            <LinearGradient
              style={styles.gradientButton}
              colors={['#03cdc0', '#7e34de']}
              start={{x: 0, y: 0}}
              end={{x: 1, y: 0}}
            >
              <Text style={styles.buttonText}>Reset</Text>
            </LinearGradient>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={styles.buttonContainer}
            onPress={replayAudio}
          >
            <LinearGradient
              style={styles.gradientButton}
              colors={['#03cdc0', '#7e34de']}
              start={{x: 0, y: 0}}
              end={{x: 1, y: 0}}
            >
              <Text style={styles.buttonText}>Replay</Text>
            </LinearGradient>
          </TouchableOpacity>
          </>
        )}

        {/* If modelResult is true, show only Next button */}
        {modelResult === true && (
          <TouchableOpacity 
            style={styles.buttonContainer}
            onPress={goToNextWord}
          >
            <LinearGradient
              style={styles.gradientButton}
              colors={['#03cdc0', '#7e34de']}
              start={{x: 0, y: 0}}
              end={{x: 1, y: 0}}
            >
              <Text style={styles.buttonText}>Next</Text>
            </LinearGradient>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  background: {
    flex: 1,
    width: '100%',
  },
  container: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 80,
    paddingHorizontal: 15,
    backgroundColor: 'rgba(151, 216, 196, 0.8)',
  },
  titleText: {
    fontSize: 28,
    fontWeight: '600',
    color: '#333',
  },
  microphoneIcon: {
    width: 80,
    height: 80,
  },
  wordTitle: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#000',
    marginVertical: 8,
  },
  levelIndicator: {
    position: 'absolute',
    top: 20,
    left: '55%',
    marginLeft: -20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
    marginTop:10,
    marginBottom:10,
  },
  levelText: {
    color: 'white',
    fontSize: 24,
    fontWeight: 'bold',
  },
  header: {
    fontSize: 30,
    fontWeight: 'bold',
    color: '#2c3e50',
    marginBottom: 10,
  },
  instructions: {
    backgroundColor: 'rgba(214, 220, 241, 0.6)',
    borderRadius: 10,
    padding: 15,
    shadowColor: 'rgba(180, 186, 243, 0.5)',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
    marginBottom: 20,
    maxWidth: 500,
    justifyContent:'center',
    alignItems: 'center',
    width:'100%',
  },
  instructionsText: {
    fontSize: 16,
    color: '#333',
    textAlign: 'center',
  },
  animationContainer: {
    width: '100%',
    height: 300,
    backgroundColor: '#fff',
    borderRadius: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    overflow: 'hidden',
    position: 'relative',
  },
  image: {
    width: '80%',
    height: 150,
    position: 'absolute',
    top: 10,
  },
  dividedLetters: {
    flexDirection: 'row',
    position: 'absolute',
    top: 200,
    left: 0,
    width: '100%',
  },
  dividedLettersInit: {
    flexDirection: 'row',
    position: 'absolute',
    top: 200,
    left: 80,
    width: '100%',
  },
  letter: {
    fontWeight: 'bold',
    marginRight: 10,
  },
  controls: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
    flexWrap: 'wrap',
  },
  maincontrols: {
    flexDirection: 'row',
    justifyContent: 'center',
    width: '100%',
    marginBottom: 10,
  },
  buttonContainer: {
    borderRadius: 10,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 4,
  },
  gradientButton: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  button: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: '#c2c8c9',
    borderRadius: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 4,
  },
  speakButton: {
    paddingVertical: 15,
    paddingHorizontal: 20,
    backgroundColor: '#c2c8c9',
    borderRadius: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 4,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    fontSize: 20,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  status: {
    backgroundColor: '#fba49a',
    padding: 10,
    borderRadius: 40,
    marginTop: -10,
    marginBottom:30,
    fontWeight: '800',
    textAlign: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.7,
    shadowRadius: 6,
  },
});