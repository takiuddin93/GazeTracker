import NetInfo from '@react-native-community/netinfo';

export interface NetworkState {
  isConnected: boolean;
  isInternetReachable: boolean | null;
  type: string | null;
}

class NetworkService {
  private isOnline: boolean = true;
  private listeners: Array<(isOnline: boolean) => void> = [];
  private unsubscribe: (() => void) | null = null;

  constructor() {
    this.initialize();
  }

  /**
   * Initialize network monitoring
   */
  private initialize() {
    // Subscribe to network state changes
    this.unsubscribe = NetInfo.addEventListener(state => {
      const wasOnline = this.isOnline;
      this.isOnline = Boolean(state.isConnected && state.isInternetReachable);
      
      console.log('🌐 Network status:', {
        isConnected: state.isConnected,
        isInternetReachable: state.isInternetReachable,
        type: state.type,
        isOnline: this.isOnline,
      });

      // Notify listeners if status changed
      if (wasOnline !== this.isOnline) {
        this.notifyListeners();
      }
    });

    // Get initial network state
    NetInfo.fetch().then(state => {
      this.isOnline = Boolean(state.isConnected && state.isInternetReachable);
      console.log('🌐 Initial network status:', {
        isConnected: state.isConnected,
        isInternetReachable: state.isInternetReachable,
        type: state.type,
        isOnline: this.isOnline,
      });
    });
  }

  /**
   * Get current network status
   */
  getNetworkStatus(): boolean {
    return this.isOnline;
  }

  /**
   * Get detailed network information
   */
  async getDetailedNetworkInfo(): Promise<NetworkState> {
    const state = await NetInfo.fetch();
    return {
      isConnected: Boolean(state.isConnected),
      isInternetReachable: state.isInternetReachable,
      type: state.type,
    };
  }

  /**
   * Add listener for network status changes
   */
  addNetworkListener(listener: (isOnline: boolean) => void): () => void {
    this.listeners.push(listener);
    
    // Return unsubscribe function
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index > -1) {
        this.listeners.splice(index, 1);
      }
    };
  }

  /**
   * Notify all listeners of network status change
   */
  private notifyListeners() {
    this.listeners.forEach(listener => {
      try {
        listener(this.isOnline);
      } catch (error) {
        console.error('Error notifying network listener:', error);
      }
    });
  }

  /**
   * Check if device can reach a specific host
   */
  async canReachHost(host: string): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

      const response = await fetch(host, {
        method: 'HEAD',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      return response.ok;
    } catch (error) {
      console.warn('Host reachability check failed:', error);
      return false;
    }
  }

  /**
   * Wait for network connection
   */
  async waitForConnection(maxWaitTime: number = 30000): Promise<boolean> {
    if (this.isOnline) {
      return true;
    }

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        unsubscribe();
        resolve(false);
      }, maxWaitTime);

      const unsubscribe = this.addNetworkListener((isOnline) => {
        if (isOnline) {
          clearTimeout(timeout);
          unsubscribe();
          resolve(true);
        }
      });
    });
  }

  /**
   * Clean up resources
   */
  destroy() {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    this.listeners = [];
  }
}

// Export singleton instance
export const networkService = new NetworkService();
export default networkService; 