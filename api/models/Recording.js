const mongoose = require('mongoose');

// Schema for individual gaze data points
const gazeDataSchema = new mongoose.Schema({
  timestamp: {
    type: Number,
    required: true,
    index: true
  },
  x: {
    type: Number,
    required: true,
    min: -1,
    max: 1
  }
}, { _id: false });

// Schema for device information
const deviceInfoSchema = new mongoose.Schema({
  platform: {
    type: String,
    required: true,
    enum: ['Android', 'iOS', 'Web'],
    default: 'Android'
  },
  model: {
    type: String,
    required: true,
    default: 'Unknown'
  }
}, { _id: false });

// Schema for calibration data
const calibrationSchema = new mongoose.Schema({
  left: {
    type: Number,
    required: true
  },
  center: {
    type: Number,
    required: true
  },
  right: {
    type: Number,
    required: true
  }
}, { _id: false });

// Main recording schema
const recordingSchema = new mongoose.Schema({
  session_id: {
    type: String,
    required: true,
    unique: true,
    index: true,
    trim: true
  },
  device_info: {
    type: deviceInfoSchema,
    required: true
  },
  calibration: {
    type: calibrationSchema,
    required: true
  },
  sampling_rate: {
    type: Number,
    required: true,
    min: 1,
    max: 120,
    default: 30
  },
  data: {
    type: [gazeDataSchema],
    required: true,
    validate: {
      validator: function(data) {
        return data.length > 0;
      },
      message: 'Recording must contain at least one data point'
    }
  },
  // Additional metadata
  metadata: {
    duration: {
      type: Number, // in milliseconds
      min: 0
    },
    frame_count: {
      type: Number,
      min: 0
    },
    start_timestamp: {
      type: Number
    },
    end_timestamp: {
      type: Number
    }
  },
  // Timestamps
  created_at: {
    type: Date,
    default: Date.now,
    index: true
  },
  updated_at: {
    type: Date,
    default: Date.now
  }
});

// Pre-save middleware to calculate metadata
recordingSchema.pre('save', function(next) {
  // Update the updated_at timestamp
  this.updated_at = new Date();
  
  // Calculate metadata from data
  if (this.data && this.data.length > 0) {
    const timestamps = this.data.map(d => d.timestamp);
    const startTime = Math.min(...timestamps);
    const endTime = Math.max(...timestamps);
    
    this.metadata = {
      frame_count: this.data.length,
      start_timestamp: startTime,
      end_timestamp: endTime,
      duration: endTime - startTime
    };
  }
  
  next();
});

// Instance methods
recordingSchema.methods.toJSON = function() {
  const obj = this.toObject();
  delete obj.__v;
  return obj;
};

recordingSchema.methods.getStats = function() {
  return {
    session_id: this.session_id,
    device: `${this.device_info.platform} ${this.device_info.model}`,
    duration: this.metadata.duration,
    frame_count: this.metadata.frame_count,
    sampling_rate: this.sampling_rate,
    created_at: this.created_at
  };
};

// Static methods
recordingSchema.statics.findBySessionId = function(sessionId) {
  return this.findOne({ session_id: sessionId });
};

recordingSchema.statics.getRecentRecordings = function(limit = 10) {
  return this.find({})
    .sort({ created_at: -1 })
    .limit(limit)
    .select('session_id device_info sampling_rate metadata created_at');
};

// Indexes for performance
recordingSchema.index({ session_id: 1 });
recordingSchema.index({ created_at: -1 });
recordingSchema.index({ 'device_info.platform': 1 });
recordingSchema.index({ sampling_rate: 1 });

const Recording = mongoose.model('Recording', recordingSchema);

module.exports = Recording; 