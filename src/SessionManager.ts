import AsyncStorage from '@react-native-async-storage/async-storage';
import { EyeLandmarks } from './NativeCameraModule';
import CalibrationService from './CalibrationService';
import { apiService, RecordingData } from './ApiService';
import { networkService } from './NetworkService';

// Generate UUID v4
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

export interface SessionDataPoint {
  session_id: string;
  timestamp: number;
  high_res_timestamp: number;
  gaze_raw: number;
  gaze_calibrated?: number;
  iris_position: {
    x: number;
    y: number;
  };
  eye_corners: {
    left_x: number;
    right_x: number;
  };
  confidence: number;
  frame_number: number;
}

export interface SessionMetadata {
  session_id: string;
  start_timestamp: number;
  end_timestamp?: number;
  duration?: number;
  total_frames: number;
  calibration_used?: {
    slope: number;
    intercept: number;
    timestamp: number;
  };
  status: 'recording' | 'paused' | 'completed';
  created_at: string;
}

export interface SessionSummary {
  session_id: string;
  created_at: string;
  duration: number;
  total_frames: number;
  status: 'completed' | 'recording' | 'paused';
  calibration_used: boolean;
}

class SessionManager {
  private static instance: SessionManager;
  private currentSession: SessionMetadata | null = null;
  private sessionData: SessionDataPoint[] = [];
  private frameCounter = 0;
  private calibrationService = CalibrationService.getInstance();
  
  // Cloud sync properties
  private cloudSyncEnabled = true;
  private uploadQueue: SessionDataPoint[] = [];
  private uploadBatchSize = 50;
  private uploadInterval: NodeJS.Timeout | null = null;
  private lastUploadTime = 0;
  private apiSessionCreated = false;

  private constructor() {}

  static getInstance(): SessionManager {
    if (!SessionManager.instance) {
      SessionManager.instance = new SessionManager();
    }
    return SessionManager.instance;
  }

  /**
   * Start a new recording session
   */
  async startSession(): Promise<string> {
    if (this.currentSession && this.currentSession.status === 'recording') {
      throw new Error('Session already in progress');
    }

    const sessionId = generateUUID();
    const startTime = Date.now();
    
    // Get current calibration info
    const calibrationInfo = this.calibrationService.getCalibrationInfo();
    
    this.currentSession = {
      session_id: sessionId,
      start_timestamp: startTime,
      total_frames: 0,
      status: 'recording',
      created_at: new Date().toISOString(),
      calibration_used: calibrationInfo.isCalibrated ? calibrationInfo.transform : undefined,
    };

    this.sessionData = [];
    this.frameCounter = 0;
    this.uploadQueue = [];
    this.apiSessionCreated = false;

    // Save session metadata locally
    await this.saveSessionMetadata();
    
    // Start cloud sync if online
    await this.initializeCloudSync();
    
    console.log(`📹 Session started: ${sessionId} (Cloud sync: ${this.cloudSyncEnabled && networkService.getNetworkStatus() ? 'enabled' : 'offline'})`);
    return sessionId;
  }

  /**
   * Stop the current session
   */
  async stopSession(): Promise<void> {
    if (!this.currentSession || this.currentSession.status === 'completed') {
      throw new Error('No active session to stop');
    }

    const endTime = Date.now();
    this.currentSession.end_timestamp = endTime;
    this.currentSession.duration = endTime - this.currentSession.start_timestamp;
    this.currentSession.total_frames = this.frameCounter;
    this.currentSession.status = 'completed';

    // Stop upload interval
    if (this.uploadInterval) {
      clearInterval(this.uploadInterval);
      this.uploadInterval = null;
    }

    // Final upload to cloud
    await this.finalizeCloudSync();

    // Save final session data and metadata locally
    await this.saveSessionData();
    await this.saveSessionMetadata();
    
    console.log(`Session completed: ${this.currentSession.session_id}, Duration: ${this.currentSession.duration}ms, Frames: ${this.frameCounter}`);
    
    // Clear current session
    this.currentSession = null;
    this.sessionData = [];
    this.frameCounter = 0;
  }

  /**
   * Pause the current session
   */
  async pauseSession(): Promise<void> {
    if (!this.currentSession || this.currentSession.status !== 'recording') {
      throw new Error('No active session to pause');
    }

    this.currentSession.status = 'paused';
    await this.saveSessionMetadata();
    console.log(`Session paused: ${this.currentSession.session_id}`);
  }

