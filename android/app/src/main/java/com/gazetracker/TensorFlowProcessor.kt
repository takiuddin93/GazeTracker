package com.gazetracker

import android.content.Context
import android.graphics.Bitmap
import android.graphics.ImageFormat
import android.graphics.Matrix
import android.graphics.Rect
import android.graphics.YuvImage
import android.media.Image
import android.util.Log
import org.tensorflow.lite.Interpreter
import java.io.ByteArrayOutputStream
import java.io.FileInputStream
import java.io.IOException
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.MappedByteBuffer
import java.nio.channels.FileChannel

class TensorFlowProcessor(private val context: Context) {
    
    companion object {
        private const val TAG = "TensorFlowProcessor"
        private const val MODEL_FILE = "face_detection.tflite"
        private const val INPUT_SIZE = 128 // BlazeFace input size
        private const val NUM_DETECTIONS = 896 // BlazeFace output detections
        private const val NUM_COORDS = 4 // x, y, width, height
    }
    
    private var interpreter: Interpreter? = null
    private var inputBuffer: ByteBuffer? = null
    private var isModelLoaded = false
    
    private val imageProcessor = ImageProcessor()
    
    init {
        Log.d(TAG, "TensorFlowProcessor constructor called - starting initialization...")
        try {
            loadModel()
            Log.d(TAG, "TensorFlowProcessor initialization completed successfully")
        } catch (e: Exception) {
            Log.e(TAG, "TensorFlowProcessor initialization failed", e)
        }
    }
    
    private fun loadModel() {
        try {
            Log.d(TAG, "Loading BlazeFace model...")
            
            Log.d(TAG, "Step 1: Loading model file from assets...")
            val modelBuffer = loadModelFile()
            Log.d(TAG, "Step 2: Model file loaded, size: ${modelBuffer.capacity()} bytes")
            
            // Configure interpreter options
            val options = Interpreter.Options()
            
            // Use CPU for now (more stable)
            Log.d(TAG, "Step 3: Using CPU inference for stability")
            options.setNumThreads(4) // Use 4 CPU threads
            
            Log.d(TAG, "Step 4: Creating TensorFlow Lite interpreter...")
            interpreter = Interpreter(modelBuffer, options)
            Log.d(TAG, "Step 5: Interpreter created successfully")
            
            // Allocate input buffer
            Log.d(TAG, "Step 6: Allocating input buffer...")
            inputBuffer = ByteBuffer.allocateDirect(INPUT_SIZE * INPUT_SIZE * 3 * 4) // RGB float32
            inputBuffer?.order(ByteOrder.nativeOrder())
            
            isModelLoaded = true
            Log.d(TAG, "BlazeFace model loaded successfully! Ready for inference.")
            
        } catch (e: Exception) {
            Log.e(TAG, "Error loading model at step", e)
            isModelLoaded = false
        }
    }
    
    private fun loadModelFile(): MappedByteBuffer {
        val assetFileDescriptor = context.assets.openFd("models/$MODEL_FILE")
        val inputStream = FileInputStream(assetFileDescriptor.fileDescriptor)
        val fileChannel = inputStream.channel
        val startOffset = assetFileDescriptor.startOffset
        val declaredLength = assetFileDescriptor.declaredLength
        return fileChannel.map(FileChannel.MapMode.READ_ONLY, startOffset, declaredLength)
    }
    
    /**
     * Process camera frame and extract eye/iris landmarks
     */
    fun processFrame(image: Image): EyeLandmarks? {
        if (!isModelLoaded || interpreter == null || inputBuffer == null) {
            Log.w(TAG, "Model not loaded, skipping frame processing")
            return null
        }
        
        try {
            // Convert camera frame to bitmap
            val bitmap = imageProcessor.imageToBitmap(image)
            if (bitmap == null) {
                Log.w(TAG, "Failed to convert image to bitmap")
                return null
            }
            
            // Preprocess bitmap for model input
            val preprocessedBitmap = imageProcessor.preprocessBitmap(bitmap)
            
            // Convert bitmap to input buffer
            imageProcessor.bitmapToInputBuffer(preprocessedBitmap, inputBuffer!!)
            
            // Run inference - get raw BlazeFace model outputs
            val (regressors, classificators) = runInference()
            
            // Process real BlazeFace detections
            return processBlazeFaceDetections(regressors, classificators, bitmap, image.width, image.height)
            
        } catch (e: Exception) {
            Log.e(TAG, "Error processing frame", e)
            return null
        }
    }
    
