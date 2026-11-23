"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

interface ModalShellProps {
  open: boolean;
  onClose: () => void;
  canClose?: boolean;
  labelledBy?: string;
  maxWidthClass?: string;
  children: ReactNode;
}

/**
 * Shared institutional modal portal for NTI Terminal.
 * Handles document.body portal, z-[100] stacking above all chrome,
 * body scroll locking, Escape key, backdrop click, and viewport-safe scrolling.
 */
export function ModalShell({
  open,
  onClose,
  canClose = true,
  labelledBy,
  maxWidthClass = "max-w-md",
  children,
}: ModalShellProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && canClose) {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, canClose, onClose]);

  if (!mounted || !open) return null;

  return createPortal(
    <div
      role="presentation"
      onClick={() => {
        if (canClose) onClose();
      }}
      className="modal-backdrop-enter fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        onClick={(e) => e.stopPropagation()}
        className={`modal-card-enter max-h-[calc(100dvh-2rem)] w-full ${maxWidthClass} overflow-y-auto border border-[#26262A] bg-[#161618] shadow-[0_24px_80px_rgba(0,0,0,0.85)]`}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