  /**
   * Resume a paused session
   */
  async resumeSession(): Promise<void> {
    if (!this.currentSession || this.currentSession.status !== 'paused') {
      throw new Error('No paused session to resume');
    }

    this.currentSession.status = 'recording';
    await this.saveSessionMetadata();
    console.log(`Session resumed: ${this.currentSession.session_id}`);
  }

  /**
   * Add a data point to the current session
   */
  addDataPoint(eyeLandmarks: EyeLandmarks): void {
    if (!this.currentSession || this.currentSession.status !== 'recording') {
      return; // Don't record data if session isn't active
    }

    if (!eyeLandmarks.gazeData) {
      return; // Skip frames without gaze data
    }

    this.frameCounter++;

    const rawGaze = eyeLandmarks.gazeData.normalizedGazeX;
    const calibratedGaze = this.calibrationService.applyCalibratedGaze(rawGaze);

    const dataPoint: SessionDataPoint = {
      session_id: this.currentSession.session_id,
      timestamp: eyeLandmarks.timestamp,
      high_res_timestamp: eyeLandmarks.highResTimestamp,
      gaze_raw: rawGaze,
      gaze_calibrated: this.calibrationService.isCalibrated() ? calibratedGaze : undefined,
      iris_position: {
        x: eyeLandmarks.gazeData.rawGazeX, // Using raw iris X position
        y: 0, // We don't track Y position yet
      },
      eye_corners: {
        left_x: eyeLandmarks.gazeData.leftEyeX,
        right_x: eyeLandmarks.gazeData.rightEyeX,
      },
      confidence: eyeLandmarks.confidence,
      frame_number: this.frameCounter,
    };

    this.sessionData.push(dataPoint);

    // Add to upload queue for cloud sync
    if (this.cloudSyncEnabled) {
      this.uploadQueue.push(dataPoint);
    }

    // Save data periodically (every 100 frames)
    if (this.frameCounter % 100 === 0) {
      this.saveSessionData().catch(error => 
        console.error('Failed to save session data:', error)
      );
    }
  }

  /**
   * Get current session info
   */
  getCurrentSession(): SessionMetadata | null {
    return this.currentSession;
  }

  /**
   * Get current session stats
   */
  getCurrentSessionStats(): {
    frameCount: number;
    duration: number;
    isRecording: boolean;
    sessionId?: string;
  } {
    return {
      frameCount: this.frameCounter,
      duration: this.currentSession 
        ? Date.now() - this.currentSession.start_timestamp 
        : 0,
      isRecording: this.currentSession?.status === 'recording' || false,
      sessionId: this.currentSession?.session_id,
    };
  }

  /**
   * Get all session summaries
   */
  async getAllSessions(): Promise<SessionSummary[]> {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const sessionKeys = keys.filter(key => key.startsWith('session_meta_'));
      
      const sessions: SessionSummary[] = [];
      
      for (const key of sessionKeys) {
        const metadataStr = await AsyncStorage.getItem(key);
        if (metadataStr) {
          const metadata: SessionMetadata = JSON.parse(metadataStr);
          sessions.push({
            session_id: metadata.session_id,
            created_at: metadata.created_at,
            duration: metadata.duration || 0,
            total_frames: metadata.total_frames,
            status: metadata.status,
            calibration_used: !!metadata.calibration_used,
          });
        }
      }

      // Sort by creation date (newest first)
      return sessions.sort((a, b) => 
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    } catch (error) {
      console.error('Failed to get sessions:', error);
      return [];
    }
  }

  /**
   * Delete a session and its data
   */
  async deleteSession(sessionId: string): Promise<void> {
    try {
      await AsyncStorage.removeItem(`session_meta_${sessionId}`);
      await AsyncStorage.removeItem(`session_data_${sessionId}`);
      console.log(`Session deleted: ${sessionId}`);
    } catch (error) {
      console.error('Failed to delete session:', error);
      throw error;
    }
  }

  /**
   * Get session data for export
   */
  async getSessionData(sessionId: string): Promise<{
    metadata: SessionMetadata;
    data: SessionDataPoint[];
  } | null> {
    try {
      const metadataStr = await AsyncStorage.getItem(`session_meta_${sessionId}`);
      const dataStr = await AsyncStorage.getItem(`session_data_${sessionId}`);
      
      if (!metadataStr || !dataStr) {
        return null;
      }

      return {
        metadata: JSON.parse(metadataStr),
        data: JSON.parse(dataStr),
      };
    } catch (error) {
      console.error('Failed to get session data:', error);
      return null;
    }
  }

