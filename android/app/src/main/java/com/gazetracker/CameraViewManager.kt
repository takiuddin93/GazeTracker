package com.gazetracker

import android.content.Context
import android.util.Log
import android.view.SurfaceHolder
import android.view.SurfaceView
import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.annotations.ReactProp

class CameraView(context: Context) : SurfaceView(context), SurfaceHolder.Callback {
    companion object {
        private const val TAG = "CameraView"
    }

    private var cameraModule: CameraModule? = null

    init {
        holder.addCallback(this)
        Log.d(TAG, "CameraView initialized")
    }

    fun setCameraModule(module: CameraModule) {
        this.cameraModule = module
        Log.d(TAG, "Camera module set")
    }

    override fun surfaceCreated(holder: SurfaceHolder) {
        Log.d(TAG, "Surface created")
        cameraModule?.setSurface(holder.surface)
    }

    override fun surfaceChanged(holder: SurfaceHolder, format: Int, width: Int, height: Int) {
        Log.d(TAG, "Surface changed: ${width}x${height}")
    }

    override fun surfaceDestroyed(holder: SurfaceHolder) {
        Log.d(TAG, "Surface destroyed")
        cameraModule?.setSurface(null)
    }
}

class CameraViewManager : SimpleViewManager<CameraView>() {
    companion object {
        const val REACT_CLASS = "CameraView"
        private const val TAG = "CameraViewManager"
    }

    override fun getName(): String = REACT_CLASS

    override fun createViewInstance(reactContext: ThemedReactContext): CameraView {
        Log.d(TAG, "Creating CameraView instance")
        val cameraView = CameraView(reactContext)
        
        // Connect to the CameraModule instance
        val cameraModule = CameraModule.getInstance()
        if (cameraModule != null) {
            cameraView.setCameraModule(cameraModule)
            Log.d(TAG, "CameraView connected to CameraModule")
        } else {
            Log.e(TAG, "CameraModule instance not found")
        }
        
        return cameraView
    }

    @ReactProp(name = "active")
    fun setActive(view: CameraView, active: Boolean) {
        Log.d(TAG, "Camera view active: $active")
        // Handle camera activation if needed
    }
} 