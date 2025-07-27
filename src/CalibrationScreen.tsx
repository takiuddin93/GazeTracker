import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  SafeAreaView,
  Animated,
} from 'react-native';
import { nativeCameraModule, EyeLandmarks } from './NativeCameraModule';
import AsyncStorage from '@react-native-async-storage/async-storage';
import CameraViewComponent from './CameraViewComponent';

interface CalibrationPoint {
  position: 'left' | 'center' | 'right';
  gazeValues: number[];
  targetValue: number; // -1, 0, +1
}

interface CalibrationData {
  points: CalibrationPoint[];
  timestamp: number;
  isComplete: boolean;
  linearTransform?: {
    slope: number;
    intercept: number;
  };
}

interface CalibrationScreenProps {
  onCalibrationComplete: () => void;
  onCancel: () => void;
}

export default function CalibrationScreen({ onCalibrationComplete, onCancel }: CalibrationScreenProps) {
  const [currentStep, setCurrentStep] = useState<'left' | 'center' | 'right'>('left');
  const [frameCount, setFrameCount] = useState(0);
  const [isCollecting, setIsCollecting] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const [calibrationData, setCalibrationData] = useState<CalibrationData>({
    points: [],
    timestamp: Date.now(),
    isComplete: false,
  });
  
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const opacityAnim = useRef(new Animated.Value(0.7)).current;
  const FRAMES_PER_POSITION = 15;
  const DEMO_MODE = false; // Set to true for testing with mock data

  const stepConfig = {
    left: { position: 'left' as const, targetValue: -1, instruction: 'Look Left', color: '#FF6B6B' },
    center: { position: 'center' as const, targetValue: 0, instruction: 'Look Center', color: '#4ECDC4' },
    right: { position: 'right' as const, targetValue: 1, instruction: 'Look Right', color: '#45B7D1' },
  };

  const currentConfig = stepConfig[currentStep];

  useEffect(() => {
    let subscription: any;

    if (isCollecting) {
      // Start pulsing animation
      Animated.loop(
        Animated.sequence([
          Animated.timing(scaleAnim, { toValue: 1.2, duration: 800, useNativeDriver: true }),
          Animated.timing(scaleAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
        ])
      ).start();

      Animated.timing(opacityAnim, { toValue: 1, duration: 300, useNativeDriver: true }).start();

      // Subscribe to frame events or generate mock data
      if (DEMO_MODE) {
        // Generate mock gaze data for testing
        const interval = setInterval(() => {
          const mockGazeValue = currentConfig.targetValue + (Math.random() - 0.5) * 0.4; // Add some variation
          console.log(`Mock gaze for ${currentStep}: ${mockGazeValue.toFixed(3)}`);
          
          setCalibrationData(prev => {
            const currentPoint = prev.points.find(p => p.position === currentStep);
            
            if (currentPoint) {
              const updatedPoints = prev.points.map(p => 
                p.position === currentStep 
                  ? { ...p, gazeValues: [...p.gazeValues, mockGazeValue] }
                  : p
              );
              
              const currentUpdatedPoint = updatedPoints.find(p => p.position === currentStep);
              console.log(`Collected mock frame ${currentUpdatedPoint?.gazeValues.length} for ${currentStep}: ${mockGazeValue.toFixed(3)}`);
              
              return {
                ...prev,
                points: updatedPoints
              };
            } else {
              console.log(`Starting mock collection for ${currentStep}: ${mockGazeValue.toFixed(3)}`);
              return {
                ...prev,
                points: [...prev.points, {
                  position: currentStep,
                  gazeValues: [mockGazeValue],
                  targetValue: currentConfig.targetValue
                }]
              };
            }
          });

          setFrameCount(prev => {
            const newCount = prev + 1;
            if (newCount % 5 === 0) {
              console.log(`Mock frame count for ${currentStep}: ${newCount}/${FRAMES_PER_POSITION}`);
            }
            return newCount;
          });
        }, 100); // 10 FPS for demo

        subscription = { unsubscribe: () => clearInterval(interval) };
      } else {
        // Real frame subscription
        subscription = nativeCameraModule.subscribeToFrames((frame) => {
          if (frame.eyeLandmarks?.gazeData && frame.eyeLandmarks.confidence > 0.3) {
            const gazeValue = frame.eyeLandmarks.gazeData.normalizedGazeX;
          
          setCalibrationData(prev => {
            const currentPoint = prev.points.find(p => p.position === currentStep);
            
            if (currentPoint) {
              // Add to existing point
              const updatedPoints = prev.points.map(p => 
                p.position === currentStep 
                  ? { ...p, gazeValues: [...p.gazeValues, gazeValue] }
                  : p
              );
              
              const currentUpdatedPoint = updatedPoints.find(p => p.position === currentStep);
              console.log(`Collected frame ${currentUpdatedPoint?.gazeValues.length} for ${currentStep}: ${gazeValue.toFixed(3)}`);
              
              return {
                ...prev,
                points: updatedPoints
              };
            } else {
              // Create new point
              console.log(`Starting collection for ${currentStep}: ${gazeValue.toFixed(3)}`);
              return {
                ...prev,
                points: [...prev.points, {
                  position: currentStep,
                  gazeValues: [gazeValue],
                  targetValue: currentConfig.targetValue
                }]
              };
            }
          });

          setFrameCount(prev => {
            const newCount = prev + 1;
            if (newCount % 5 === 0) {
              console.log(`Frame count for ${currentStep}: ${newCount}/${FRAMES_PER_POSITION}`);
            }
            return newCount;
          });
        }
      });
      }
    }

    return () => {
      if (subscription) {
        if (DEMO_MODE) {
          subscription.unsubscribe();
        } else {
          nativeCameraModule.unsubscribeFromFrames();
        }
      }
      scaleAnim.stopAnimation();
      opacityAnim.stopAnimation();
    };
  }, [isCollecting, currentStep]);

  useEffect(() => {
    if (frameCount >= FRAMES_PER_POSITION && isCollecting && !isCompleting) {
      console.log(`Reached target frames (${frameCount}/${FRAMES_PER_POSITION}) for ${currentStep}`);
      setIsCollecting(false); // Immediately stop collection
      stopCollection();
      moveToNextStep();
    }
  }, [frameCount, isCollecting, isCompleting, currentStep]);

  const startCollection = () => {
    setIsCollecting(true);
    setFrameCount(0);
  };

  const stopCollection = () => {
    setIsCollecting(false);
    scaleAnim.stopAnimation();
    Animated.timing(opacityAnim, { toValue: 0.7, duration: 300, useNativeDriver: true }).start();
  };

  const moveToNextStep = () => {
    const steps: Array<'left' | 'center' | 'right'> = ['left', 'center', 'right'];
    const currentIndex = steps.indexOf(currentStep);
    
    console.log(`Completed step ${currentIndex + 1} (${currentStep}), collected ${frameCount} frames`);
    console.log('Current calibration points:', calibrationData.points.length);
    
    if (currentIndex < steps.length - 1) {
      // Move to next step
      const nextStep = steps[currentIndex + 1];
      console.log(`Moving to step ${currentIndex + 2} (${nextStep})`);
      setCurrentStep(nextStep);
      setFrameCount(0);
    } else {
      // Calibration complete
      console.log('All steps completed, starting calibration calculation');
      console.log('Final calibration data:', calibrationData.points);
      setIsCompleting(true);
      completeCalibration();
    }
  };

  const completeCalibration = async () => {
    if (isCompleting) {
      console.log('Calibration already in progress, skipping...');
      return;
    }
    
    try {
      console.log('Completing calibration with points:', calibrationData.points);
      
      // Validate that we have all required calibration points
      const requiredPositions: Array<'left' | 'center' | 'right'> = ['left', 'center', 'right'];
      const collectedPositions = calibrationData.points.map(p => p.position);
      const missingPositions = requiredPositions.filter(pos => !collectedPositions.includes(pos));
      
      if (missingPositions.length > 0) {
        console.error('Missing calibration positions:', missingPositions);
        Alert.alert(
          'Incomplete Calibration',
          `Missing data for: ${missingPositions.join(', ')}. Please restart calibration.`
        );
        return;
      }

      // Validate that each point has sufficient data
      const insufficientPoints = calibrationData.points.filter(p => p.gazeValues.length < 5);
      if (insufficientPoints.length > 0) {
        console.error('Insufficient data for positions:', insufficientPoints.map(p => p.position));
        Alert.alert(
          'Insufficient Data',
          `Not enough frames collected for: ${insufficientPoints.map(p => p.position).join(', ')}. Please restart calibration.`
        );
        return;
      }

      // Calculate linear transform
      const transform = calculateLinearTransform(calibrationData.points);
      
      const finalCalibrationData: CalibrationData = {
        ...calibrationData,
        isComplete: true,
        linearTransform: transform,
        timestamp: Date.now(),
      };

      // Save to AsyncStorage
      await AsyncStorage.setItem('gazeCalibration', JSON.stringify(finalCalibrationData));
      
      Alert.alert(
        'Calibration Complete!',
        `Linear transform calculated:\nSlope: ${transform.slope.toFixed(3)}\nIntercept: ${transform.intercept.toFixed(3)}\n\nYour gaze tracking is now personalized!`,
        [
          {
            text: 'OK',
            onPress: onCalibrationComplete,
          },
        ]
      );
    } catch (error) {
      console.error('Failed to save calibration:', error);
      Alert.alert('Error', 'Failed to save calibration data');
    }
  };

  const calculateLinearTransform = (points: CalibrationPoint[]) => {
    // Ensure we have all 3 calibration points
    if (points.length !== 3) {
      console.error('Insufficient calibration points:', points.length);
      return { slope: 1, intercept: 0 }; // Default identity transform
    }

    // Calculate average gaze value for each position
    const averages = points.map(point => ({
      target: point.targetValue,
      measured: point.gazeValues.reduce((sum, val) => sum + val, 0) / point.gazeValues.length,
    }));

    console.log('Calibration averages:', averages);

    // Ensure we have valid measured values
    const validAverages = averages.filter(avg => !isNaN(avg.measured) && isFinite(avg.measured));
    if (validAverages.length < 2) {
      console.error('Insufficient valid calibration data');
      return { slope: 1, intercept: 0 }; // Default identity transform
    }

    // Simple linear regression: y = mx + b
    // Where y = target values, x = measured values
    const n = validAverages.length;
    const sumX = validAverages.reduce((sum, p) => sum + p.measured, 0);
    const sumY = validAverages.reduce((sum, p) => sum + p.target, 0);
    const sumXY = validAverages.reduce((sum, p) => sum + p.measured * p.target, 0);
    const sumX2 = validAverages.reduce((sum, p) => sum + p.measured * p.measured, 0);

    const denominator = n * sumX2 - sumX * sumX;
    
    // Check for division by zero or invalid values
    if (Math.abs(denominator) < 1e-10) {
      console.error('Linear regression denominator too small, using simple mapping');
      // Fallback: use simple range mapping
      const measuredRange = Math.max(...validAverages.map(p => p.measured)) - Math.min(...validAverages.map(p => p.measured));
      const slope = measuredRange > 0 ? 2 / measuredRange : 1; // Target range is 2 (from -1 to +1)
      const intercept = -sumX / n * slope; // Center around 0
      return { slope, intercept };
    }

    const slope = (n * sumXY - sumX * sumY) / denominator;
    const intercept = (sumY - slope * sumX) / n;

    // Validate the calculated transform
    if (!isFinite(slope) || !isFinite(intercept)) {
      console.error('Invalid linear transform calculated, using identity');
      return { slope: 1, intercept: 0 };
    }

    console.log('Linear transform:', { slope, intercept });
    return { slope, intercept };
  };

  const resetCalibration = () => {
    Alert.alert(
      'Reset Calibration',
      'Are you sure you want to start over?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          onPress: () => {
            setCurrentStep('left');
            setFrameCount(0);
            setIsCollecting(false);
            setIsCompleting(false);
            setCalibrationData({
              points: [],
              timestamp: Date.now(),
              isComplete: false,
            });
          },
        },
      ]
    );
  };

  const getProgressText = () => {
    const completed = calibrationData.points.filter(p => p.gazeValues.length >= FRAMES_PER_POSITION).length;
    return `Step ${completed + 1} of 3`;
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.cancelButton} onPress={onCancel}>
          <Text style={styles.cancelButtonText}>Cancel</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Gaze Calibration</Text>
        <TouchableOpacity style={styles.resetButton} onPress={resetCalibration}>
          <Text style={styles.resetButtonText}>Reset</Text>
        </TouchableOpacity>
      </View>

      {/* Progress */}
      <View style={styles.progressContainer}>
        <Text style={styles.progressText}>{getProgressText()}</Text>
        <View style={styles.progressBar}>
          <View 
            style={[
              styles.progressFill, 
              { 
                width: `${((calibrationData.points.length / 3) * 100)}%`,
                backgroundColor: currentConfig.color 
              }
            ]} 
          />
        </View>
      </View>

      {/* Camera View */}
      <View style={styles.cameraContainer}>
        <CameraViewComponent style={styles.cameraPreview} active={true} />
        
        {/* Calibration Target */}
        <View style={styles.targetContainer}>
          <Animated.View 
            style={[
              styles.target, 
              { 
                backgroundColor: currentConfig.color,
                transform: [{ scale: scaleAnim }],
                opacity: opacityAnim,
              }
            ]} 
          />
        </View>
      </View>

      {/* Instructions */}
      <View style={styles.instructionsContainer}>
        <Text style={[styles.instruction, { color: currentConfig.color }]}>
          {currentConfig.instruction}
        </Text>
        <Text style={styles.subInstruction}>
          {isCollecting 
            ? `Collecting frames... ${frameCount}/${FRAMES_PER_POSITION}`
            : 'Press Start to begin collecting gaze data'
          }
        </Text>
      </View>

      {/* Controls */}
      <View style={styles.controlsContainer}>
        {!isCollecting ? (
          <TouchableOpacity 
            style={[styles.startButton, { backgroundColor: currentConfig.color }]} 
            onPress={startCollection}
          >
            <Text style={styles.startButtonText}>
              Start Collection
            </Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.stopButton} onPress={stopCollection}>
            <Text style={styles.stopButtonText}>Stop</Text>
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  cancelButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  cancelButtonText: {
    color: '#6b7280',
    fontSize: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1f2937',
  },
  resetButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  resetButtonText: {
    color: '#ef4444',
    fontSize: 16,
  },
  progressContainer: {
    paddingHorizontal: 20,
    paddingVertical: 15,
  },
  progressText: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 8,
    textAlign: 'center',
  },
  progressBar: {
    height: 4,
    backgroundColor: '#e5e7eb',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },
  cameraContainer: {
    flex: 1,
    position: 'relative',
    margin: 20,
    borderRadius: 12,
    overflow: 'hidden',
  },
  cameraPreview: {
    flex: 1,
  },
  targetContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  target: {
    width: 60,
    height: 60,
    borderRadius: 30,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  instructionsContainer: {
    paddingHorizontal: 20,
    paddingVertical: 15,
    alignItems: 'center',
  },
  instruction: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 8,
  },
  subInstruction: {
    fontSize: 16,
    color: '#6b7280',
    textAlign: 'center',
  },
  controlsContainer: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  startButton: {
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  startButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '600',
  },
  stopButton: {
    backgroundColor: '#ef4444',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  stopButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '600',
  },
}); 