  /**
   * Get session data in API format for backend
   */
  async getSessionDataForAPI(sessionId: string): Promise<any | null> {
    try {
      const sessionData = await this.getSessionData(sessionId);
      if (!sessionData) {
        return null;
      }

      const { metadata, data } = sessionData;

      // Calculate calibration values from the linear transform
      let calibrationValues = { left: -0.85, center: 0.01, right: 0.90 }; // defaults
      
      if (metadata.calibration_used) {
        const { slope, intercept } = metadata.calibration_used;
        // Apply inverse transform to get original calibration points
        calibrationValues = {
          left: (-1 - intercept) / slope,
          center: (0 - intercept) / slope,
          right: (1 - intercept) / slope
        };
      }

      // Calculate sampling rate (frames per second)
      const totalDuration = (metadata.end_timestamp || Date.now()) - metadata.start_timestamp;
      const samplingRate = Math.round((data.length / (totalDuration / 1000)) * 10) / 10;

      return {
        session_id: sessionId,
        device_info: {
          platform: "Android", // Could be dynamic with Platform.OS
          model: "Unknown" // Could be enhanced with device-info
        },
        calibration: calibrationValues,
        sampling_rate: samplingRate,
        data: data.map(frame => ({
          timestamp: frame.timestamp,
          x: frame.gaze_calibrated || frame.gaze_raw
        }))
      };
    } catch (error) {
      console.error('Failed to get session data for API:', error);
      return null;
    }
  }