    private fun runInference(): Pair<Array<Array<FloatArray>>, Array<Array<FloatArray>>> {
        val interpreter = this.interpreter ?: throw IllegalStateException("Interpreter not initialized")
        
        // BlazeFace model outputs:
        // - regressors: [1, 896, 16] - bounding box coordinates and keypoints  
        // - classificators: [1, 896, 1] - confidence scores
        val regressors = Array(1) { Array(896) { FloatArray(16) } }
        val classificators = Array(1) { Array(896) { FloatArray(1) } }
        
        val outputs = mapOf(
            0 to regressors,
            1 to classificators
        )
        
        // Run inference
        interpreter.runForMultipleInputsOutputs(arrayOf(inputBuffer), outputs)
        
        Log.d(TAG, "Inference completed. Checking outputs...")
        
        // Debug: Log first few detection scores and coordinates
        for (i in 0 until kotlin.math.min(3, regressors[0].size)) {
            val logit = classificators[0][i][0]
            val confidence = 1.0f / (1.0f + kotlin.math.exp(-logit))
            val coords = regressors[0][i]
            Log.d(TAG, "Detection $i: logit=$logit, confidence=$confidence, coords=[${coords[0]}, ${coords[1]}, ${coords[2]}, ${coords[3]}]")
        }
        
        return Pair(regressors, classificators)
    }
    
    private fun processBlazeFaceDetections(
        regressors: Array<Array<FloatArray>>, 
        classificators: Array<Array<FloatArray>>, 
        bitmap: Bitmap,
        imageWidth: Int, 
        imageHeight: Int
    ): EyeLandmarks {
        // Find the best face detection based on confidence score
        var bestDetectionIndex = -1
        var bestConfidence = 0.0f
        val confidenceThreshold = 0.01f // Lower threshold for testing gaze estimation
        
        // Check all 896 possible detections for the best confidence score
        for (i in classificators[0].indices) {
            val logit = classificators[0][i][0]
            // Convert logit to probability using sigmoid activation
            val confidence = 1.0f / (1.0f + kotlin.math.exp(-logit))
            
            if (confidence > bestConfidence) {
                bestConfidence = confidence
                if (confidence > confidenceThreshold) {
                    bestDetectionIndex = i
                }
            }
        }
        
        Log.d(TAG, "Detection scan complete. Best confidence: $bestConfidence, threshold: $confidenceThreshold")
        
        if (bestDetectionIndex == -1) {
            Log.d(TAG, "No face detected above confidence threshold ($confidenceThreshold). Best score: $bestConfidence")
            return createNoFaceResult()
        }
        
        // Get the coordinates for the best detection
        val coords = regressors[0][bestDetectionIndex]
        
        // BlazeFace outputs coordinates relative to the 128x128 input image
        // Need to scale back to original image size
        val scaleX = imageWidth.toFloat() / INPUT_SIZE
        val scaleY = imageHeight.toFloat() / INPUT_SIZE
        
        // Extract face bounding box (first 4 coordinates)
        // These are likely in [x_center, y_center, width, height] format
        val faceX = coords[0] * scaleX
        val faceY = coords[1] * scaleY
        val faceWidth = coords[2] * scaleX
        val faceHeight = coords[3] * scaleY
        
        // Convert center coordinates to top-left corner
        val faceLeft = faceX - faceWidth / 2
        val faceTop = faceY - faceHeight / 2
        
        Log.d(TAG, "Face detected: confidence=$bestConfidence, box=[${faceLeft}, ${faceTop}, ${faceWidth}, ${faceHeight}]")
        
        // Estimate eye positions based on face bounding box
        // Eyes are typically at 1/3 height from top, 1/4 and 3/4 width from left
        val eyeY = faceTop + faceHeight * 0.35f
        val leftEyeX = faceLeft + faceWidth * 0.3f
        val rightEyeX = faceLeft + faceWidth * 0.7f
        
        // Eye corner estimates
        val eyeSpacing = faceWidth * 0.08f
        
        // Calculate iris positions using basic detection within eye regions
        val leftIrisX = detectIrisInEyeRegion(bitmap, leftEyeX, eyeY, faceWidth * 0.15f)
        val rightIrisX = detectIrisInEyeRegion(bitmap, rightEyeX, eyeY, faceWidth * 0.15f)
        
        // Use the average iris position for horizontal gaze estimation
        val averageIrisX = (leftIrisX + rightIrisX) / 2f
        
        // Calculate eye corners for gaze estimation (outer corners)
        val leftEyeOuterX = leftEyeX - eyeSpacing
        val rightEyeOuterX = rightEyeX + eyeSpacing
        
        // Calculate normalized gaze direction
        val gazeData = calculateNormalizedGaze(
            irisX = averageIrisX,
            leftEyeX = leftEyeOuterX,
            rightEyeX = rightEyeOuterX,
            confidence = bestConfidence
        )
        
        return EyeLandmarks(
            leftEye = EyeData(
                iris = Point(leftIrisX, eyeY),
                innerCorner = Point(leftEyeX + eyeSpacing, eyeY),
                outerCorner = Point(leftEyeOuterX, eyeY)
            ),
            rightEye = EyeData(
                iris = Point(rightIrisX, eyeY),
                innerCorner = Point(rightEyeX - eyeSpacing, eyeY),
                outerCorner = Point(rightEyeOuterX, eyeY)
            ),
            confidence = bestConfidence,
            timestamp = System.currentTimeMillis(),
            highResTimestamp = System.nanoTime(),
            gazeData = gazeData
        )
    }
    
