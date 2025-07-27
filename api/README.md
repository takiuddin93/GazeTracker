# Gaze Tracker API 🎯

Backend API for storing and retrieving gaze tracking data from the React Native Gaze Tracker app.

## Features ✨

- **MongoDB Storage** - Secure and scalable data storage
- **RESTful API** - Clean and intuitive endpoints
- **Data Validation** - Comprehensive input validation and error handling
- **Performance Optimized** - Indexes and efficient queries
- **Security** - Rate limiting, CORS protection, and input sanitization

## Quick Start 🚀

### Prerequisites

- **Node.js** 18+ 
- **MongoDB** (local or Atlas cloud)
- **npm** or **yarn**

### Installation

1. **Navigate to API directory**
```bash
cd api
```

2. **Install dependencies**
```bash
npm install
```

3. **Set up environment**
```bash
cp env.example .env
# Edit .env with your MongoDB connection string
```

4. **Start MongoDB** (if running locally)
```bash
# macOS (Homebrew)
brew services start mongodb-community

# Ubuntu/Debian
sudo systemctl start mongod

# Windows
net start MongoDB
```

5. **Start the server**
```bash
# Development (with auto-reload)
npm run dev

# Production
npm start
```

## API Endpoints 📡

### Base URL
```
http://localhost:3000/api
```

### 1. Create Recording
**`POST /recordings`**

Store a new gaze tracking session.

**Request Body:**
```json
{
  "session_id": "e9bf7046-b15e-45a1-8cec-ad5d23acb213",
  "device_info": {
    "platform": "Android",
    "model": "Samsung Galaxy S23"
  },
  "calibration": {
    "left": -0.85,
    "center": 0.01,
    "right": 0.90
  },
  "sampling_rate": 30,
  "data": [
    { "timestamp": 1723450001234, "x": -0.41 },
    { "timestamp": 1723450001267, "x": -0.38 },
    { "timestamp": 1723450001300, "x": -0.36 }
  ]
}
```

**Response (201 Created):**
```json
{
  "success": true,
  "message": "Recording created successfully",
  "data": {
    "id": "647a1b5c8f123456789",
    "session_id": "e9bf7046-b15e-45a1-8cec-ad5d23acb213",
    "frame_count": 287,
    "duration": 9567,
    "created_at": "2024-12-07T15:30:45.123Z"
  }
}
```

### 2. Get Recording
**`GET /recordings/:id`**

Retrieve a specific recording by session ID.

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "session_id": "e9bf7046-b15e-45a1-8cec-ad5d23acb213",
    "device_info": {
      "platform": "Android",
      "model": "Samsung Galaxy S23"
    },
    "calibration": {
      "left": -0.85,
      "center": 0.01,
      "right": 0.90
    },
    "sampling_rate": 30,
    "data": [
      { "timestamp": 1723450001234, "x": -0.41 },
      { "timestamp": 1723450001267, "x": -0.38 }
    ],
    "metadata": {
      "frame_count": 287,
      "duration": 9567,
      "start_timestamp": 1723450001234,
      "end_timestamp": 1723450010801
    },
    "created_at": "2024-12-07T15:30:45.123Z",
    "updated_at": "2024-12-07T15:30:45.123Z"
  }
}
```

### Bonus Endpoints 🎁

#### List Recent Recordings
**`GET /recordings?limit=10`**

#### Get Recording Statistics  
**`GET /recordings/:id/stats`**

#### Health Check
**`GET /health`**

## Usage Examples 💡

### Using cURL

**Create a recording:**
```bash
curl -X POST http://localhost:3000/api/recordings \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "test-session-123",
    "device_info": {
      "platform": "Android",
      "model": "Test Device"
    },
    "calibration": {
      "left": -0.8,
      "center": 0.0,
      "right": 0.9
    },
    "sampling_rate": 30,
    "data": [
      {"timestamp": 1640995200000, "x": -0.5},
      {"timestamp": 1640995200033, "x": -0.3},
      {"timestamp": 1640995200066, "x": 0.1}
    ]
  }'
