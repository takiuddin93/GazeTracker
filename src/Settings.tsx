import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import CalibrationService from './CalibrationService';

export default function Settings() {
  const [calibrationExists, setCalibrationExists] = useState(false);
  const [storageSize, setStorageSize] = useState('0 KB');
  const [calibrationInfo, setCalibrationInfo] = useState<any>(null);
  
  const calibrationService = CalibrationService.getInstance();

  useEffect(() => {
    checkCalibrationStatus();
    calculateStorageSize();
  }, []);

  const checkCalibrationStatus = async () => {
    try {
      await calibrationService.loadCalibration();
      const isCalibrated = calibrationService.isCalibrated();
      const info = calibrationService.getCalibrationInfo();
      
      setCalibrationExists(isCalibrated);
      setCalibrationInfo(info);
    } catch (error) {
      console.error('Failed to check calibration:', error);
    }
  };

  const calculateStorageSize = async () => {
    try {
      const keys = await AsyncStorage.getAllKeys();
      let totalSize = 0;
      
      for (const key of keys) {
        const value = await AsyncStorage.getItem(key);
        if (value) {
          totalSize += value.length;
        }
      }
      
      const sizeInKB = (totalSize / 1024).toFixed(2);
      setStorageSize(`${sizeInKB} KB`);
    } catch (error) {
      console.error('Failed to calculate storage:', error);
    }
  };

  const clearCalibration = () => {
    Alert.alert(
      'Clear Calibration',
      'Are you sure you want to clear the calibration data? You will need to recalibrate before recording.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            try {
              await calibrationService.clearCalibration();
              setCalibrationExists(false);
              setCalibrationInfo(null);
              Alert.alert('Success', 'Calibration data cleared.');
            } catch (error) {
              Alert.alert('Error', 'Failed to clear calibration data.');
            }
          },
        },
      ]
    );
  };

  const clearAllData = () => {
    Alert.alert(
      'Clear All Data',
      'This will clear all stored data including calibration. This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear All',
          style: 'destructive',
          onPress: async () => {
            try {
              await AsyncStorage.clear();
              setCalibrationExists(false);
              setStorageSize('0 KB');
              Alert.alert('Success', 'All data cleared.');
            } catch (error) {
              Alert.alert('Error', 'Failed to clear data.');
            }
          },
        },
      ]
    );
  };

  const showAbout = () => {
    Alert.alert(
      'About Gaze Tracker',
      'This app uses native TensorFlow Lite and BlazeFace models to track eye movements in real-time. It detects facial landmarks and calculates gaze direction based on iris position.\n\nFeatures:\n• Native Camera2/AVFoundation integration\n• Real-time face detection with confidence scoring\n• 30+ FPS processing\n• CPU-optimized inference\n\nFor best results:\n• Ensure good lighting\n• Keep your face visible to the camera\n• Complete calibration before recording',
      [{ text: 'OK' }]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>Settings</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Calibration</Text>
          <View style={styles.card}>
            <View style={styles.cardRow}>
              <Text style={styles.cardLabel}>Status</Text>
              <Text style={[styles.cardValue, calibrationExists ? styles.successText : styles.errorText]}>
                {calibrationExists ? 'Calibrated ✓' : 'Not Calibrated ⚠️'}
              </Text>
            </View>
            {calibrationExists && calibrationInfo?.transform && (
              <>
                <View style={styles.cardRow}>
                  <Text style={styles.cardLabel}>Linear Transform</Text>
                  <Text style={styles.cardValue}>
                    Slope: {calibrationInfo.transform.slope.toFixed(3)}
                  </Text>
                </View>
                <View style={styles.cardRow}>
                  <Text style={styles.cardLabel}>Intercept</Text>
                  <Text style={styles.cardValue}>
                    {calibrationInfo.transform.intercept.toFixed(3)}
                  </Text>
                </View>
                <View style={styles.cardRow}>
                  <Text style={styles.cardLabel}>Calibration Date</Text>
                  <Text style={styles.cardValue}>
                    {calibrationInfo.timestamp ? new Date(calibrationInfo.timestamp).toLocaleDateString() : 'Unknown'}
                  </Text>
                </View>
              </>
            )}
            {calibrationExists && (
              <TouchableOpacity style={styles.dangerButton} onPress={clearCalibration}>
                <Text style={styles.buttonText}>🗑️ Clear Calibration</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Data Management</Text>
          <View style={styles.card}>
            <View style={styles.cardRow}>
              <Text style={styles.cardLabel}>Storage Used</Text>
              <Text style={styles.cardValue}>{storageSize}</Text>
            </View>
            <TouchableOpacity style={styles.dangerButton} onPress={clearAllData}>
              <Text style={styles.buttonText}>🗑️ Clear All Data</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Information</Text>
          <View style={styles.card}>
            <TouchableOpacity style={styles.infoButton} onPress={showAbout}>
              <Text style={styles.infoButtonText}>ℹ️ About Gaze Tracker</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Technical Details</Text>
          <View style={styles.card}>
            <View style={styles.cardRow}>
              <Text style={styles.cardLabel}>ML Framework</Text>
              <Text style={styles.cardValue}>TensorFlow Lite 2.14.0</Text>
            </View>
            <View style={styles.cardRow}>
              <Text style={styles.cardLabel}>Face Detection</Text>
              <Text style={styles.cardValue}>BlazeFace (229KB)</Text>
            </View>
            <View style={styles.cardRow}>
              <Text style={styles.cardLabel}>Camera API</Text>
              <Text style={styles.cardValue}>Camera2 / AVFoundation</Text>
            </View>
            <View style={styles.cardRow}>
              <Text style={styles.cardLabel}>Processing</Text>
              <Text style={styles.cardValue}>30+ FPS Real-time</Text>
            </View>
            <View style={styles.cardRow}>
              <Text style={styles.cardLabel}>Inference</Text>
              <Text style={styles.cardValue}>CPU Optimized</Text>
            </View>
            <View style={styles.cardRow}>
              <Text style={styles.cardLabel}>Eye Detection</Text>
              <Text style={styles.cardValue}>Confidence Scoring</Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  content: {
    padding: 16,
  },
  header: {
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1f2937',
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 12,
  },
  card: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  cardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  cardLabel: {
    fontSize: 16,
    color: '#374151',
  },
  cardValue: {
    fontSize: 16,
    fontWeight: '500',
    color: '#6b7280',
  },
  successText: {
    color: '#10b981',
  },
  errorText: {
    color: '#ef4444',
  },
  dangerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#ef4444',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginTop: 8,
  },
  infoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  infoButtonText: {
    color: '#2563EB',
    fontSize: 16,
    fontWeight: '500',
  },
}); 