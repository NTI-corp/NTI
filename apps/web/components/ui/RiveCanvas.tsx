"use client";

import React from "react";
import { useRive, Layout, Fit, Alignment } from "@rive-app/react-canvas";

interface RiveCanvasProps {
  src: string;
  fit?: "cover" | "contain";
  className?: string;
}

export function RiveCanvas({
  src,
  fit = "contain",
  className = "w-full h-full",
}: RiveCanvasProps) {
  const { RiveComponent } = useRive({
    src,
    artboard: "Artboard",
    stateMachine: "State Machine 1",
    autoplay: true,
    isTouchScrollEnabled: false,
    automaticallyHandleEvents: false,
    layout: new Layout({
      fit: fit === "cover" ? Fit.Cover : Fit.Contain,
      alignment: Alignment.Center,
    }),
  });

  return <RiveComponent className={className} />;
}