```

**Get a recording:**
```bash
curl http://localhost:3000/api/recordings/test-session-123
```

### Using JavaScript/Fetch

```javascript
// Create recording
const response = await fetch('http://localhost:3000/api/recordings', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify(recordingData)
});

const result = await response.json();
console.log('Recording created:', result);

// Get recording
const getResponse = await fetch(`http://localhost:3000/api/recordings/${sessionId}`);
const recording = await getResponse.json();
console.log('Recording data:', recording);
```

## Database Schema 🗄️

### Recording Document
```javascript
{
  session_id: String,     // Unique session identifier
  device_info: {
    platform: String,    // Android, iOS, Web
    model: String        // Device model name
  },
  calibration: {
    left: Number,        // Left calibration point (-2 to 2)
    center: Number,      // Center calibration point (-2 to 2) 
    right: Number        // Right calibration point (-2 to 2)
  },
  sampling_rate: Number, // Hz (1-120)
  data: [{
    timestamp: Number,   // Unix timestamp in ms
    x: Number           // Gaze X coordinate (-1 to 1)
  }],
  metadata: {
    frame_count: Number,
    duration: Number,     // Total duration in ms
    start_timestamp: Number,
    end_timestamp: Number
  },
  created_at: Date,
  updated_at: Date
}
```

## Error Handling ⚠️

The API returns consistent error responses:

```json
{
  "error": "Error Type",
  "message": "Human readable error message",
  "details": ["Additional error details"]
}
```

**Common HTTP Status Codes:**
- `200` - Success
- `201` - Created
- `400` - Bad Request (validation error)
- `404` - Not Found
- `409` - Conflict (duplicate session)
- `429` - Too Many Requests (rate limited)
- `500` - Internal Server Error

## Environment Variables 🔧

Create a `.env` file from `env.example`:

```bash
# Required
MONGODB_URI=mongodb://localhost:27017/gaze-tracker
PORT=3000

# Optional
NODE_ENV=development
ALLOWED_ORIGINS=http://localhost:8081
```

## Development 🛠️

### Project Structure
```
api/
├── models/
│   └── Recording.js      # MongoDB schema
├── routes/
│   └── recordings.js     # API endpoints
├── package.json
├── server.js            # Express app setup
├── env.example          # Environment template
└── README.md
```

### Scripts
```bash
npm run dev      # Development with auto-reload
npm start        # Production server
npm test         # Run tests (TBD)
```

### MongoDB Connection

**Local MongoDB:**
```
mongodb://localhost:27017/gaze-tracker
```

**MongoDB Atlas (Cloud):**
```
mongodb+srv://username:password@cluster.mongodb.net/gaze-tracker
```

## Integration with React Native App 📱

The React Native app exports sessions in the exact API format:

1. **Record session** in the app
2. **Export session** - generates JSON in API format
3. **POST to API** - send data to backend
4. **Retrieve later** - GET from API for analysis

## Performance & Scaling 📈

### Database Indexes
- `session_id` (unique)
- `created_at` (for time-based queries)
- `device_info.platform` (for filtering)

### Rate Limiting
- 100 requests per 15 minutes per IP
- Configurable via environment

### Data Limits
- Max 10MB request size
- Gaze values validated (-1 to 1)
- Sampling rate limits (1-120 Hz)

## Security 🔒

- **Helmet.js** - Security headers
- **CORS** - Cross-origin protection  
- **Rate Limiting** - DDoS protection
- **Input Validation** - Sanitized inputs
- **Error Handling** - No sensitive data leaks

## Future Enhancements 🚀

- [ ] **Authentication** - JWT-based auth
- [ ] **File Upload** - Direct JSON file upload
- [ ] **Analytics** - Built-in gaze analysis
- [ ] **Real-time** - WebSocket streaming
- [ ] **Export** - CSV/Excel export formats

---

**🎯 Ready to track some gazes!** Start the server and begin storing your gaze tracking data! 