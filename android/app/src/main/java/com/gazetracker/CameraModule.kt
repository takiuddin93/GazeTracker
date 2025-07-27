package com.gazetracker

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.graphics.ImageFormat
import android.hardware.camera2.*
import android.media.Image
import android.media.ImageReader
import android.os.Handler
import android.os.HandlerThread
import android.util.Log
import android.util.Size
import android.view.Surface
import androidx.core.app.ActivityCompat
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.util.*

class CameraModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
    
    companion object {
        private const val TAG = "CameraModule"
        private const val CAMERA_FACING_FRONT = "front"
        private const val CAMERA_FACING_BACK = "back"
        private const val TARGET_FPS = 30
        private const val CAMERA_PERMISSION_REQUEST_CODE = 1001
        
        // Singleton instance for CameraView access
        @Volatile
        private var INSTANCE: CameraModule? = null
        
        fun getInstance(): CameraModule? = INSTANCE
    }
    
    init {
        INSTANCE = this
    }
    
    override fun getConstants(): Map<String, Any>? {
        return emptyMap()
    }
    
    @ReactMethod
    fun addListener(eventName: String) {
        // Keep: Required for RCTEventEmitter interface
    }
    
    @ReactMethod
    fun removeListeners(count: Int) {
        // Keep: Required for RCTEventEmitter interface
    }
    
    @ReactMethod
    fun checkCameraPermission(promise: Promise) {
        val hasPermission = ActivityCompat.checkSelfPermission(
            reactApplicationContext,
            Manifest.permission.CAMERA
        ) == PackageManager.PERMISSION_GRANTED
        
        promise.resolve(hasPermission)
    }
    
    @ReactMethod
    fun requestCameraPermission(promise: Promise) {
        val activity = currentActivity
        if (activity != null) {
            if (ActivityCompat.checkSelfPermission(
                    reactApplicationContext,
                    Manifest.permission.CAMERA
                ) == PackageManager.PERMISSION_GRANTED
            ) {
                promise.resolve(true)
            } else {
                ActivityCompat.requestPermissions(
                    activity,
                    arrayOf(Manifest.permission.CAMERA),
                    CAMERA_PERMISSION_REQUEST_CODE
                )
                promise.resolve("requested")
            }
        } else {
            promise.reject("ERROR", "Activity not available")
        }
    }

    private var cameraManager: CameraManager? = null
    private var cameraDevice: CameraDevice? = null
    private var captureSession: CameraCaptureSession? = null
    private var imageReader: ImageReader? = null
    private var backgroundThread: HandlerThread? = null
    private var backgroundHandler: Handler? = null
    private var currentCameraId: String? = null
    private var previewSurface: Surface? = null
    private var tensorFlowProcessor: TensorFlowProcessor? = null

    init {
        cameraManager = reactApplicationContext.getSystemService(Context.CAMERA_SERVICE) as CameraManager
        // Initialize TensorFlow processor
        try {
            Log.d(TAG, "Initializing TensorFlow processor...")
            tensorFlowProcessor = TensorFlowProcessor(reactApplicationContext)
            Log.d(TAG, "TensorFlow processor initialized successfully")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to initialize TensorFlow processor", e)
            tensorFlowProcessor = null
        }
    }

    override fun getName(): String = "CameraModule"

    @ReactMethod
    fun startCamera(cameraType: String, promise: Promise) {
        try {
            // Ensure TensorFlow model is loaded/reloaded
            Log.d(TAG, "Starting camera - ensuring TensorFlow model is ready")
            tensorFlowProcessor?.reinitializeModel()
            
            startBackgroundThread()
            
            val cameraId = getCameraId(cameraType)
            if (cameraId == null) {
                promise.reject("CAMERA_ERROR", "Camera not found")
                return
            }

            // Check camera permission
            if (ActivityCompat.checkSelfPermission(
                    reactApplicationContext,
                    Manifest.permission.CAMERA
                ) != PackageManager.PERMISSION_GRANTED
            ) {
                // Request permission if not granted
                val activity = currentActivity
                if (activity != null) {
                    ActivityCompat.requestPermissions(
                        activity,
                        arrayOf(Manifest.permission.CAMERA),
                        CAMERA_PERMISSION_REQUEST_CODE
                    )
                    promise.reject("PERMISSION_ERROR", "Camera permission requested - please try again")
                } else {
                    promise.reject("PERMISSION_ERROR", "Camera permission not granted - please enable in settings")
                }
                return
            }

            val characteristics = cameraManager?.getCameraCharacteristics(cameraId)
            val map = characteristics?.get(CameraCharacteristics.SCALER_STREAM_CONFIGURATION_MAP)
            
            // Get optimal size for performance (smaller = faster processing)
            val outputSizes = map?.getOutputSizes(ImageFormat.YUV_420_888)
            val optimalSize = chooseOptimalSize(outputSizes)

            // Setup ImageReader for frame capture
            imageReader = ImageReader.newInstance(
                optimalSize.width,
                optimalSize.height,
                ImageFormat.YUV_420_888,
                2
            )

            imageReader?.setOnImageAvailableListener(imageAvailableListener, backgroundHandler)

            cameraManager?.openCamera(cameraId, cameraStateCallback, backgroundHandler)
            currentCameraId = cameraId
            
            promise.resolve(WritableNativeMap().apply {
                putString("cameraId", cameraId)
                putInt("width", optimalSize.width)
                putInt("height", optimalSize.height)
            })

        } catch (e: Exception) {
            Log.e(TAG, "Error starting camera", e)
            promise.reject("CAMERA_ERROR", e.message)
        }
    }

    @ReactMethod
    fun stopCamera(promise: Promise) {
        try {
            captureSession?.close()
            cameraDevice?.close()
            imageReader?.close()
            stopBackgroundThread()
            
            // Don't cleanup TensorFlow resources when stopping camera
            // This preserves the model state for when camera restarts
            Log.d(TAG, "Camera stopped, preserving TensorFlow model state")
            
            captureSession = null
            cameraDevice = null
            imageReader = null
            currentCameraId = null
            
            promise.resolve("Camera stopped")
        } catch (e: Exception) {
            promise.reject("CAMERA_ERROR", e.message)
        }
    }

    @ReactMethod
    fun switchCamera(cameraType: String, promise: Promise) {
        try {
            // Stop current camera first
            captureSession?.close()
            cameraDevice?.close()
            imageReader?.close()
            
            captureSession = null
            cameraDevice = null
            imageReader = null
            currentCameraId = null
            
            // Start new camera
            startCamera(cameraType, promise)
            
        } catch (e: Exception) {
            Log.e(TAG, "Error switching camera", e)
            promise.reject("CAMERA_ERROR", e.message)
        }
    }
    
    fun setSurface(surface: Surface?) {
        this.previewSurface = surface
        Log.d(TAG, "Preview surface set: ${surface != null}, camera active: ${cameraDevice != null}")
        
        // If camera is active and surface is set, recreate session
        if (cameraDevice != null && surface != null) {
            Log.d(TAG, "Recreating capture session with new preview surface")
            createCaptureSession()
        }
    }

    private fun getCameraId(cameraType: String): String? {
        return try {
            val cameraIds = cameraManager?.cameraIdList
            cameraIds?.find { id ->
                val characteristics = cameraManager?.getCameraCharacteristics(id)
                val facing = characteristics?.get(CameraCharacteristics.LENS_FACING)
                when (cameraType) {
                    CAMERA_FACING_FRONT -> facing == CameraCharacteristics.LENS_FACING_FRONT
                    CAMERA_FACING_BACK -> facing == CameraCharacteristics.LENS_FACING_BACK
                    else -> false
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error getting camera ID", e)
            null
        }
    }

    private fun chooseOptimalSize(sizes: Array<Size>?): Size {
        // Choose size optimized for performance (640x480 or similar)
        return sizes?.find { it.width == 640 && it.height == 480 }
            ?: sizes?.find { it.width <= 800 && it.height <= 600 }
            ?: sizes?.firstOrNull()
            ?: Size(640, 480)
    }

    private val cameraStateCallback = object : CameraDevice.StateCallback() {
        override fun onOpened(camera: CameraDevice) {
            cameraDevice = camera
            createCaptureSession()
        }

        override fun onDisconnected(camera: CameraDevice) {
            camera.close()
            cameraDevice = null
        }

        override fun onError(camera: CameraDevice, error: Int) {
            camera.close()
            cameraDevice = null
            Log.e(TAG, "Camera error: $error")
        }
    }

    private fun createCaptureSession() {
        try {
            // Close existing session first
            captureSession?.close()
            captureSession = null
            
            val surfaces = mutableListOf<Surface>()
            
            // Add image reader surface for frame processing
            imageReader?.surface?.let { surfaces.add(it) }
            
            // Add preview surface if available
            previewSurface?.let { 
                surfaces.add(it) 
                Log.d(TAG, "Added preview surface to capture session")
            }
            
            if (surfaces.isEmpty()) {
                Log.e(TAG, "No surfaces available for capture session")
                return
            }
            
            Log.d(TAG, "Creating capture session with ${surfaces.size} surfaces")
            
            cameraDevice?.createCaptureSession(
                surfaces,
                object : CameraCaptureSession.StateCallback() {
                    override fun onConfigured(session: CameraCaptureSession) {
                        // Check if camera is still active
                        if (cameraDevice == null) {
                            Log.e(TAG, "Camera device is null in onConfigured")
                            return
                        }
                        
                        captureSession = session
                        Log.d(TAG, "Capture session configured successfully")
                        startRepeatingRequest()
                    }

                    override fun onConfigureFailed(session: CameraCaptureSession) {
                        Log.e(TAG, "Capture session configuration failed")
                    }
                },
                backgroundHandler
            )
        } catch (e: Exception) {
            Log.e(TAG, "Error creating capture session", e)
        }
    }

    private fun startRepeatingRequest() {
        try {
            // Validate camera and session state
            val camera = cameraDevice
            val session = captureSession
            
            if (camera == null) {
                Log.e(TAG, "Cannot start repeating request: camera device is null")
                return
            }
            
            if (session == null) {
                Log.e(TAG, "Cannot start repeating request: capture session is null")
                return
            }
            
            val requestBuilder = camera.createCaptureRequest(CameraDevice.TEMPLATE_PREVIEW)
            
            // Add image reader target for frame processing
            imageReader?.surface?.let { 
                requestBuilder.addTarget(it)
                Log.d(TAG, "Added image reader as capture target")
            }
            
            // Add preview surface target for camera display
            previewSurface?.let { 
                requestBuilder.addTarget(it) 
                Log.d(TAG, "Added preview surface as capture target")
            }
            
            // Set high frame rate for performance
            requestBuilder.set(CaptureRequest.CONTROL_AE_TARGET_FPS_RANGE, 
                android.util.Range(TARGET_FPS, TARGET_FPS))
            
            val request = requestBuilder.build()
            session.setRepeatingRequest(request, null, backgroundHandler)
            
            Log.d(TAG, "Repeating request started successfully")
            
        } catch (e: Exception) {
            Log.e(TAG, "Error starting repeating request", e)
        }
    }

    private val imageAvailableListener = ImageReader.OnImageAvailableListener { reader ->
        val image = reader.acquireLatestImage()
        if (image != null) {
            // Process frame for gaze tracking
            processFrame(image)
            image.close()
        }
    }

    private fun processFrame(image: Image) {
        try {
            // Run TensorFlow Lite inference for eye landmark detection
            val eyeLandmarks = tensorFlowProcessor?.processFrame(image)
            
            val frameData = WritableNativeMap().apply {
                putDouble("timestamp", System.currentTimeMillis().toDouble())
                putInt("width", image.width)
                putInt("height", image.height)
                putString("format", "YUV_420_888")
                
                // Add eye landmark data if available
                eyeLandmarks?.let { landmarks ->
                    val landmarksData = WritableNativeMap().apply {
                        // Left eye data
                        val leftEyeData = WritableNativeMap().apply {
                            val irisData = WritableNativeMap().apply {
                                putDouble("x", landmarks.leftEye.iris.x.toDouble())
                                putDouble("y", landmarks.leftEye.iris.y.toDouble())
                            }
                            val innerCornerData = WritableNativeMap().apply {
                                putDouble("x", landmarks.leftEye.innerCorner.x.toDouble())
                                putDouble("y", landmarks.leftEye.innerCorner.y.toDouble())
                            }
                            val outerCornerData = WritableNativeMap().apply {
                                putDouble("x", landmarks.leftEye.outerCorner.x.toDouble())
                                putDouble("y", landmarks.leftEye.outerCorner.y.toDouble())
                            }
                            putMap("iris", irisData)
                            putMap("innerCorner", innerCornerData)
                            putMap("outerCorner", outerCornerData)
                        }
                        
                        // Right eye data
                        val rightEyeData = WritableNativeMap().apply {
                            val irisData = WritableNativeMap().apply {
                                putDouble("x", landmarks.rightEye.iris.x.toDouble())
                                putDouble("y", landmarks.rightEye.iris.y.toDouble())
                            }
                            val innerCornerData = WritableNativeMap().apply {
                                putDouble("x", landmarks.rightEye.innerCorner.x.toDouble())
                                putDouble("y", landmarks.rightEye.innerCorner.y.toDouble())
                            }
                            val outerCornerData = WritableNativeMap().apply {
                                putDouble("x", landmarks.rightEye.outerCorner.x.toDouble())
                                putDouble("y", landmarks.rightEye.outerCorner.y.toDouble())
                            }
                            putMap("iris", irisData)
                            putMap("innerCorner", innerCornerData)
                            putMap("outerCorner", outerCornerData)
                        }
                        
                        putMap("leftEye", leftEyeData)
                        putMap("rightEye", rightEyeData)
                        putDouble("confidence", landmarks.confidence.toDouble())
                        putDouble("landmarkTimestamp", landmarks.timestamp.toDouble())
                        putDouble("highResTimestamp", landmarks.highResTimestamp.toDouble())
                        
                        // Add gaze data if available
                        landmarks.gazeData?.let { gaze ->
                            val gazeData = WritableNativeMap().apply {
                                putDouble("normalizedGazeX", gaze.normalizedGazeX.toDouble())
                                putDouble("rawGazeX", gaze.rawGazeX.toDouble())
                                putDouble("leftEyeX", gaze.leftEyeX.toDouble())
                                putDouble("rightEyeX", gaze.rightEyeX.toDouble())
                                putDouble("confidence", gaze.confidence.toDouble())
                            }
                            putMap("gazeData", gazeData)
                        }
                    }
                    putMap("eyeLandmarks", landmarksData)
                }
            }

            // Send frame event with landmarks to React Native
            sendFrameEvent(frameData)
            
        } catch (e: Exception) {
            Log.e(TAG, "Error processing frame", e)
        }
    }

    private fun sendFrameEvent(frameData: WritableMap) {
        reactApplicationContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit("onCameraFrame", frameData)
    }

    private fun startBackgroundThread() {
        backgroundThread = HandlerThread("CameraBackground").also { it.start() }
        backgroundHandler = Handler(backgroundThread?.looper!!)
    }

    private fun stopBackgroundThread() {
        backgroundThread?.quitSafely()
        try {
            backgroundThread?.join()
            backgroundThread = null
            backgroundHandler = null
        } catch (e: InterruptedException) {
            Log.e(TAG, "Error stopping background thread", e)
        }
    }
} 