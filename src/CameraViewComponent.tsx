import React from 'react';
import { requireNativeComponent, ViewProps } from 'react-native';

interface CameraViewProps extends ViewProps {
  active?: boolean;
}

// Import the native camera view component
const NativeCameraView = requireNativeComponent<CameraViewProps>('CameraView');

export const CameraViewComponent: React.FC<CameraViewProps> = (props) => {
  return <NativeCameraView {...props} />;
};

export default CameraViewComponent; 