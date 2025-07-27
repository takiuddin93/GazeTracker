import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  Alert,
  SafeAreaView,
} from 'react-native';
import { 
  nativeCameraModule, 
  CameraFrame, 
  CameraInfo, 
  CameraType,
  EyeLandmarks 
} from './src/NativeCameraModule';
import CameraViewComponent from './src/CameraViewComponent';
import Settings from './src/Settings';
import CalibrationScreen from './src/CalibrationScreen';
import CalibrationService from './src/CalibrationService';
import SessionManager from './src/SessionManager';
import { networkService } from './src/NetworkService';
import { apiService } from './src/ApiService';

function App() {
  const [currentTab, setCurrentTab] = useState<'tracker' | 'settings' | 'calibration'>('tracker');
  const [cameraType, setCameraType] = useState<CameraType>('front');
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [currentFPS, setCurrentFPS] = useState(0);
  const [cameraInfo, setCameraInfo] = useState<CameraInfo | null>(null);
  const [eyeLandmarks, setEyeLandmarks] = useState<EyeLandmarks | null>(null);
  const [isCalibrated, setIsCalibrated] = useState(false);
  const [sessionStats, setSessionStats] = useState({
    frameCount: 0,
    duration: 0,
    isRecording: false,
    sessionId: undefined as string | undefined,
  });
  const [sessionStatus, setSessionStatus] = useState<'idle' | 'recording' | 'paused'>('idle');
  const [isOnline, setIsOnline] = useState(true);
  const [cloudSyncStatus, setCloudSyncStatus] = useState({
    enabled: true,
    online: true,
    sessionCreated: false,
    queueSize: 0,
  });
  
  const calibrationService = CalibrationService.getInstance();
  const sessionManager = SessionManager.getInstance();

  useEffect(() => {
    // Start camera on component mount
    startCamera();
    
    // Cleanup on unmount
    return () => {
      nativeCameraModule.unsubscribeFromFrames();
      nativeCameraModule.stopCamera().catch(console.error);
    };
  }, [startCamera]);

  // Recording timer effect


  // Load calibration on app start
  useEffect(() => {
    const loadCalibration = async () => {
      const calibrated = await calibrationService.loadCalibration();
      setIsCalibrated(calibrated);
      console.log('Calibration status on startup:', calibrated);
    };
    loadCalibration();
  }, [calibrationService]);

  // Initialize network monitoring and cloud sync
  useEffect(() => {
    // Set initial network status
    setIsOnline(networkService.getNetworkStatus());
    setCloudSyncStatus(sessionManager.getCloudSyncStatus());

    // Listen for network changes
    const networkUnsubscribe = networkService.addNetworkListener((online) => {
      setIsOnline(online);
      console.log('🌐 Network status changed:', online ? 'online' : 'offline');
    });

    // Periodically update cloud sync status
    const statusInterval = setInterval(() => {
      setCloudSyncStatus(sessionManager.getCloudSyncStatus());
    }, 1000);

    // Test API connection on startup
    apiService.checkConnection().then(connected => {
      console.log('🔌 API connection:', connected ? 'available' : 'unavailable');
    });

    return () => {
      networkUnsubscribe();
      clearInterval(statusInterval);
    };
  }, [sessionManager]);

  const startCamera = useCallback(async () => {
    try {
      // Check camera permission first
      const hasPermission = await nativeCameraModule.checkCameraPermission();
      
      if (!hasPermission) {
        // Request permission
        const permissionResult = await nativeCameraModule.requestCameraPermission();
        
        if (permissionResult === 'requested') {
          Alert.alert(
            'Camera Permission Required',
            'Please grant camera permission and try again.',
            [{ text: 'OK' }]
          );
          return;
        } else if (permissionResult !== true) {
          Alert.alert(
            'Camera Permission Required',
            'Camera permission is required for gaze tracking. Please enable it in device settings.',
            [{ text: 'OK' }]
          );
          return;
        }
      }

      // Make sure to unsubscribe any existing subscription first
      nativeCameraModule.unsubscribeFromFrames();
      
      const info = await nativeCameraModule.startCamera(cameraType);
      setCameraInfo(info);
      setIsCameraActive(true);
      
      // Subscribe to frame events - always detect eyes, record data when session active
      nativeCameraModule.subscribeToFramesWithMonitoring(
        (frame: CameraFrame, fps: number) => {
          // Always update eye landmarks for live preview
          if (frame.eyeLandmarks) {
            setEyeLandmarks(frame.eyeLandmarks);
            
            // Add data to current session if recording
            sessionManager.addDataPoint(frame.eyeLandmarks);
          }
          
          // Update session stats
          const stats = sessionManager.getCurrentSessionStats();
          setSessionStats(stats);
          setSessionStatus(stats.isRecording ? 'recording' : 'idle');
          
          // Update FPS monitoring (only when recording for performance)
          if (stats.isRecording) {
            setCurrentFPS(fps);
          }
        }
      );
      
      console.log('Camera started:', info);
    } catch (error) {
      console.error('Failed to start camera:', error);
      Alert.alert('Camera Error', `Failed to start camera: ${error}`);
    }
  }, [cameraType, sessionManager]);

  const stopCamera = useCallback(async () => {
    try {
      // Unsubscribe from frame events first
      nativeCameraModule.unsubscribeFromFrames();
      
      await nativeCameraModule.stopCamera();
      setIsCameraActive(false);
      setCameraInfo(null);
      setCurrentFPS(0);
      setFrameCount(0);
      setEyeLandmarks(null); // Clear eye landmarks when camera stops
      console.log('Camera stopped');
    } catch (error) {
      console.error('Failed to stop camera:', error);
    }
  }, []);

  const switchCamera = useCallback(async (newCameraType: CameraType) => {
    try {
      setCameraType(newCameraType);
      
      // Clear eye landmarks during camera switch
      setEyeLandmarks(null);
      
      const info = await nativeCameraModule.switchCamera(newCameraType);
      setCameraInfo(info);
      console.log('Camera switched:', info);
      
      // Note: switchCamera internally handles frame subscription
      // so no need to manually resubscribe here
    } catch (error) {
      console.error('Failed to switch camera:', error);
      Alert.alert('Camera Error', `Failed to switch camera: ${error}`);
    }
  }, []);

  const handleStartSession = async () => {
    try {
      const sessionId = await sessionManager.startSession();
      console.log('Session started:', sessionId);
      Alert.alert('Session Started', `Recording session started.\nSession ID: ${sessionId.substring(0, 8)}...`);
    } catch (error) {
      console.error('Failed to start session:', error);
      Alert.alert('Error', 'Failed to start recording session');
    }
  };

  const handleStopSession = async () => {
    try {
      // Get stats BEFORE stopping the session
      const stats = sessionManager.getCurrentSessionStats();
      await sessionManager.stopSession();
      
      Alert.alert('Session Complete', `Recording stopped.\nFrames recorded: ${stats.frameCount}\nDuration: ${(stats.duration / 1000).toFixed(1)}s`);
    } catch (error) {
      console.error('Failed to stop session:', error);
      Alert.alert('Error', 'Failed to stop recording session');
    }
  };

  const handlePauseResumeSession = async () => {
    try {
      const currentSession = sessionManager.getCurrentSession();
      if (currentSession?.status === 'recording') {
        await sessionManager.pauseSession();
        Alert.alert('Session Paused', 'Recording has been paused.');
      } else if (currentSession?.status === 'paused') {
        await sessionManager.resumeSession();
        Alert.alert('Session Resumed', 'Recording has been resumed.');
      }
    } catch (error) {
      console.error('Failed to pause/resume session:', error);
      Alert.alert('Error', 'Failed to pause/resume session');
    }
  };

  const handleCalibrate = () => {
    setCurrentTab('calibration');
  };

  const handleTracker = () => {
    setCurrentTab('tracker');
  };

  const handleSettings = () => {
    setCurrentTab('settings');
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#f8f9fa" />
      
      {currentTab === 'tracker' ? (
        <>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Gaze Tracker</Text>
            <Text style={styles.subtitle}>Native Camera Integration</Text>
          </View>

      {/* Camera Controls */}
      <View style={styles.cameraControls}>
        <TouchableOpacity
          style={[
            styles.cameraButton,
            styles.frontCameraButton,
            cameraType === 'front' && styles.activeCameraButton
          ]}
          onPress={() => switchCamera('front')}
        >
          <Text style={[styles.cameraButtonText, cameraType === 'front' && styles.activeCameraButtonText]}>
            Front Camera
          </Text>
        </TouchableOpacity>
        
        <TouchableOpacity
          style={[
            styles.cameraButton,
            styles.backCameraButton,
            cameraType === 'back' && styles.activeCameraButton
          ]}
          onPress={() => switchCamera('back')}
        >
          <Text style={[styles.cameraButtonText, cameraType === 'back' && styles.activeCameraButtonText]}>
            Back Camera
          </Text>
        </TouchableOpacity>
      </View>

      {/* Camera View with Live Preview */}
      <View style={styles.cameraContainer}>
        {/* Native Camera Preview */}
        <CameraViewComponent 
          style={styles.cameraPreview}
          active={isCameraActive}
        />
        
        {/* Performance Stats */}
        <View style={styles.statsContainer}>
          <Text style={styles.statsText}>
            {isCameraActive ? '🟢 Camera Active' : '🔴 Camera Inactive'}
          </Text>
          {sessionStats.isRecording && (
            <Text style={styles.statsText}>
              🔴 Recording: {(sessionStats.duration / 1000).toFixed(1)}s
            </Text>
          )}
          {sessionStats.sessionId && (
            <Text style={styles.statsText}>
              📊 Session: {sessionStats.sessionId.substring(0, 8)}...
            </Text>
          )}
          <Text style={styles.statsText}>FPS: {sessionStats.isRecording ? currentFPS : 'Standby'}</Text>
          <Text style={styles.statsText}>Frames: {sessionStats.isRecording ? sessionStats.frameCount : 'Standby'}</Text>
          {cameraInfo && (
            <Text style={styles.statsText}>
              Resolution: {cameraInfo.width}x{cameraInfo.height}
            </Text>
          )}
          {eyeLandmarks && (
            <>
              <Text style={styles.statsText}>
                👁️ Eyes: {eyeLandmarks.confidence.toFixed(2)}
              </Text>
              {eyeLandmarks.gazeData && (
                <>
                  <Text style={styles.statsText}>
                    🎯 Gaze: {eyeLandmarks.gazeData.normalizedGazeX.toFixed(3)}
                  </Text>
                  {isCalibrated && (
                    <Text style={styles.statsText}>
                      ✅ Cal: {calibrationService.applyCalibratedGaze(eyeLandmarks.gazeData.normalizedGazeX).toFixed(3)}
                    </Text>
                  )}
                </>
              )}
            </>
          )}
          {/* Cloud Sync Status */}
          <Text style={styles.statsText}>
            🌐 {isOnline ? 'Online' : 'Offline'}
          </Text>
          <Text style={styles.statsText}>
            ☁️ Sync: {cloudSyncStatus.enabled ? (cloudSyncStatus.sessionCreated ? '✅' : '⏳') : '❌'}
          </Text>
          {cloudSyncStatus.queueSize > 0 && (
            <Text style={styles.statsText}>
              📤 Queue: {cloudSyncStatus.queueSize}
            </Text>
          )}
        </View>
        
        {/* Crosshairs Overlay */}
        <View style={styles.crosshairs}>
          {/* Horizontal line */}
          <View style={styles.horizontalLine} />
          {/* Vertical line */}
          <View style={styles.verticalLine} />
          {/* Center dot */}
          <View style={styles.centerDot} />
        </View>
        
        {/* Camera View Label */}
        <View style={styles.cameraLabel}>
          <Text style={styles.cameraLabelText}>
            Live Camera Preview
          </Text>
          <Text style={styles.cameraSubLabelText}>
            Ready for TensorFlow Integration
          </Text>
        </View>
      </View>

      {/* Camera Control Buttons */}
      <View style={styles.cameraActionControls}>
        <TouchableOpacity
          style={[styles.cameraActionButton, isCameraActive ? styles.stopButton : styles.startButton]}
          onPress={isCameraActive ? stopCamera : startCamera}
        >
          <Text style={styles.cameraActionButtonText}>
            {isCameraActive ? 'Stop Camera' : 'Start Camera'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Session Recording Controls */}
      <View style={styles.actionControls}>
        {!sessionStats.isRecording && !sessionManager.getCurrentSession() ? (
          <TouchableOpacity
            style={[styles.actionButton, styles.recordButton]}
            onPress={handleStartSession}
          >
            <Text style={styles.actionButtonText}>🔴 Start Session</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.sessionControls}>
            <TouchableOpacity
              style={[styles.sessionButton, styles.pauseButton]}
              onPress={handlePauseResumeSession}
            >
              <Text style={styles.sessionButtonText}>
                {sessionStatus === 'recording' ? '⏸️ Pause' : '▶️ Resume'}
              </Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[styles.sessionButton, styles.stopButton]}
              onPress={handleStopSession}
            >
              <Text style={styles.sessionButtonText}>⏹️ Stop</Text>
            </TouchableOpacity>
          </View>
        )}
        
        <TouchableOpacity
          style={[styles.actionButton, styles.calibrateButton]}
          onPress={handleCalibrate}
        >
          <Text style={styles.actionButtonText}>📐 Calibrate</Text>
        </TouchableOpacity>
      </View>

        </>
      ) : currentTab === 'settings' ? (
        <Settings />
      ) : (
        <CalibrationScreen 
          onCalibrationComplete={async () => {
            await calibrationService.reloadCalibration();
            setIsCalibrated(calibrationService.isCalibrated());
            setCurrentTab('tracker');
          }}
          onCancel={() => setCurrentTab('tracker')}
        />
      )}

      {/* Bottom Navigation - Always Visible */}
      <View style={styles.bottomNav}>
        <TouchableOpacity 
          style={[styles.navButton, currentTab === 'tracker' && styles.activeNavButton]} 
          onPress={handleTracker}
        >
          <Text style={[styles.navButtonText, currentTab === 'tracker' && styles.activeNavButtonText]}>
            Tracker
          </Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={[styles.navButton, currentTab === 'settings' && styles.activeNavButton]} 
          onPress={handleSettings}
        >
          <Text style={[styles.navButtonText, currentTab === 'settings' && styles.activeNavButtonText]}>
            Settings
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  header: {
    alignItems: 'center',
    paddingVertical: 15,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  cameraControls: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 15,
    paddingHorizontal: 20,
  },
  cameraButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    marginHorizontal: 10,
    minWidth: 120,
    alignItems: 'center',
  },
  frontCameraButton: {
    backgroundColor: '#007AFF',
  },
  backCameraButton: {
    backgroundColor: '#34C759',
  },
  activeCameraButton: {
    opacity: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  cameraButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  activeCameraButtonText: {
    fontWeight: 'bold',
  },
  cameraContainer: {
    flex: 1,
    marginHorizontal: 20,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#2c2c2c',
    position: 'relative',
    borderWidth: 2,
    borderColor: '#007AFF',
  },
  cameraPreview: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  statsContainer: {
    position: 'absolute',
    top: 10,
    left: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderRadius: 8,
    padding: 10,
    zIndex: 10,
  },
  statsText: {
    color: '#fff',
    fontSize: 12,
    fontFamily: 'monospace',
    marginBottom: 2,
  },
  crosshairs: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  horizontalLine: {
    position: 'absolute',
    width: '60%',
    height: 2,
    backgroundColor: '#007AFF',
    opacity: 0.8,
  },
  verticalLine: {
    position: 'absolute',
    width: 2,
    height: '60%',
    backgroundColor: '#007AFF',
    opacity: 0.8,
  },
  centerDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#007AFF',
    position: 'absolute',
  },
  cameraLabel: {
    position: 'absolute',
    bottom: 20,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  cameraLabelText: {
    fontSize: 18,
    color: '#fff',
    fontWeight: '600',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 6,
  },
  cameraSubLabelText: {
    fontSize: 12,
    color: '#ccc',
    marginTop: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  cameraActionControls: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginVertical: 15,
    paddingHorizontal: 20,
  },
  cameraActionButton: {
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 8,
    minWidth: 140,
    alignItems: 'center',
  },
  startButton: {
    backgroundColor: '#34C759',
  },
  stopButton: {
    backgroundColor: '#FF3B30',
  },
  cameraActionButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  actionControls: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginVertical: 15,
    paddingHorizontal: 20,
  },
  actionButton: {
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 8,
    marginHorizontal: 15,
    minWidth: 100,
    alignItems: 'center',
  },
  recordButton: {
    backgroundColor: '#007AFF',
  },
  recordingButton: {
    backgroundColor: '#FF3B30',
  },
  calibrateButton: {
    backgroundColor: '#34C759',
  },
  actionButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  sessionControls: {
    flexDirection: 'row',
    gap: 10,
    flex: 1,
  },
  sessionButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  sessionButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
  pauseButton: {
    backgroundColor: '#fd7e14',
  },
  bottomNav: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 20,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    backgroundColor: 'white',
  },
  navButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  activeNavButton: {
    backgroundColor: '#007AFF',
  },
  navButtonText: {
    fontSize: 18,
    color: '#333',
    fontWeight: '500',
  },
  activeNavButtonText: {
    color: 'white',
    fontWeight: '600',
  },
});

export default App;
