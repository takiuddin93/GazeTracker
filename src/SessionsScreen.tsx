import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ScrollView,
  SafeAreaView,
  Share,
} from 'react-native';
import SessionManager, { SessionSummary } from './SessionManager';

interface SessionsScreenProps {
  onClose: () => void;
}

export default function SessionsScreen({ onClose }: SessionsScreenProps) {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const sessionManager = SessionManager.getInstance();

  useEffect(() => {
    loadSessions();
  }, []);

  const loadSessions = async () => {
    try {
      setLoading(true);
      const sessionList = await sessionManager.getAllSessions();
      setSessions(sessionList);
    } catch (error) {
      console.error('Failed to load sessions:', error);
      Alert.alert('Error', 'Failed to load sessions');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteSession = (sessionId: string) => {
    Alert.alert(
      'Delete Session',
      'Are you sure you want to delete this session? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await sessionManager.deleteSession(sessionId);
              await loadSessions(); // Refresh list
              Alert.alert('Success', 'Session deleted successfully');
            } catch (error) {
              Alert.alert('Error', 'Failed to delete session');
            }
          },
        },
      ]
    );
  };

  const handleExportSession = async (sessionId: string) => {
    try {
      const sessionData = await sessionManager.getSessionDataForAPI(sessionId);
      if (!sessionData) {
        Alert.alert('Error', 'Session data not found');
        return;
      }

      const jsonString = JSON.stringify(sessionData, null, 2);
      
      // Use React Native Share API
      await Share.share({
        message: jsonString,
        title: `Gaze Session ${sessionId.substring(0, 8)}`,
      });
    } catch (error) {
      console.error('Failed to export session:', error);
      Alert.alert('Error', 'Failed to export session data');
    }
  };

  const handleClearAllSessions = () => {
    Alert.alert(
      'Clear All Sessions',
      'Are you sure you want to delete all recorded sessions? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear All',
          style: 'destructive',
          onPress: async () => {
            try {
              await sessionManager.clearAllSessions();
              await loadSessions(); // Refresh list
              Alert.alert('Success', 'All sessions cleared');
            } catch (error) {
              Alert.alert('Error', 'Failed to clear sessions');
            }
          },
        },
      ]
    );
  };

  const formatDuration = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return '#34C759';
      case 'recording': return '#FF3B30';
      case 'paused': return '#FF9500';
      default: return '#8E8E93';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed': return '✅';
      case 'recording': return '🔴';
      case 'paused': return '⏸️';
      default: return '❓';
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={onClose}>
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Sessions</Text>
        <TouchableOpacity style={styles.clearButton} onPress={handleClearAllSessions}>
          <Text style={styles.clearButtonText}>Clear All</Text>
        </TouchableOpacity>
      </View>

      {/* Sessions List */}
      <ScrollView style={styles.sessionsList} contentContainerStyle={styles.sessionsContent}>
        {loading ? (
          <View style={styles.centerContainer}>
            <Text style={styles.loadingText}>Loading sessions...</Text>
          </View>
        ) : sessions.length === 0 ? (
          <View style={styles.centerContainer}>
            <Text style={styles.emptyText}>🎯</Text>
            <Text style={styles.emptyTitle}>No Sessions Recorded</Text>
            <Text style={styles.emptySubtitle}>
              Start recording a session from the tracker to see your gaze data here.
            </Text>
          </View>
        ) : (
          sessions.map((session) => (
            <View key={session.session_id} style={styles.sessionCard}>
              {/* Session Header */}
              <View style={styles.sessionHeader}>
                <View style={styles.sessionInfo}>
                  <Text style={styles.sessionId}>
                    Session {session.session_id.substring(0, 8)}...
                  </Text>
                  <Text style={styles.sessionDate}>
                    {formatDate(session.created_at)}
                  </Text>
                </View>
                <View style={styles.sessionStatus}>
                  <Text style={[styles.statusText, { color: getStatusColor(session.status) }]}>
                    {getStatusIcon(session.status)} {session.status.toUpperCase()}
                  </Text>
                </View>
              </View>

              {/* Session Stats */}
              <View style={styles.sessionStats}>
                <View style={styles.statItem}>
                  <Text style={styles.statLabel}>Duration</Text>
                  <Text style={styles.statValue}>{formatDuration(session.duration)}</Text>
                </View>
                <View style={styles.statItem}>
                  <Text style={styles.statLabel}>Frames</Text>
                  <Text style={styles.statValue}>{session.total_frames.toLocaleString()}</Text>
                </View>
                <View style={styles.statItem}>
                  <Text style={styles.statLabel}>Calibrated</Text>
                  <Text style={styles.statValue}>
                    {session.calibration_used ? '✅ Yes' : '❌ No'}
                  </Text>
                </View>
              </View>

              {/* Session Actions */}
              <View style={styles.sessionActions}>
                <TouchableOpacity
                  style={[styles.actionButton, styles.exportButton]}
                  onPress={() => handleExportSession(session.session_id)}
                >
                  <Text style={styles.actionButtonText}>📤 Export</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionButton, styles.deleteButton]}
                  onPress={() => handleDeleteSession(session.session_id)}
                >
                  <Text style={styles.actionButtonText}>🗑️ Delete</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}
      </ScrollView>

      {/* Summary Footer */}
      {sessions.length > 0 && (
        <View style={styles.footer}>
          <Text style={styles.summaryText}>
            📊 {sessions.length} session{sessions.length !== 1 ? 's' : ''} • 
            {' '}{sessions.reduce((sum, s) => sum + s.total_frames, 0).toLocaleString()} total frames
          </Text>
        </View>
      )}
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
    backgroundColor: 'white',
  },
  backButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  backButtonText: {
    color: '#007AFF',
    fontSize: 16,
    fontWeight: '500',
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1f2937',
  },
  clearButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  clearButtonText: {
    color: '#ef4444',
    fontSize: 16,
    fontWeight: '500',
  },
  sessionsList: {
    flex: 1,
  },
  sessionsContent: {
    padding: 20,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 100,
  },
  loadingText: {
    fontSize: 16,
    color: '#6b7280',
  },
  emptyText: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 16,
    color: '#6b7280',
    textAlign: 'center',
    paddingHorizontal: 40,
  },
  sessionCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  sessionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  sessionInfo: {
    flex: 1,
  },
  sessionId: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 4,
  },
  sessionDate: {
    fontSize: 14,
    color: '#6b7280',
  },
  sessionStatus: {
    alignItems: 'flex-end',
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  sessionStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  statItem: {
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 4,
  },
  statValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1f2937',
  },
  sessionActions: {
    flexDirection: 'row',
    gap: 12,
  },
  actionButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  exportButton: {
    backgroundColor: '#007AFF',
  },
  deleteButton: {
    backgroundColor: '#ef4444',
  },
  actionButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
  footer: {
    backgroundColor: 'white',
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  summaryText: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
  },
}); 