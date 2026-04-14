import { useState, useRef, useCallback, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import { voluntariado } from '@/api';
import * as faceapi from '@vladmandic/face-api';

const MODEL_URL = '/models/face-api';
let modelsLoaded = false;

async function loadModels() {
  if (modelsLoaded) return;
  await Promise.all([
    faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
    faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
    faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
  ]);
  modelsLoaded = true;
}

export function useFaceDetection(options?: { autoDetect?: boolean }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDetecting, setIsDetecting] = useState(false);
  const [descriptor, setDescriptor] = useState<Float32Array | null>(null);
  const [error, setError] = useState<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');

  const startCamera = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      await loadModels();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode, width: { ideal: 640 }, height: { ideal: 480 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setIsLoading(false);
    } catch (err: any) {
      setError(err.message || 'Erro ao acessar camera');
      setIsLoading(false);
    }
  }, [facingMode]);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const detectFace = useCallback(async () => {
    if (!videoRef.current || isDetecting) return null;
    setIsDetecting(true);
    try {
      const detection = await faceapi
        .detectSingleFace(videoRef.current)
        .withFaceLandmarks()
        .withFaceDescriptor();
      if (detection) {
        setDescriptor(detection.descriptor);
        // Draw on canvas
        if (canvasRef.current && videoRef.current) {
          const dims = faceapi.matchDimensions(canvasRef.current, videoRef.current, true);
          const resized = faceapi.resizeResults(detection, dims);
          faceapi.draw.drawDetections(canvasRef.current, resized);
        }
        return detection.descriptor;
      }
      return null;
    } finally {
      setIsDetecting(false);
    }
  }, [isDetecting]);

  const switchCamera = useCallback(() => {
    stopCamera();
    setFacingMode(f => f === 'user' ? 'environment' : 'user');
  }, [stopCamera]);

  useEffect(() => {
    return () => { stopCamera(); };
  }, [stopCamera]);

  return { videoRef, canvasRef, isLoading, isDetecting, descriptor, error, startCamera, stopCamera, detectFace, switchCamera, facingMode };
}

export function useFaceEnrollProfile() {
  return useMutation({
    mutationFn: (data: { profile_id: string; descriptor: number[]; photo_url?: string }) =>
      voluntariado.face.saveProfile(data),
  });
}

export function useFaceEnrollQrCode() {
  return useMutation({
    mutationFn: (data: { qrcode_id: string; descriptor: number[]; photo_url?: string }) =>
      voluntariado.face.saveQrcode(data),
  });
}

export function useFaceMatch() {
  return useMutation({
    mutationFn: (data: { descriptor: number[]; threshold?: number }) =>
      voluntariado.face.match(data.descriptor, data.threshold),
  });
}
