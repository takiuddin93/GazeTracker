import AsyncStorage from '@react-native-async-storage/async-storage';

export interface CalibrationTransform {
  slope: number;
  intercept: number;
}

export interface CalibrationData {
  points: Array<{
    position: 'left' | 'center' | 'right';
    gazeValues: number[];
    targetValue: number;
  }>;
  timestamp: number;
  isComplete: boolean;
  linearTransform?: CalibrationTransform;
}

class CalibrationService {
  private static instance: CalibrationService;
  private calibrationData: CalibrationData | null = null;
  private isLoaded = false;

  private constructor() {}

  static getInstance(): CalibrationService {
    if (!CalibrationService.instance) {
      CalibrationService.instance = new CalibrationService();
    }
    return CalibrationService.instance;
  }

  /**
   * Load calibration data from AsyncStorage
   */
  async loadCalibration(): Promise<boolean> {
    try {
      const storedData = await AsyncStorage.getItem('gazeCalibration');
      if (storedData) {
        this.calibrationData = JSON.parse(storedData);
        this.isLoaded = true;
        console.log('Calibration loaded:', this.calibrationData?.linearTransform);
        return this.calibrationData?.isComplete || false;
      }
      return false;
    } catch (error) {
      console.error('Failed to load calibration:', error);
      return false;
    }
  }

  /**
   * Check if calibration is available and complete
   */
  isCalibrated(): boolean {
    return this.isLoaded && 
           this.calibrationData?.isComplete === true && 
           this.calibrationData?.linearTransform !== undefined;
  }

  /**
   * Apply calibration correction to a raw gaze value
   */
  applyCalibratedGaze(rawGazeX: number): number {
    if (!this.isCalibrated() || !this.calibrationData?.linearTransform) {
      // Return raw value if no calibration available
      return rawGazeX;
    }

    const { slope, intercept } = this.calibrationData.linearTransform;
    
    // Apply linear transform: calibrated = slope * raw + intercept
    const calibratedGaze = slope * rawGazeX + intercept;
    
    // Clamp to [-1, 1] range
    return Math.max(-1, Math.min(1, calibratedGaze));
  }

  /**
   * Get calibration statistics for debugging
   */
  getCalibrationInfo(): {
    isCalibrated: boolean;
    transform?: CalibrationTransform;
    timestamp?: number;
    pointsCount?: number;
  } {
    return {
      isCalibrated: this.isCalibrated(),
      transform: this.calibrationData?.linearTransform,
      timestamp: this.calibrationData?.timestamp,
      pointsCount: this.calibrationData?.points.length,
    };
  }

  /**
   * Clear calibration data
   */
  async clearCalibration(): Promise<void> {
    try {
      await AsyncStorage.removeItem('gazeCalibration');
      this.calibrationData = null;
      this.isLoaded = false;
      console.log('Calibration cleared');
    } catch (error) {
      console.error('Failed to clear calibration:', error);
      throw error;
    }
  }

  /**
   * Force reload calibration from storage
   */
  async reloadCalibration(): Promise<boolean> {
    this.isLoaded = false;
    this.calibrationData = null;
    return await this.loadCalibration();
  }
}

export default CalibrationService; 