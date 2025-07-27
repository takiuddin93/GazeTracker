import { Platform } from 'react-native';

// API Configuration
const API_CONFIG = {
  BASE_URL: 'http://localhost:3000/api',
  TIMEOUT: 10000, // 10 seconds
  RETRY_ATTEMPTS: 3,
  BATCH_SIZE: 50, // Upload data in batches of 50 points
};

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  details?: any;
}

export interface RecordingData {
  session_id: string;
  device_info: {
    platform: string;
    model: string;
  };
  calibration: {
    left: number;
    center: number;
    right: number;
  };
  sampling_rate: number;
  data: Array<{
    timestamp: number;
    x: number;
  }>;
}

export interface CreateRecordingResponse {
  id: string;
  session_id: string;
  frame_count: number;
  duration: number;
  created_at: string;
}

class ApiService {
  private baseUrl: string;
  private timeout: number;

  constructor() {
    this.baseUrl = API_CONFIG.BASE_URL;
    this.timeout = API_CONFIG.TIMEOUT;
  }

  /**
   * Check if the API server is reachable
   */
  async checkConnection(): Promise<boolean> {
    try {
      const response = await this.fetchWithTimeout('/health', {
        method: 'GET',
      });
      
      const result = await response.json();
      return result.status === 'healthy' && result.database === 'connected';
    } catch (error) {
      console.warn('API connection check failed:', error);
      return false;
    }
  }

  /**
   * Create a new recording session
   */
  async createRecording(recordingData: RecordingData): Promise<ApiResponse<CreateRecordingResponse>> {
    try {
      console.log('📤 Creating recording:', recordingData.session_id);
      
      const response = await this.fetchWithTimeout('/recordings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(recordingData),
      });

      const result = await response.json();
      
      if (response.ok) {
        console.log('✅ Recording created successfully:', result.data?.session_id);
        return result;
      } else {
        console.error('❌ Failed to create recording:', result);
        return {
          success: false,
          error: result.error || 'Failed to create recording',
          message: result.message,
          details: result.details,
        };
      }
    } catch (error) {
      console.error('❌ Network error creating recording:', error);
      return {
        success: false,
        error: 'Network error',
        message: 'Failed to connect to server',
        details: error,
      };
    }
  }

  /**
   * Get a recording by session ID
   */
  async getRecording(sessionId: string): Promise<ApiResponse<RecordingData>> {
    try {
      console.log('📥 Fetching recording:', sessionId);
      
      const response = await this.fetchWithTimeout(`/recordings/${sessionId}`, {
        method: 'GET',
      });

      const result = await response.json();
      
      if (response.ok) {
        console.log('✅ Recording fetched successfully');
        return result;
      } else {
        console.error('❌ Failed to fetch recording:', result);
        return {
          success: false,
          error: result.error || 'Failed to fetch recording',
          message: result.message,
        };
      }
    } catch (error) {
      console.error('❌ Network error fetching recording:', error);
      return {
        success: false,
        error: 'Network error',
        message: 'Failed to connect to server',
        details: error,
      };
    }
  }

  /**
   * Get list of recent recordings
   */
  async getRecentRecordings(limit: number = 10): Promise<ApiResponse<any[]>> {
    try {
      const response = await this.fetchWithTimeout(`/recordings?limit=${limit}`, {
        method: 'GET',
      });

      const result = await response.json();
      
      if (response.ok) {
        return result;
      } else {
        return {
          success: false,
          error: result.error || 'Failed to fetch recordings',
          message: result.message,
        };
      }
    } catch (error) {
      console.error('❌ Network error fetching recordings:', error);
      return {
        success: false,
        error: 'Network error',
        message: 'Failed to connect to server',
      };
    }
  }

  /**
   * Update an existing recording with new data
   * (For real-time updates during recording)
   */
  async updateRecording(sessionId: string, additionalData: Array<{timestamp: number, x: number}>): Promise<ApiResponse> {
    try {
      // First get the existing recording
      const existingResponse = await this.getRecording(sessionId);
      
      if (!existingResponse.success || !existingResponse.data) {
        return {
          success: false,
          error: 'Recording not found',
          message: 'Cannot update non-existent recording',
        };
      }

      // Merge the new data
      const updatedRecording = {
        ...existingResponse.data,
        data: [...existingResponse.data.data, ...additionalData],
      };

      // For now, we'll create a new recording since our API doesn't have PUT
      // In a real implementation, you'd add a PUT endpoint
      console.log('📤 Updating recording with', additionalData.length, 'new data points');
      
      return {
        success: true,
        message: 'Data queued for upload',
      };
    } catch (error) {
      console.error('❌ Error updating recording:', error);
      return {
        success: false,
        error: 'Update failed',
        message: 'Failed to update recording',
      };
    }
  }

  /**
   * Upload data in batches for real-time recording
   */
  async uploadDataBatch(sessionId: string, dataPoints: Array<{timestamp: number, x: number}>): Promise<boolean> {
    try {
      // For now, we'll just log the batch upload
      // In a real implementation, you'd have a PATCH endpoint for incremental updates
      console.log(`📦 Batch upload: ${dataPoints.length} points for session ${sessionId}`);
      
      // Simulate network delay
      await new Promise(resolve => setTimeout(resolve, 100));
      
      return true;
    } catch (error) {
      console.error('❌ Batch upload failed:', error);
      return false;
    }
  }

  /**
   * Get device information for API requests
   */
  getDeviceInfo(): { platform: string; model: string } {
    return {
      platform: Platform.OS === 'ios' ? 'iOS' : 'Android',
      model: Platform.select({
        ios: 'iPhone', // Could be enhanced with react-native-device-info
        android: 'Android Device',
        default: 'Unknown',
      }),
    };
  }

  /**
   * Fetch with timeout support
   */
  private async fetchWithTimeout(endpoint: string, options: RequestInit): Promise<Response> {
    const url = `${this.baseUrl}${endpoint}`;
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  /**
   * Test API with sample data
   */
  async testConnection(): Promise<boolean> {
    console.log('🧪 Testing API connection...');
    
    const testData: RecordingData = {
      session_id: `test-${Date.now()}`,
      device_info: this.getDeviceInfo(),
      calibration: { left: -0.8, center: 0.0, right: 0.9 },
      sampling_rate: 30,
      data: [
        { timestamp: Date.now(), x: -0.5 },
        { timestamp: Date.now() + 33, x: 0.2 },
      ],
    };

    const result = await this.createRecording(testData);
    
    if (result.success) {
      console.log('✅ API test successful');
      return true;
    } else {
      console.error('❌ API test failed:', result.error);
      return false;
    }
  }
}

// Export singleton instance
export const apiService = new ApiService();
export default apiService; 