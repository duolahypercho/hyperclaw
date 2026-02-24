import React, { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { useMusicPlayer } from "../providers/musicProvider";

const AudioVisualizer: React.FC = () => {
  const { audioState } = useMusicPlayer();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!audioState.currentAudio || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Type guard to ensure currentAudio is not null
    const currentAudio = audioState.currentAudio;
    if (!currentAudio) return;

    const resizeCanvas = () => {
      canvas.width = canvas.offsetWidth * window.devicePixelRatio;
      canvas.height = canvas.offsetHeight * window.devicePixelRatio;
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    };

    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);

    let animationId: number;
    let time = 0;

    const animate = () => {
      if (!ctx) return;

      const width = canvas.offsetWidth;
      const height = canvas.offsetHeight;

      // Clear canvas
      ctx.clearRect(0, 0, width, height);

      const centerX = width / 2;
      const centerY = height / 2;
      const maxRadius = Math.min(width, height) / 2 - 10;

      // Set visual style based on playing state
      if (audioState.isPlaying) {
        ctx.strokeStyle = "hsl(var(--primary))";
        ctx.globalAlpha = 1;
      } else {
        ctx.strokeStyle = "hsl(var(--primary))";
        ctx.globalAlpha = 0.4; // Dimmed when paused
      }
      ctx.lineWidth = 1.5;

      // Different visualization patterns based on audio type
      switch (currentAudio.type) {
        case "binaural":
          // Draw multiple concentric circles with wave effect for binaural beats
          for (let radius = 10; radius < maxRadius; radius += 8) {
            ctx.beginPath();

            for (let angle = 0; angle < Math.PI * 2; angle += 0.1) {
              const frequency = currentAudio.beatFrequency;
              // If not playing, show static visualization
              const amplitude = audioState.isPlaying
                ? Math.sin(time * frequency * 0.01) * 0.3 + 0.7
                : 0.7; // Static amplitude when stopped
              const waveRadius = audioState.isPlaying
                ? radius + Math.sin(angle * 3 + time * 0.05) * 3 * amplitude
                : radius + Math.sin(angle * 3) * 3 * amplitude; // Static wave when stopped

              const x = centerX + Math.cos(angle) * waveRadius;
              const y = centerY + Math.sin(angle) * waveRadius;

              if (angle === 0) {
                ctx.moveTo(x, y);
              } else {
                ctx.lineTo(x, y);
              }
            }

            ctx.closePath();
            ctx.stroke();
          }
          break;

        case "isochronic":
          // Draw pulsing circles for isochronic tones
          for (let radius = 10; radius < maxRadius; radius += 12) {
            ctx.beginPath();
            const frequency = currentAudio.beatFrequency;
            // If not playing, show static visualization
            const pulse = audioState.isPlaying
              ? Math.sin(time * frequency * 0.02) * 0.5 + 0.5
              : 0.5; // Static pulse when stopped
            const pulseRadius = radius * (0.8 + pulse * 0.4);

            for (let angle = 0; angle < Math.PI * 2; angle += 0.1) {
              const x = centerX + Math.cos(angle) * pulseRadius;
              const y = centerY + Math.sin(angle) * pulseRadius;

              if (angle === 0) {
                ctx.moveTo(x, y);
              } else {
                ctx.lineTo(x, y);
              }
            }

            ctx.closePath();
            ctx.stroke();
          }
          break;

        case "audioStream":
          // Draw smooth, flowing waves for lofi music
          for (let radius = 15; radius < maxRadius; radius += 10) {
            ctx.beginPath();

            for (let angle = 0; angle < Math.PI * 2; angle += 0.05) {
              const frequency = 0.5; // Slower, more relaxed
              // If not playing, show static visualization
              const amplitude = audioState.isPlaying
                ? Math.sin(time * frequency * 0.01) * 0.2 + 0.8
                : 0.8; // Static amplitude when stopped
              const waveRadius = audioState.isPlaying
                ? radius + Math.sin(angle * 2 + time * 0.02) * 5 * amplitude
                : radius + Math.sin(angle * 2) * 5 * amplitude; // Static wave when stopped

              const x = centerX + Math.cos(angle) * waveRadius;
              const y = centerY + Math.sin(angle) * waveRadius;

              if (angle === 0) {
                ctx.moveTo(x, y);
              } else {
                ctx.lineTo(x, y);
              }
            }

            ctx.closePath();
            ctx.stroke();
          }
          break;

        default:
          // Default visualization
          for (let radius = 10; radius < maxRadius; radius += 8) {
            ctx.beginPath();

            for (let angle = 0; angle < Math.PI * 2; angle += 0.1) {
              // If not playing, show static visualization
              const waveRadius = audioState.isPlaying
                ? radius + Math.sin(angle * 3 + time * 0.05) * 3
                : radius + Math.sin(angle * 3) * 3; // Static wave when stopped

              const x = centerX + Math.cos(angle) * waveRadius;
              const y = centerY + Math.sin(angle) * waveRadius;

              if (angle === 0) {
                ctx.moveTo(x, y);
              } else {
                ctx.lineTo(x, y);
              }
            }

            ctx.closePath();
            ctx.stroke();
          }
      }

      // Add pause indicator overlay when not playing
      if (!audioState.isPlaying) {
        ctx.globalAlpha = 0.3;
        ctx.fillStyle = "hsl(var(--muted-foreground))";
        ctx.font = "bold 24px system-ui";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("⏸", centerX, centerY);
        ctx.globalAlpha = 1; // Reset alpha
      }

      // Always continue animation for smooth UX
      time += 1;
      animationId = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      window.removeEventListener("resize", resizeCanvas);
      cancelAnimationFrame(animationId);
    };
  }, [audioState.isPlaying, audioState.currentAudio]);

  if (!audioState.currentAudio) return null;

  return (
    <motion.div
      className={`w-full h-full bg-gradient-to-br from-primary/20 to-secondary/20 rounded-xl overflow-hidden relative transition-all duration-300 ${
        !audioState.isPlaying ? "ring-2 ring-muted/30" : ""
      }`}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{
        opacity: audioState.isPlaying ? 1 : 0.7,
        scale: 1,
      }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ duration: 0.3 }}
    >
      <canvas
        ref={canvasRef}
        className="w-full h-full"
        style={{ display: "block" }}
      />
    </motion.div>
  );
};

export default AudioVisualizer;