  /**
   * Clear all session data
   */
  async clearAllSessions(): Promise<void> {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const sessionKeys = keys.filter(key => 
        key.startsWith('session_meta_') || key.startsWith('session_data_')
      );
      
      await AsyncStorage.multiRemove(sessionKeys);
      console.log(`Cleared ${sessionKeys.length} session files`);
    } catch (error) {
      console.error('Failed to clear sessions:', error);
      throw error;
    }
  }

  /**
   * Save session metadata to storage
   */
  private async saveSessionMetadata(): Promise<void> {
    if (!this.currentSession) return;
    
    try {
      await AsyncStorage.setItem(
        `session_meta_${this.currentSession.session_id}`,
        JSON.stringify(this.currentSession)
      );
    } catch (error) {
      console.error('Failed to save session metadata:', error);
    }
  }

  /**
   * Save session data to storage
   */
  private async saveSessionData(): Promise<void> {
    if (!this.currentSession || this.sessionData.length === 0) return;
    
    try {
      await AsyncStorage.setItem(
        `session_data_${this.currentSession.session_id}`,
        JSON.stringify(this.sessionData)
      );
    } catch (error) {
      console.error('Failed to save session data:', error);
    }
  }

  /**
   * Initialize cloud sync for the current session
   */
  private async initializeCloudSync(): Promise<void> {
    if (!this.cloudSyncEnabled || !networkService.getNetworkStatus() || !this.currentSession) {
      return;
    }

    try {
      // Check API connection
      const isConnected = await apiService.checkConnection();
      if (!isConnected) {
        console.warn('⚠️ API server not reachable, using offline mode');
        return;
      }

      // Create initial session in backend (will be updated as we record)
      const calibrationInfo = this.calibrationService.getCalibrationInfo();
      const initialData: RecordingData = {
        session_id: this.currentSession.session_id,
        device_info: apiService.getDeviceInfo(),
        calibration: calibrationInfo.isCalibrated 
          ? {
              left: (calibrationInfo.transform!.intercept - 1) / calibrationInfo.transform!.slope,
              center: calibrationInfo.transform!.intercept / calibrationInfo.transform!.slope,
              right: (calibrationInfo.transform!.intercept + 1) / calibrationInfo.transform!.slope,
            }
          : { left: -0.8, center: 0.0, right: 0.9 }, // Default values
        sampling_rate: 30,
        data: [], // Start with empty data, will be updated
      };

      const result = await apiService.createRecording(initialData);
      if (result.success) {
        this.apiSessionCreated = true;
        console.log('☁️ Session created in cloud:', this.currentSession.session_id);
        
        // Start periodic uploads
        this.startPeriodicUpload();
      } else {
        console.warn('⚠️ Failed to create session in cloud:', result.error);
      }
    } catch (error) {
      console.error('❌ Error initializing cloud sync:', error);
    }
  }

  /**
   * Start periodic upload of data batches
   */
  private startPeriodicUpload(): void {
    if (this.uploadInterval) {
      clearInterval(this.uploadInterval);
    }

    this.uploadInterval = setInterval(() => {
      this.uploadDataBatch().catch(error => 
        console.error('Error in periodic upload:', error)
      );
    }, 2000); // Upload every 2 seconds
  }

  /**
   * Upload a batch of data points to the cloud
   */
  private async uploadDataBatch(): Promise<void> {
    if (!this.cloudSyncEnabled || !networkService.getNetworkStatus() || !this.apiSessionCreated || this.uploadQueue.length === 0) {
      return;
    }

    try {
      // Get batch of data to upload
      const batchSize = Math.min(this.uploadBatchSize, this.uploadQueue.length);
      const batch = this.uploadQueue.splice(0, batchSize);
      
      // Convert to API format
      const apiData = batch.map(point => ({
        timestamp: point.timestamp,
        x: point.gaze_calibrated || point.gaze_raw,
      }));

      // Upload batch (for now just log it, real implementation would update the recording)
      const success = await apiService.uploadDataBatch(this.currentSession!.session_id, apiData);
      
      if (success) {
        this.lastUploadTime = Date.now();
        console.log(`☁️ Uploaded batch: ${batch.length} frames (${this.uploadQueue.length} remaining)`);
      } else {
        // Put data back in queue if upload failed
        this.uploadQueue.unshift(...batch);
        console.warn('⚠️ Upload failed, data queued for retry');
      }
    } catch (error) {
      console.error('❌ Error uploading batch:', error);
    }
  }

  /**
   * Finalize cloud sync when session ends
   */
  private async finalizeCloudSync(): Promise<void> {
    if (!this.cloudSyncEnabled || !networkService.getNetworkStatus() || !this.apiSessionCreated) {
      return;
    }

    try {
      // Upload any remaining data
      while (this.uploadQueue.length > 0) {
        await this.uploadDataBatch();
        await new Promise(resolve => setTimeout(resolve, 500)); // Brief delay between uploads
      }

      // Create final complete recording with all data
      const calibrationInfo = this.calibrationService.getCalibrationInfo();
      const finalData: RecordingData = {
        session_id: this.currentSession!.session_id,
        device_info: apiService.getDeviceInfo(),
        calibration: calibrationInfo.isCalibrated 
          ? {
              left: (calibrationInfo.transform!.intercept - 1) / calibrationInfo.transform!.slope,
              center: calibrationInfo.transform!.intercept / calibrationInfo.transform!.slope,
              right: (calibrationInfo.transform!.intercept + 1) / calibrationInfo.transform!.slope,
            }
          : { left: -0.8, center: 0.0, right: 0.9 },
        sampling_rate: 30,
        data: this.sessionData.map(point => ({
          timestamp: point.timestamp,
          x: point.gaze_calibrated || point.gaze_raw,
        })),
      };

      // For now, just create a new recording with all data (in real implementation, you'd update existing)
      const result = await apiService.createRecording({
        ...finalData,
        session_id: `${this.currentSession!.session_id}-final`,
      });

      if (result.success) {
        console.log('✅ Session finalized in cloud:', result.data?.frame_count, 'frames');
      } else {
        console.warn('⚠️ Failed to finalize session in cloud:', result.error);
      }
    } catch (error) {
      console.error('❌ Error finalizing cloud sync:', error);
    }
  }

  /**
   * Enable or disable cloud sync
   */
  setCloudSyncEnabled(enabled: boolean): void {
    this.cloudSyncEnabled = enabled;
    console.log(`☁️ Cloud sync ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Get cloud sync status
   */
  getCloudSyncStatus(): {
    enabled: boolean;
    online: boolean;
    sessionCreated: boolean;
    queueSize: number;
  } {
    return {
      enabled: this.cloudSyncEnabled,
      online: networkService.getNetworkStatus(),
      sessionCreated: this.apiSessionCreated,
      queueSize: this.uploadQueue.length,
    };
  }
}

export default SessionManager; 