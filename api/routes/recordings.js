const express = require('express');
const { body, param, validationResult } = require('express-validator');
const Recording = require('../models/Recording');

const router = express.Router();

// Validation middleware
const validateRecording = [
  body('session_id')
    .isString()
    .isLength({ min: 1, max: 100 })
    .trim()
    .withMessage('session_id must be a non-empty string (max 100 chars)'),
  
  body('device_info.platform')
    .isIn(['Android', 'iOS', 'Web'])
    .withMessage('platform must be Android, iOS, or Web'),
  
  body('device_info.model')
    .isString()
    .isLength({ min: 1, max: 100 })
    .trim()
    .withMessage('model must be a non-empty string (max 100 chars)'),
  
  body('calibration.left')
    .isFloat({ min: -2, max: 2 })
    .withMessage('calibration.left must be a number between -2 and 2'),
  
  body('calibration.center')
    .isFloat({ min: -2, max: 2 })
    .withMessage('calibration.center must be a number between -2 and 2'),
  
  body('calibration.right')
    .isFloat({ min: -2, max: 2 })
    .withMessage('calibration.right must be a number between -2 and 2'),
  
  body('sampling_rate')
    .isFloat({ min: 1, max: 120 })
    .withMessage('sampling_rate must be between 1 and 120'),
  
  body('data')
    .isArray({ min: 1 })
    .withMessage('data must be a non-empty array'),
  
  body('data.*.timestamp')
    .isInt({ min: 0 })
    .withMessage('Each data point must have a valid timestamp'),
  
  body('data.*.x')
    .isFloat({ min: -1, max: 1 })
    .withMessage('Each data point x value must be between -1 and 1')
];

const validateSessionId = [
  param('id')
    .isString()
    .isLength({ min: 1, max: 100 })
    .trim()
    .withMessage('session_id must be a valid string')
];

// Helper function to check validation errors
const checkValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Validation failed',
      message: 'Invalid input data',
      details: errors.array()
    });
  }
  next();
};

/**
 * POST /api/recordings
 * Create a new gaze tracking recording
 */
router.post('/', validateRecording, checkValidationErrors, async (req, res) => {
  try {
    const { session_id, device_info, calibration, sampling_rate, data } = req.body;
    
    // Check if session already exists
    const existingRecording = await Recording.findBySessionId(session_id);
    if (existingRecording) {
      return res.status(409).json({
        error: 'Session already exists',
        message: `Recording with session_id '${session_id}' already exists`,
        existing_id: existingRecording._id
      });
    }
    
    // Validate data consistency
    if (data.length === 0) {
      return res.status(400).json({
        error: 'Invalid data',
        message: 'Recording must contain at least one data point'
      });
    }
    
    // Sort data by timestamp to ensure chronological order
    const sortedData = data.sort((a, b) => a.timestamp - b.timestamp);
    
    // Create new recording
    const recording = new Recording({
      session_id,
      device_info,
      calibration,
      sampling_rate,
      data: sortedData
    });
    
    // Save to database
    const savedRecording = await recording.save();
    
    console.log(`✅ New recording created: ${session_id} (${data.length} data points)`);
    
    res.status(201).json({
      success: true,
      message: 'Recording created successfully',
      data: {
        id: savedRecording._id,
        session_id: savedRecording.session_id,
        frame_count: savedRecording.metadata.frame_count,
        duration: savedRecording.metadata.duration,
        created_at: savedRecording.created_at
      }
    });
    
  } catch (error) {
    console.error('Error creating recording:', error);
    
    if (error.code === 11000) {
      // Duplicate key error
      return res.status(409).json({
        error: 'Duplicate session',
        message: 'A recording with this session_id already exists'
      });
    }
    
    res.status(500).json({
      error: 'Database error',
      message: 'Failed to create recording',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * GET /api/recordings/:id
 * Retrieve a gaze tracking recording by session_id
 */
router.get('/:id', validateSessionId, checkValidationErrors, async (req, res) => {
  try {
    const sessionId = req.params.id;
    
    console.log(`🔍 Fetching recording: ${sessionId}`);
    
    // Find recording by session_id
    const recording = await Recording.findBySessionId(sessionId);
    
    if (!recording) {
      return res.status(404).json({
        error: 'Recording not found',
        message: `No recording found with session_id '${sessionId}'`
      });
    }
    
    // Return the recording in the API format
    const response = {
      session_id: recording.session_id,
      device_info: recording.device_info,
      calibration: recording.calibration,
      sampling_rate: recording.sampling_rate,
      data: recording.data,
      metadata: recording.metadata,
      created_at: recording.created_at,
      updated_at: recording.updated_at
    };
    
    console.log(`✅ Recording found: ${sessionId} (${recording.data.length} data points)`);
    
    res.json({
      success: true,
      data: response
    });
    
  } catch (error) {
    console.error('Error fetching recording:', error);
    
    res.status(500).json({
      error: 'Database error',
      message: 'Failed to retrieve recording',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * GET /api/recordings
 * Get list of recent recordings (bonus endpoint)
 */
router.get('/', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 10, 100); // Max 100 records
    const recordings = await Recording.getRecentRecordings(limit);
    
    res.json({
      success: true,
      count: recordings.length,
      data: recordings.map(r => r.getStats())
    });
    
  } catch (error) {
    console.error('Error fetching recordings list:', error);
    
    res.status(500).json({
      error: 'Database error',
      message: 'Failed to retrieve recordings list'
    });
  }
});

/**
 * GET /api/recordings/:id/stats
 * Get statistics for a specific recording (bonus endpoint)
 */
router.get('/:id/stats', validateSessionId, checkValidationErrors, async (req, res) => {
  try {
    const sessionId = req.params.id;
    const recording = await Recording.findBySessionId(sessionId);
    
    if (!recording) {
      return res.status(404).json({
        error: 'Recording not found',
        message: `No recording found with session_id '${sessionId}'`
      });
    }
    
    // Calculate additional statistics
    const gazeValues = recording.data.map(d => d.x);
    const stats = {
      ...recording.getStats(),
      gaze_statistics: {
        min: Math.min(...gazeValues),
        max: Math.max(...gazeValues),
        mean: gazeValues.reduce((sum, val) => sum + val, 0) / gazeValues.length,
        range: Math.max(...gazeValues) - Math.min(...gazeValues)
      }
    };
    
    res.json({
      success: true,
      data: stats
    });
    
  } catch (error) {
    console.error('Error fetching recording stats:', error);
    
    res.status(500).json({
      error: 'Database error',
      message: 'Failed to retrieve recording statistics'
    });
  }
});

module.exports = router; 