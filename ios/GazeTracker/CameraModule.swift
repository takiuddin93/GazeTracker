import Foundation
import AVFoundation
import React

@objc(CameraModule)
class CameraModule: RCTEventEmitter {
    
    private var captureSession: AVCaptureSession?
    private var videoOutput: AVCaptureVideoDataOutput?
    private var currentCamera: AVCaptureDevice?
    private let sessionQueue = DispatchQueue(label: "camera.session.queue")
    private var isSessionRunning = false
    
    override init() {
        super.init()
        setupSession()
    }
    
    override func supportedEvents() -> [String]! {
        return ["onCameraFrame"]
    }
    
    private func setupSession() {
        captureSession = AVCaptureSession()
        captureSession?.sessionPreset = .vga640x480 // Optimal for performance
        
        videoOutput = AVCaptureVideoDataOutput()
        videoOutput?.setSampleBufferDelegate(self, queue: sessionQueue)
        
        // Configure for optimal performance
        videoOutput?.videoSettings = [
            kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_420YpCbCr8BiPlanarFullRange
        ]
        
        // Enable high frame rate
        videoOutput?.alwaysDiscardsLateVideoFrames = true
        
        if let output = videoOutput, captureSession?.canAddOutput(output) == true {
            captureSession?.addOutput(output)
        }
    }
    
    @objc
    func startCamera(_ cameraType: String, resolver: @escaping RCTPromiseResolveBlock, rejecter: @escaping RCTPromiseRejectBlock) {
        
        sessionQueue.async {
            guard let session = self.captureSession else {
                rejecter("CAMERA_ERROR", "Capture session not available", nil)
                return
            }
            
            // Request camera permission
            switch AVCaptureDevice.authorizationStatus(for: .video) {
            case .authorized:
                break
            case .notDetermined:
                AVCaptureDevice.requestAccess(for: .video) { granted in
                    if !granted {
                        rejecter("PERMISSION_ERROR", "Camera permission denied", nil)
                        return
                    }
                    self.startCamera(cameraType, resolver: resolver, rejecter: rejecter)
                }
                return
            default:
                rejecter("PERMISSION_ERROR", "Camera permission denied", nil)
                return
            }
            
            // Remove existing camera input
            if let currentInput = session.inputs.first {
                session.removeInput(currentInput)
            }
            
            // Get camera device
            guard let camera = self.getCameraDevice(cameraType: cameraType) else {
                rejecter("CAMERA_ERROR", "Camera not found", nil)
                return
            }
            
            do {
                let input = try AVCaptureDeviceInput(device: camera)
                
                if session.canAddInput(input) {
                    session.addInput(input)
                    self.currentCamera = camera
                    
                    // Configure camera for high frame rate
                    try camera.lockForConfiguration()
                    
                    // Set frame rate to 30 FPS
                    let frameDuration = CMTime(value: 1, timescale: 30)
                    camera.activeVideoMinFrameDuration = frameDuration
                    camera.activeVideoMaxFrameDuration = frameDuration
                    
                    camera.unlockForConfiguration()
                    
                    session.startRunning()
                    self.isSessionRunning = true
                    
                    DispatchQueue.main.async {
                        resolver([
                            "cameraId": camera.uniqueID,
                            "width": 640,
                            "height": 480
                        ])
                    }
                } else {
                    rejecter("CAMERA_ERROR", "Cannot add camera input", nil)
                }
            } catch {
                rejecter("CAMERA_ERROR", error.localizedDescription, error)
            }
        }
    }
    
    @objc
    func stopCamera(_ resolver: @escaping RCTPromiseResolveBlock, rejecter: @escaping RCTPromiseRejectBlock) {
        
        sessionQueue.async {
            if let session = self.captureSession, self.isSessionRunning {
                session.stopRunning()
                self.isSessionRunning = false
                
                // Remove all inputs
                for input in session.inputs {
                    session.removeInput(input)
                }
                
                self.currentCamera = nil
                
                DispatchQueue.main.async {
                    resolver("Camera stopped")
                }
            } else {
                DispatchQueue.main.async {
                    resolver("Camera already stopped")
                }
            }
        }
    }
    
    @objc
    func switchCamera(_ cameraType: String, resolver: @escaping RCTPromiseResolveBlock, rejecter: @escaping RCTPromiseRejectBlock) {
        
        stopCamera({ _ in
            self.startCamera(cameraType, resolver: resolver, rejecter: rejecter)
        }, rejecter: rejecter)
    }
    
    private func getCameraDevice(cameraType: String) -> AVCaptureDevice? {
        let deviceTypes: [AVCaptureDevice.DeviceType] = [.builtInWideAngleCamera]
        let discoverySession = AVCaptureDevice.DiscoverySession(
            deviceTypes: deviceTypes,
            mediaType: .video,
            position: .unspecified
        )
        
        let position: AVCaptureDevice.Position = cameraType == "front" ? .front : .back
        
        return discoverySession.devices.first { $0.position == position }
    }
    
    private func processFrame(_ sampleBuffer: CMSampleBuffer) {
        // Extract frame information
        guard let imageBuffer = CMSampleBufferGetImageBuffer(sampleBuffer) else { return }
        
        let timestamp = CMSampleBufferGetPresentationTimeStamp(sampleBuffer)
        let width = CVPixelBufferGetWidth(imageBuffer)
        let height = CVPixelBufferGetHeight(imageBuffer)
        
        let frameData: [String: Any] = [
            "timestamp": Double(timestamp.value) / Double(timestamp.timescale) * 1000.0, // Convert to milliseconds
            "width": width,
            "height": height,
            "format": "420YpCbCr8BiPlanarFullRange"
            // Note: For TensorFlow processing, we'll process the raw pixel buffer in native code
        ]
        
        // Send frame event to React Native
        DispatchQueue.main.async {
            self.sendEvent(withName: "onCameraFrame", body: frameData)
        }
        
        // TODO: Here we'll integrate TensorFlow Lite processing in Phase 2
    }
}

// MARK: - AVCaptureVideoDataOutputSampleBufferDelegate
extension CameraModule: AVCaptureVideoDataOutputSampleBufferDelegate {
    func captureOutput(_ output: AVCaptureOutput, didOutput sampleBuffer: CMSampleBuffer, from connection: AVCaptureConnection) {
        processFrame(sampleBuffer)
    }
    
    func captureOutput(_ output: AVCaptureOutput, didDrop sampleBuffer: CMSampleBuffer, from connection: AVCaptureConnection) {
        // Handle dropped frames if needed
        print("Frame dropped - camera running too fast or processing too slow")
    }
}

// MARK: - React Native Bridge
@objc(CameraModuleBridge)
class CameraModuleBridge: NSObject {
    
    @objc
    static func requiresMainQueueSetup() -> Bool {
        return false
    }
} 