#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>

@interface RCT_EXTERN_MODULE(CameraModule, RCTEventEmitter)

RCT_EXTERN_METHOD(startCamera:(NSString *)cameraType
                 resolver:(RCTPromiseResolveBlock)resolve
                 rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(stopCamera:(RCTPromiseResolveBlock)resolve
                 rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(switchCamera:(NSString *)cameraType
                 resolver:(RCTPromiseResolveBlock)resolve
                 rejecter:(RCTPromiseRejectBlock)reject)

@end 