import { useState, useRef, useEffect } from 'react';
import { getFullImageUrl } from '../utils/imageUrl';

const ALLOWED_FORMATS = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

export default function ImageUploader({
  currentImage = null,
  onImageSelect = () => {},
  onImageRemove = () => {},
  disabled = false,
  showUploadButton = true
}) {
  const [imagePreview, setImagePreview] = useState(null);
  const [imageError, setImageError] = useState('');
  const [showCamera, setShowCamera] = useState(false);
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [stream, setStream] = useState(null);

  useEffect(() => {
    return () => {
      // Cleanup: Stop camera stream when component unmounts
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [stream]);

  const validateImage = (file) => {
    setImageError('');
    
    if (!file) return;

    if (!ALLOWED_FORMATS.includes(file.type)) {
      setImageError('Invalid file type. Only JPG, PNG, and WEBP are allowed.');
      return false;
    }

    if (file.size > MAX_FILE_SIZE) {
      setImageError('File size exceeds 5MB limit');
      return false;
    }

    // Create preview
    const reader = new FileReader();
    reader.onload = (e) => {
      setImagePreview(e.target.result);
      onImageSelect(file, e.target.result);
    };
    reader.readAsDataURL(file);
    return true;
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      validateImage(file);
    }
  };

  const handleCameraCapture = async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setImageError('Camera not supported on this device');
      return;
    }

    try {
      setShowCamera(true);
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } }
      });
      setStream(mediaStream);
      
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        videoRef.current.play();
        setCameraActive(true);
      }
    } catch (err) {
      setImageError('Unable to access camera. Please check permissions.');
      setShowCamera(false);
      console.error('Camera error:', err);
    }
  };

  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const context = canvasRef.current.getContext('2d');
      const video = videoRef.current;
      
      // Set canvas size to video dimensions
      canvasRef.current.width = video.videoWidth;
      canvasRef.current.height = video.videoHeight;
      
      // Draw video frame to canvas
      context.drawImage(video, 0, 0);
      
      // Convert canvas to blob
      canvasRef.current.toBlob((blob) => {
        if (blob) {
          const file = new File([blob], `camera-capture-${Date.now()}.jpg`, { type: 'image/jpeg' });
          validateImage(file);
          stopCamera();
        }
      }, 'image/jpeg', 0.95);
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
    setCameraActive(false);
    setShowCamera(false);
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };

  const removeImage = () => {
    setImagePreview(null);
    setImageError('');
    onImageRemove();
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const displayImage = imagePreview || (currentImage && getFullImageUrl(currentImage));

  return (
    <div>
      <label className="form-label fw-600 small text-uppercase text-muted mb-3">Profile Image</label>
      
      {/* Camera Modal */}
      {showCamera && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.95)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '20px',
          flexDirection: 'column',
          gap: '20px'
        }}>
          <video
            ref={videoRef}
            style={{
              width: '100%',
              maxWidth: '500px',
              maxHeight: '70vh',
              borderRadius: '12px',
              backgroundColor: '#000',
              objectFit: 'cover'
            }}
          />
          <canvas ref={canvasRef} style={{ display: 'none' }} />
          
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', justifyContent: 'center' }}>
            <button
              type="button"
              onClick={capturePhoto}
              disabled={!cameraActive}
              style={{
                padding: '12px 24px',
                backgroundColor: '#00aeef',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: '14px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                opacity: cameraActive ? 1 : 0.5
              }}
            >
              <i className="bi bi-camera-fill" />
              Capture Photo
            </button>
            <button
              type="button"
              onClick={stopCamera}
              style={{
                padding: '12px 24px',
                backgroundColor: 'transparent',
                color: 'white',
                border: '2px solid rgba(255, 255, 255, 0.3)',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: '14px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              <i className="bi bi-x-lg" />
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Main Upload Area */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '16px',
        padding: '24px',
        borderRadius: '12px',
        border: '2px dashed var(--card-border)',
        backgroundColor: 'var(--bg-subtle)'
      }}>
        {/* Image Preview Circle */}
        <div style={{
          width: '120px',
          height: '120px',
          borderRadius: '50%',
          backgroundColor: displayImage ? 'transparent' : 'linear-gradient(135deg, #00aeef, #008ecc)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          flexShrink: 0,
          border: '3px solid rgba(0, 174, 239, 0.2)',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)'
        }}>
          {displayImage ? (
            <img 
              src={displayImage} 
              alt="Profile Preview" 
              style={{ 
                width: '100%', 
                height: '100%', 
                objectFit: 'cover' 
              }} 
              onError={(e) => {
                e.target.style.display = 'none';
                e.target.parentElement.style.background = 'linear-gradient(135deg, #00aeef, #008ecc)';
                if (e.target.parentElement.querySelector('i')) {
                  e.target.parentElement.querySelector('i').style.display = 'flex';
                }
              }}
            />
          ) : (
            <i className="bi bi-image" style={{ fontSize: 48, color: 'white' }} />
          )}
        </div>

        {/* Status Text */}
        {displayImage ? (
          <div style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: 500 }}>
            ✓ Image selected
          </div>
        ) : (
          <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
            No image selected
          </div>
        )}

        {/* Action Buttons */}
        <div style={{
          display: 'flex',
          gap: '12px',
          flexWrap: 'wrap',
          justifyContent: 'center',
          width: '100%'
        }}>
          <input
            ref={fileInputRef}
            type="file"
            id="profile-image-input"
            accept="image/jpeg,image/png,image/webp"
            onChange={handleFileChange}
            style={{ display: 'none' }}
            disabled={disabled}
          />

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="btn btn-accent btn-sm"
            style={{ 
              borderRadius: '8px', 
              padding: '8px 16px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '13px'
            }}
            disabled={disabled}
          >
            <i className="bi bi-cloud-upload" />
            Upload File
          </button>

          <button
            type="button"
            onClick={handleCameraCapture}
            className="btn btn-info btn-sm"
            style={{ 
              borderRadius: '8px', 
              padding: '8px 16px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '13px',
              backgroundColor: '#17a2b8',
              borderColor: '#17a2b8',
              color: 'white'
            }}
            disabled={disabled}
          >
            <i className="bi bi-camera-fill" />
            Take Photo
          </button>
        </div>

        {/* Remove Button (shown when image is selected) */}
        {(imagePreview || currentImage) && (
          <button
            type="button"
            onClick={removeImage}
            className="btn btn-outline-danger btn-sm"
            style={{ 
              borderRadius: '8px', 
              padding: '8px 16px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '13px'
            }}
            disabled={disabled}
          >
            <i className="bi bi-trash" />
            Remove Image
          </button>
        )}

        {/* Error Message */}
        {imageError && (
          <div style={{ 
            color: '#dc3545', 
            fontSize: '12px', 
            textAlign: 'center',
            backgroundColor: 'rgba(220, 53, 69, 0.1)',
            padding: '8px 12px',
            borderRadius: '6px',
            width: '100%'
          }}>
            <i className="bi bi-exclamation-circle me-2" />
            {imageError}
          </div>
        )}

        {/* Help Text */}
        <div style={{ 
          fontSize: '11px', 
          color: 'var(--text-muted)', 
          textAlign: 'center',
          marginTop: '8px'
        }}>
          <div>JPG, PNG or WEBP • Max 5MB</div>
          <div style={{ marginTop: '4px', fontSize: '10px' }}>
            Upload a file or take a photo with your camera
          </div>
        </div>
      </div>
    </div>
  );
}
