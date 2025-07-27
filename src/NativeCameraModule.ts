import { NativeModules, NativeEventEmitter, EmitterSubscription } from 'react-native';

// Types for camera functionality
export interface Point {
  x: number;
  y: number;
}

export interface EyeData {
  iris: Point;
  innerCorner: Point;
  outerCorner: Point;
}

export interface GazeData {
  normalizedGazeX: number; // [-1, 1] where -1 = far left, 0 = center, 1 = far right
  rawGazeX: number; // Raw iris X position
  leftEyeX: number; // Left eye outer corner X
  rightEyeX: number; // Right eye outer corner X
  confidence: number; // Gaze estimation confidence
}

export interface EyeLandmarks {
  leftEye: EyeData;
  rightEye: EyeData;
  confidence: number;
  landmarkTimestamp: number;
  highResTimestamp: number; // High-resolution native timestamp (nanoseconds)
  gazeData?: GazeData; // Optional gaze estimation data
}

export interface CameraFrame {
  timestamp: number;
  width: number;
  height: number;
  format: string;
  eyeLandmarks?: EyeLandmarks;
}

export interface CameraInfo {
  cameraId: string;
  width: number;
  height: number;
}

export type CameraType = 'front' | 'back';

// Native module interface
interface ICameraModule {
  startCamera(cameraType: CameraType): Promise<CameraInfo>;
  stopCamera(): Promise<string>;
  switchCamera(cameraType: CameraType): Promise<CameraInfo>;
  checkCameraPermission(): Promise<boolean>;
  requestCameraPermission(): Promise<boolean | string>;
}

// Get the native module
const { CameraModule } = NativeModules;

if (!CameraModule) {
  throw new Error('CameraModule native module is not available');
}

// Event emitter for camera frames
const cameraEventEmitter = new NativeEventEmitter(CameraModule);

// Wrapper class for camera functionality
export class NativeCameraModule implements ICameraModule {
  private frameSubscription: EmitterSubscription | null = null;
  private onFrameCallback: ((frame: CameraFrame) => void) | null = null;

  /**
   * Start camera with specified type
   * @param cameraType - 'front' or 'back'
   * @returns Promise with camera info
   */
  async startCamera(cameraType: CameraType): Promise<CameraInfo> {
    try {
      const result = await CameraModule.startCamera(cameraType);
      return result;
    } catch (error) {
      throw new Error(`Failed to start camera: ${error}`);
    }
  }

  /**
   * Stop camera
   * @returns Promise with success message
   */
  async stopCamera(): Promise<string> {
    try {
      // Unsubscribe from frame events
      this.unsubscribeFromFrames();
      
      const result = await CameraModule.stopCamera();
      return result;
    } catch (error) {
      throw new Error(`Failed to stop camera: ${error}`);
    }
  }

  /**
   * Switch camera type
   * @param cameraType - 'front' or 'back'
   * @returns Promise with camera info
   */
  async switchCamera(cameraType: CameraType): Promise<CameraInfo> {
    try {
      const result = await CameraModule.switchCamera(cameraType);
      return result;
    } catch (error) {
      throw new Error(`Failed to switch camera: ${error}`);
    }
  }

  /**
   * Check if camera permission is granted
   * @returns Promise<boolean> - true if permission granted
   */
  async checkCameraPermission(): Promise<boolean> {
    try {
      const result = await CameraModule.checkCameraPermission();
      return result;
    } catch (error) {
      throw new Error(`Failed to check camera permission: ${error}`);
    }
  }

  /**
   * Request camera permission
   * @returns Promise<boolean | string> - true if granted, 'requested' if prompt shown
   */
  async requestCameraPermission(): Promise<boolean | string> {
    try {
      const result = await CameraModule.requestCameraPermission();
      return result;
    } catch (error) {
      throw new Error(`Failed to request camera permission: ${error}`);
    }
  }

  /**
   * Subscribe to camera frame events
   * @param callback - Function to call when frame is received
   */
  subscribeToFrames(callback: (frame: CameraFrame) => void): void {
    this.unsubscribeFromFrames(); // Clean up existing subscription
    
    this.onFrameCallback = callback;
    this.frameSubscription = cameraEventEmitter.addListener(
      'onCameraFrame',
      this.onFrameCallback
    );
  }

  /**
   * Unsubscribe from camera frame events
   */
  unsubscribeFromFrames(): void {
    if (this.frameSubscription) {
      this.frameSubscription.remove();
      this.frameSubscription = null;
    }
    this.onFrameCallback = null;
  }

  /**
   * Get current frame rate (for monitoring performance)
   */
  private frameCount = 0;
  private lastTimestamp = 0;
  private currentFPS = 0;

  monitorFrameRate(): number {
    return this.currentFPS;
  }

  private updateFrameRate(timestamp: number): void {
    this.frameCount++;
    
    if (this.lastTimestamp === 0) {
      this.lastTimestamp = timestamp;
      return;
    }

    const timeDiff = timestamp - this.lastTimestamp;
    
    // Calculate FPS every second
    if (timeDiff >= 1000) {
      this.currentFPS = Math.round((this.frameCount * 1000) / timeDiff);
      this.frameCount = 0;
      this.lastTimestamp = timestamp;
    }
  }

  /**
   * Subscribe with frame rate monitoring
   */
  subscribeToFramesWithMonitoring(
    callback: (frame: CameraFrame, fps: number) => void
  ): void {
    this.subscribeToFrames((frame: CameraFrame) => {
      this.updateFrameRate(frame.timestamp);
      callback(frame, this.currentFPS);
    });
  }
}

// Export singleton instance
export const nativeCameraModule = new NativeCameraModule();

// Export types
export type { CameraFrame, CameraInfo, CameraType, Point, EyeData, EyeLandmarks }; 