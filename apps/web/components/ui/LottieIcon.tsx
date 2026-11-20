"use client";

import React, { useEffect, useRef } from "react";
import { Lottie, type LottieHandle } from "lottie-react";

interface LottieIconProps {
  src: string;
  className?: string;
  playOnScroll?: boolean;
  loop?: boolean;
  isHovered?: boolean;
}

export function LottieIcon({
  src,
  className = "w-full h-full",
  playOnScroll = true,
  loop = false,
  isHovered,
}: LottieIconProps) {
  const lottieRef = useRef<LottieHandle>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hasPlayedScrollRef = useRef(false);

  useEffect(() => {
    if (isHovered) {
      lottieRef.current?.stop();
      lottieRef.current?.play();
    }
  }, [isHovered]);

  useEffect(() => {
    if (!playOnScroll || !containerRef.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !hasPlayedScrollRef.current) {
            hasPlayedScrollRef.current = true;
            lottieRef.current?.stop();
            lottieRef.current?.play();
          }
        });
      },
      { threshold: 0.2 }
    );
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [playOnScroll]);

  return (
    <div ref={containerRef} className={className}>
      <Lottie
        lottieRef={lottieRef}
        src={src}
        loop={loop}
        autoplay={false}
        subscriptions={{
          ready: () => {
            const inst = lottieRef.current;
            if (!inst) return;
            // Match sui.io initLotties: rest at final drawn frame (totalFrames - 1),
            // and play from frame 0 when scrolled in or hovered
            const lastFrame = Math.max(
              0,
              (inst.animationItem?.totalFrames ?? 2) - 1
            );
            inst.seek(lastFrame);
            if (playOnScroll && hasPlayedScrollRef.current) {
              inst.stop();
              inst.play();
            }
          },
          complete: () => {
            const inst = lottieRef.current;
            if (!inst || loop) return;
            const lastFrame = Math.max(
              0,
              (inst.animationItem?.totalFrames ?? 2) - 1
            );
            inst.seek(lastFrame);
          },
        }}
        className="w-full h-full"
      />
    </div>
  );
}
