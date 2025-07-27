# 👁️ GazeTracker

A real-time eye tracking application built with React Native and TensorFlow Lite, featuring advanced gaze estimation, calibration, and cloud synchronization capabilities.

![Platform](https://img.shields.io/badge/platform-Android-green)
![React Native](https://img.shields.io/badge/React%20Native-0.75-blue)
![TensorFlow Lite](https://img.shields.io/badge/TensorFlow%20Lite-2.14.0-orange)
![MongoDB](https://img.shields.io/badge/MongoDB-Atlas-green)

## 🎯 **Features**

### 📱 **Mobile App (React Native)**
- **🎥 Real-time Camera Feed**: High-performance native camera integration using Android Camera2 API
- **👁️ Eye Detection**: TensorFlow Lite with BlazeFace model for accurate eye/iris detection
- **🎯 Gaze Estimation**: Horizontal gaze tracking with normalized coordinates
- **⚖️ 3-Point Calibration**: Linear regression-based calibration system (Look Left/Center/Right)
- **📹 Session Recording**: Start/stop/pause recording with unique session IDs
- **☁️ Real-time Cloud Sync**: Automatic data upload during recording
- **📱 Offline Support**: Local storage fallback when network unavailable
- **📊 Live Statistics**: FPS, frame count, confidence, and sync status

### 🔌 **Backend API (Node.js/Express)**
- **🗄️ MongoDB Integration**: Persistent storage with Mongoose ODM
- **🔐 Production Security**: Helmet, CORS, rate limiting, compression
- **📊 RESTful Endpoints**: Complete CRUD operations for recordings
- **✅ Data Validation**: Express-validator for input sanitization
- **📈 Analytics**: Session statistics and metadata tracking

## 🏗️ **Architecture Overview**

```
┌─────────────────────────────────────────────────────────────┐
│                    GazeTracker App                          │
├─────────────────────────────────────────────────────────────┤
│  React Native Frontend (TypeScript)                        │
│  ├── App.tsx (Main UI & Navigation)                        │
│  ├── CameraViewComponent (Live Preview)                    │
│  ├── CalibrationScreen (3-Point Calibration)               │
│  ├── SessionsScreen (Session Management)                   │
│  └── Settings (Configuration & Status)                     │
├─────────────────────────────────────────────────────────────┤
│  Services & Managers                                       │
│  ├── SessionManager (Recording & Local Storage)            │
│  ├── CalibrationService (Gaze Calibration)                 │
│  ├── ApiService (Backend Communication)                    │
│  └── NetworkService (Connectivity Monitoring)              │
├─────────────────────────────────────────────────────────────┤
│  Native Android Modules (Kotlin)                          │
│  ├── CameraModule (Camera2 API Integration)                │
│  └── TensorFlowProcessor (ML Inference)                    │
│      ├── BlazeFace Model (Face/Eye Detection)              │
│      ├── Iris Detection (Image Processing)                 │
│      └── Gaze Calculation (Normalization)                  │
├─────────────────────────────────────────────────────────────┤
│  Backend API (Node.js/Express)                            │
│  ├── server.js (Express Server)                            │
│  ├── models/Recording.js (MongoDB Schema)                  │
│  └── routes/recordings.js (API Endpoints)                  │
├─────────────────────────────────────────────────────────────┤
│  Database (MongoDB Atlas)                                  │
│  └── Recordings Collection (Gaze Data Storage)             │
└─────────────────────────────────────────────────────────────┘
```

## 📋 **Prerequisites**

### **Development Environment**
- **Node.js**: v18+ and npm
- **Android Studio**: Latest version with Android SDK
- **Java**: JDK 17+ 
- **React Native CLI**: `npm install -g @react-native-community/cli`
- **MongoDB Atlas**: Account for cloud database

### **Hardware Requirements**
- **Android Device**: API 24+ (Android 7.0) with front-facing camera
- **USB Cable**: For device connection and debugging
- **Development Machine**: macOS, Windows, or Linux

## 🚀 **Setup Instructions**

### **1. Clone the Repository**
```bash
git clone <repository-url>
cd GazeTracker
```

### **2. Install Dependencies**
```bash
# Install React Native dependencies
npm install

# Install additional packages
npm install @react-native-community/netinfo
```

### **3. Download TensorFlow Lite Model**
```bash
# Create assets directory
mkdir -p android/app/src/main/assets

# Download BlazeFace model (or copy your own)
# Place face_detection.tflite in android/app/src/main/assets/
```

### **4. Android Setup**
```bash
# Clean and prepare Android build
cd android
./gradlew clean
cd ..

# Check Android connection
adb devices
```

### **5. Backend API Setup**
```bash
# Navigate to API directory
cd api

# Install backend dependencies
npm install

# Configure environment variables
cp .env.example .env
# Edit .env with your MongoDB Atlas credentials
```

#### **Environment Configuration (.env)**
```env
PORT=3000
NODE_ENV=development
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/gazetracker
ALLOWED_ORIGINS=http://localhost:8081,http://10.0.2.2:8081
```

### **6. MongoDB Atlas Setup**
1. **Create Account**: Sign up at [MongoDB Atlas](https://www.mongodb.com/atlas)
2. **Create Cluster**: Set up a free tier cluster
3. **Database Access**: Create database user with read/write permissions
4. **Network Access**: Add your IP address (or 0.0.0.0/0 for development)
5. **Connection String**: Copy URI and update `.env` file

## 🔨 **Build & Run**

### **1. Start Backend API**
```bash
# In api/ directory
npm run dev
# or
node server.js

# Verify API is running
curl http://localhost:3000/health
```

### **2. Start React Native Metro**
```bash
# In project root
npx react-native start
```

### **3. Build & Deploy to Android**
```bash
# In new terminal (project root)
npx react-native run-android

# Or manually build
cd android
./gradlew assembleDebug
cd ..
adb install android/app/build/outputs/apk/debug/app-debug.apk
```

### **4. Development Debugging**
```bash
# View Android logs
adb logcat | grep -E "(TensorFlow|CameraModule|GazeTracker)"

# React Native debugger
npx react-native log-android
```

## 📱 **Usage Guide**

### **App Navigation**
- **🎯 Tracker Tab**: Main camera view and recording controls
- **⚙️ Settings Tab**: Configuration and system status
- **📐 Calibration Tab**: 3-point gaze calibration process
- **📊 Sessions Tab**: View, export, and manage recordings

### **Recording Workflow**
1. **📐 Calibrate First**: Complete 3-point calibration for accuracy
2. **📹 Start Recording**: Tap "Start Session" to begin
3. **👁️ Track Gaze**: Look normally while system records
4. **⏸️ Pause/Resume**: Control recording as needed
5. **⏹️ Stop & Sync**: Data automatically syncs to cloud

### **Calibration Process**
1. **Position**: Hold device 50-70cm from face
2. **Follow Prompts**: Look at left/center/right targets
3. **Stay Still**: Collect 15 frames per position
4. **Validation**: System calculates linear transform
5. **Completion**: Calibration saved for future sessions

## 🔧 **Configuration**

### **TensorFlow Lite Settings**
```kotlin
// In TensorFlowProcessor.kt
private val INPUT_SIZE = 128          // BlazeFace input resolution
private val CONFIDENCE_THRESHOLD = 0.3f // Eye detection threshold
private val MAX_MOVEMENT = 0.5f       // Iris tracking sensitivity
```

### **Session Recording Settings**
```typescript
// In SessionManager.ts
private uploadBatchSize = 50;         // Cloud sync batch size
private uploadInterval = 2000;        // Sync frequency (ms)
```

### **API Configuration**
```typescript
// In ApiService.ts
const API_CONFIG = {
  BASE_URL: 'http://localhost:3000/api',
  TIMEOUT: 10000,                     // Request timeout
  BATCH_SIZE: 50,                     // Upload batch size
};
```

## 📊 **API Documentation**

### **Endpoints**

#### **Health Check**
```http
GET /health
Response: {"status": "healthy", "database": "connected"}
```

#### **Create Recording**
```http
POST /api/recordings
Content-Type: application/json

{
  "session_id": "uuid-string",
  "device_info": {
    "platform": "Android",
    "model": "Device Name"
  },
  "calibration": {
    "left": -0.85,
    "center": 0.01,
    "right": 0.90
  },
  "sampling_rate": 30,
  "data": [
    {"timestamp": 1234567890, "x": -0.41},
    {"timestamp": 1234567891, "x": -0.38}
  ]
}
```

#### **Get Recording**
```http
GET /api/recordings/:sessionId
Response: Recording data with metadata
```

#### **List Recordings**
```http
GET /api/recordings?limit=10&offset=0
Response: Array of recording summaries
```

## 🧪 **Testing**

### **Manual Testing Checklist**
- [ ] **Camera Permission**: App requests camera access
- [ ] **Eye Detection**: Confidence shows ~0.85 with face visible
- [ ] **Gaze Tracking**: Normalized gaze values change with eye movement
- [ ] **Calibration**: Successfully completes 3-point calibration
- [ ] **Recording**: Start/pause/stop functionality works
- [ ] **Cloud Sync**: Data uploads to MongoDB during recording
- [ ] **Offline Mode**: Continues recording without network
- [ ] **Session Export**: Local JSON export functionality

### **API Testing**
```bash
# Test API endpoints
curl -X GET http://localhost:3000/health
curl -X GET http://localhost:3000/api/recordings

# Test with sample data
curl -X POST http://localhost:3000/api/recordings \
  -H "Content-Type: application/json" \
  -d '{"session_id":"test-123","device_info":{"platform":"Android","model":"Test"},"calibration":{"left":-0.8,"center":0.0,"right":0.9},"sampling_rate":30,"data":[{"timestamp":1234567890,"x":-0.5}]}'
```

## 🐛 **Troubleshooting**

### **Common Issues**

#### **App Crashes on Startup**
```bash
# Check TensorFlow Lite model
ls -la android/app/src/main/assets/face_detection.tflite

# View crash logs
adb logcat | grep -E "(FATAL|AndroidRuntime)"
```

#### **Eye Confidence Always 0.00**
- Ensure face_detection.tflite is in assets folder
- Check camera permissions granted
- Verify adequate lighting conditions
- Restart camera if model not loaded

#### **Cloud Sync Not Working**
```bash
# Check API server
curl http://localhost:3000/health

# Verify network connectivity
adb shell ping google.com

# Check environment variables
cat api/.env
```

#### **Calibration Fails (NaN Values)**
- Ensure eye detection is working (confidence > 0.3)
- Complete all 3 calibration positions
- Check for sufficient eye movement variation
- Restart app if needed

### **Performance Optimization**
- **Memory Usage**: Monitor with Android Studio Profiler
- **CPU Usage**: TensorFlow Lite runs on CPU for stability
- **Battery**: Background processing minimized
- **Network**: Batch uploads reduce API calls

## 📈 **Data Formats**

### **Session Data Point**
```typescript
{
  session_id: string;
  timestamp: number;           // Unix timestamp
  high_res_timestamp: number;  // High precision timestamp
  gaze_raw: number;           // Raw normalized gaze [-1, 1]
  gaze_calibrated?: number;   // Calibrated gaze value
  iris_position: {x: number, y: number};
  eye_corners: {left_x: number, right_x: number};
  confidence: number;         // Eye detection confidence [0, 1]
  frame_number: number;
}
```

### **Calibration Transform**
```typescript
{
  slope: number;      // Linear regression slope
  intercept: number;  // Linear regression intercept
  r_squared: number;  // Goodness of fit
  created_at: string; // ISO timestamp
}
```

## 🛡️ **Security Considerations**

- **API Rate Limiting**: 100 requests per 15 minutes
- **Input Validation**: All API inputs validated and sanitized
- **CORS Protection**: Configured for React Native origins
- **Helmet Security**: HTTP security headers enabled
- **Environment Variables**: Sensitive data in .env files
- **Local Storage**: AsyncStorage for offline data protection

## 🚀 **Deployment**

### **Production Build**
```bash
# Android release build
cd android
./gradlew assembleRelease

# API production deployment
cd api
npm run build  # If build script exists
NODE_ENV=production node server.js
```

### **Cloud Deployment Options**
- **API**: Heroku, AWS, Google Cloud, DigitalOcean
- **Database**: MongoDB Atlas (already cloud-hosted)
- **Mobile**: Google Play Store, F-Droid

## 🤝 **Contributing**

1. **Fork** the repository
2. **Create** feature branch (`git checkout -b feature/amazing-feature`)
3. **Commit** changes (`git commit -m 'Add amazing feature'`)
4. **Push** to branch (`git push origin feature/amazing-feature`)
5. **Open** Pull Request

## 📄 **License**

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 **Acknowledgments**

- **TensorFlow Lite**: Machine learning inference
- **BlazeFace**: Google's face detection model
- **React Native**: Cross-platform mobile framework
- **MongoDB**: NoSQL database platform
- **React Native Community**: NetInfo package

## 📞 **Support**

For issues and questions:
1. **Check Troubleshooting** section above
2. **Review Logs**: Use `adb logcat` for Android debugging
3. **API Status**: Verify backend health endpoint
4. **Create Issue**: Submit detailed bug reports

---

**Built with ❤️ for accurate real-time gaze tracking**