    private fun createNoFaceResult(): EyeLandmarks {
        return EyeLandmarks(
            leftEye = EyeData(
                iris = Point(0f, 0f),
                innerCorner = Point(0f, 0f),
                outerCorner = Point(0f, 0f)
            ),
            rightEye = EyeData(
                iris = Point(0f, 0f),
                innerCorner = Point(0f, 0f),
                outerCorner = Point(0f, 0f)
            ),
            confidence = 0.0f, // No face detected
            timestamp = System.currentTimeMillis(),
            highResTimestamp = System.nanoTime(),
            gazeData = null
        )
    }
    
    /**
     * Detect iris/pupil position within an eye region using simple image processing
     */
    private fun detectIrisInEyeRegion(bitmap: Bitmap, eyeCenterX: Float, eyeCenterY: Float, eyeRegionSize: Float): Float {
        try {
            val width = bitmap.width
            val height = bitmap.height
            
            // Define eye region bounds
            val regionHalfSize = eyeRegionSize / 2f
            val left = Math.max(0, (eyeCenterX - regionHalfSize).toInt())
            val top = Math.max(0, (eyeCenterY - regionHalfSize).toInt())
            val right = Math.min(width, (eyeCenterX + regionHalfSize).toInt())
            val bottom = Math.min(height, (eyeCenterY + regionHalfSize).toInt())
            
            if (right <= left || bottom <= top) {
                Log.w(TAG, "Invalid eye region bounds, using center position")
                return eyeCenterX
            }
            
            var darkestX = eyeCenterX
            var darkestIntensity = 255f
            
            // Scan multiple horizontal lines for better iris detection
            val scanLines = 3
            val lineSpacing = Math.max(1, (bottom - top) / (scanLines + 1))
            
            for (lineIdx in 0 until scanLines) {
                val scanY = top + lineSpacing * (lineIdx + 1)
                if (scanY >= top && scanY < bottom) {
                    for (x in left until right) {
                        val pixel = bitmap.getPixel(x, scanY)
                        
                        // Convert to grayscale intensity with weighted emphasis on blue channel (iris)
                        val red = (pixel shr 16) and 0xFF
                        val green = (pixel shr 8) and 0xFF
                        val blue = pixel and 0xFF
                        val intensity = (red * 0.3f + green * 0.3f + blue * 0.4f) // Emphasize blue
                        
                        // Track darkest point (pupil/iris is darker than sclera)
                        if (intensity < darkestIntensity) {
                            darkestIntensity = intensity
                            darkestX = x.toFloat()
                        }
                    }
                }
            }
            
            // Apply smoothing - allow more movement for better gaze detection
            val maxMovement = eyeRegionSize * 0.5f
            val movement = darkestX - eyeCenterX
            val smoothedX = eyeCenterX + Math.max(-maxMovement, Math.min(maxMovement, movement))
            
            Log.d(TAG, "Iris detection: eye center=$eyeCenterX, detected=$darkestX, smoothed=$smoothedX, intensity=$darkestIntensity")
            
            return smoothedX
            
        } catch (e: Exception) {
            Log.e(TAG, "Error detecting iris in eye region", e)
            return eyeCenterX // Fallback to eye center
        }
    }
    
    /**
     * Calculate normalized horizontal gaze direction
     * Formula: normalized_x = 2 * ((iris_x - left_eye_x) / (right_eye_x - left_eye_x)) - 1
     * Clamps output to [-1, 1] where -1 = far left, 0 = center, 1 = far right
     */
    private fun calculateNormalizedGaze(
        irisX: Float,
        leftEyeX: Float,
        rightEyeX: Float,
        confidence: Float
    ): GazeData {
        // Ensure left eye is actually to the left of right eye
        val actualLeftX = kotlin.math.min(leftEyeX, rightEyeX)
        val actualRightX = kotlin.math.max(leftEyeX, rightEyeX)
        
        // Calculate eye span (distance between eye corners)
        val eyeSpan = actualRightX - actualLeftX
        
        // Avoid division by zero
        val normalizedGazeX = if (eyeSpan > 0.001f) {
            // Apply the gaze normalization formula
            val rawNormalized = 2f * ((irisX - actualLeftX) / eyeSpan) - 1f
            // Clamp to [-1, 1] range
            kotlin.math.max(-1f, kotlin.math.min(1f, rawNormalized))
        } else {
            0f // Default to center if eyes are too close together
        }
        
        Log.d(TAG, "Gaze calculation: iris=$irisX, leftEye=$actualLeftX, rightEye=$actualRightX, span=$eyeSpan, normalized=$normalizedGazeX")
        
        return GazeData(
            normalizedGazeX = normalizedGazeX,
            rawGazeX = irisX,
            leftEyeX = actualLeftX,
            rightEyeX = actualRightX,
            confidence = confidence
        )
    }
    
