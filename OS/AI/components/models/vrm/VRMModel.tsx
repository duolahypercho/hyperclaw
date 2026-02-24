// src/components/models/vrm/VRMModel.tsx
"use client";

import React, { useRef, useEffect, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Environment } from "@react-three/drei";
import { VRM } from "@pixiv/three-vrm";
import { AnimationMixer } from "three";
import { loadVrm } from "./VRMLoader";
import { VRMBlink } from "./VRMBlink";
import { VRMIdleEyeSaccades } from "./VRMAnimations";

interface VRMModelProps {
  modelSrc: string;
  animationSrc?: string;
  lookAtTarget?: { x: number; y: number; z: number };
  className?: string;
}

function VRMScene({
  modelSrc,
  animationSrc,
  lookAtTarget,
}: Omit<VRMModelProps, "className">) {
  const { scene } = useThree();
  const vrmRef = useRef<VRM>();
  const mixerRef = useRef<AnimationMixer>();
  const blinkRef = useRef(new VRMBlink());
  const eyeSaccadesRef = useRef(new VRMIdleEyeSaccades());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const loadModel = async () => {
      try {
        setLoading(true);
        setError(null);

        const result = await loadVrm(modelSrc, {
          scene,
          lookAt: true,
          onProgress: (progress) => {
            console.log(
              "Loading progress:",
              (progress.loaded / progress.total) * 100
            );
          },
        });

        if (!mounted || !result) return;

        vrmRef.current = result._vrm;

        setLoading(false);
      } catch (err) {
        console.error("Failed to load VRM model:", err);
        setError(err instanceof Error ? err.message : "Failed to load model");
        setLoading(false);
      }
    };

    loadModel();

    return () => {
      mounted = false;
    };
  }, [modelSrc, animationSrc, scene]);

  useFrame((state, delta) => {
    if (!vrmRef.current) return;

    // Update VRM
    vrmRef.current.update(delta);
    vrmRef.current.lookAt?.update?.(delta);
    vrmRef.current.springBoneManager?.update(delta);

    // Update animations
    mixerRef.current?.update(delta);
    blinkRef.current.update(vrmRef.current, delta);

    if (lookAtTarget) {
      eyeSaccadesRef.current.update(vrmRef.current, lookAtTarget, delta);
    }
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-white">Loading VRM model...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-red-500">Error: {error}</div>
      </div>
    );
  }

  return null;
}

export default function VRMModel({
  modelSrc,
  animationSrc,
  lookAtTarget,
  className = "",
}: VRMModelProps) {
  return (
    <div className={`w-full h-full ${className}`}>
      <Canvas camera={{ position: [0, 1.5, 3], fov: 50 }}>
        <ambientLight intensity={0.5} />
        <directionalLight position={[10, 10, 5]} intensity={1} />
        <Environment preset="sunset" />

        <VRMScene
          modelSrc={modelSrc}
          animationSrc={animationSrc}
          lookAtTarget={lookAtTarget}
        />

        <OrbitControls
          enablePan={false}
          maxPolarAngle={Math.PI / 2}
          minDistance={1}
          maxDistance={5}
        />
      </Canvas>
    </div>
  );
}