    private fun calculateEyeCenter(eyePoints: List<Point>): Point {
        val avgX = eyePoints.map { it.x }.average().toFloat()
        val avgY = eyePoints.map { it.y }.average().toFloat()
        return Point(avgX, avgY)
    }
    
    fun cleanup() {
        try {
            interpreter?.close()
            isModelLoaded = false
            Log.d(TAG, "TensorFlow resources cleaned up")
        } catch (e: Exception) {
            Log.e(TAG, "Error cleaning up TensorFlow resources", e)
        }
    }
    
    /**
     * Reinitialize the model - useful when camera restarts
     */
    fun reinitializeModel() {
        Log.d(TAG, "Reinitializing TensorFlow model...")
        if (!isModelLoaded) {
            loadModel()
        } else {
            Log.d(TAG, "Model already loaded, skipping reinitialization")
        }
    }
}

// Data classes moved to end of file to include gaze estimation

// Image processing utility class
class ImageProcessor {
    
    companion object {
        private const val TAG = "ImageProcessor"
    }
    
    fun imageToBitmap(image: Image): Bitmap? {
        try {
            // Convert YUV_420_888 to Bitmap
            val planes = image.planes
            val yPlane = planes[0]
            val uPlane = planes[1]
            val vPlane = planes[2]
            
            val ySize = yPlane.buffer.remaining()
            val uSize = uPlane.buffer.remaining()
            val vSize = vPlane.buffer.remaining()
            
            val nv21 = ByteArray(ySize + uSize + vSize)
            
            yPlane.buffer.get(nv21, 0, ySize)
            
            val uvBuffer = ByteArray(uSize + vSize)
            vPlane.buffer.get(uvBuffer, 0, vSize)
            uPlane.buffer.get(uvBuffer, vSize, uSize)
            
            System.arraycopy(uvBuffer, 0, nv21, ySize, uvBuffer.size)
            
            val yuvImage = YuvImage(nv21, ImageFormat.NV21, image.width, image.height, null)
            val out = ByteArrayOutputStream()
            yuvImage.compressToJpeg(Rect(0, 0, image.width, image.height), 100, out)
            val imageBytes = out.toByteArray()
            
            return android.graphics.BitmapFactory.decodeByteArray(imageBytes, 0, imageBytes.size)
            
        } catch (e: Exception) {
            Log.e(TAG, "Error converting image to bitmap", e)
            return null
        }
    }
    
    fun preprocessBitmap(bitmap: Bitmap): Bitmap {
        // Resize to model input size (128x128 for BlazeFace)
        return Bitmap.createScaledBitmap(bitmap, 128, 128, true)
    }
    
    fun bitmapToInputBuffer(bitmap: Bitmap, inputBuffer: ByteBuffer) {
        inputBuffer.rewind()
        
        val intValues = IntArray(128 * 128)
        bitmap.getPixels(intValues, 0, bitmap.width, 0, 0, bitmap.width, bitmap.height)
        
        // Convert to normalized float values [0, 1]
        for (pixelValue in intValues) {
            val r = (pixelValue shr 16 and 0xFF) / 255.0f
            val g = (pixelValue shr 8 and 0xFF) / 255.0f
            val b = (pixelValue and 0xFF) / 255.0f
            
            inputBuffer.putFloat(r)
            inputBuffer.putFloat(g)
            inputBuffer.putFloat(b)
        }
    }
}

// Data classes for eye tracking and gaze estimation
data class Point(val x: Float, val y: Float)

data class EyeData(
    val iris: Point,
    val innerCorner: Point,
    val outerCorner: Point
)

data class GazeData(
    val normalizedGazeX: Float, // [-1, 1] where -1 = far left, 0 = center, 1 = far right
    val rawGazeX: Float, // Raw iris X position
    val leftEyeX: Float, // Left eye outer corner X
    val rightEyeX: Float, // Right eye outer corner X
    val confidence: Float // Gaze estimation confidence
)

data class EyeLandmarks(
    val leftEye: EyeData,
    val rightEye: EyeData,
    val confidence: Float,
    val timestamp: Long,
    val highResTimestamp: Long, // High-resolution native timestamp (nanoseconds)
    val gazeData: GazeData? // Optional gaze estimation data
)