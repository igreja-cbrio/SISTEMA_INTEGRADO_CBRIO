"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface MultistepStep {
  id: string;
  title: string;
}

interface MultistepFormShellProps {
  steps: MultistepStep[];
  currentStep: number;
  onNext: () => void;
  onPrev: () => void;
  onSubmit: () => void;
  isSubmitting?: boolean;
  isStepValid?: boolean;
  submitLabel?: string;
  children: React.ReactNode;
  className?: string;
  hideFooter?: boolean;
}

const contentVariants = {
  hidden: { opacity: 0, x: 50 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.3 } },
  exit: { opacity: 0, x: -50, transition: { duration: 0.2 } },
};

export function MultistepFormShell({
  steps,
  currentStep,
  onNext,
  onPrev,
  onSubmit,
  isSubmitting = false,
  isStepValid = true,
  submitLabel = "Enviar",
  children,
  className,
  hideFooter = false,
}: MultistepFormShellProps) {
  const isLast = currentStep === steps.length - 1;
  const progress = ((currentStep + 1) / steps.length) * 100;

  return (
    <div className={cn("w-full", className)}>
      {/* Progress indicator */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          {steps.map((step, index) => (
            <div key={step.id} className="flex flex-col items-center flex-1">
              <motion.div
                className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300 border-2",
                  index < currentStep
                    ? "bg-[#00B39D] border-[#00B39D] text-white"
                    : index === currentStep
                      ? "border-[#00B39D] text-[#00B39D] bg-[#00B39D]/10"
                      : "border-[var(--cbrio-border)] text-[var(--cbrio-text3)] bg-transparent"
                )}
                whileTap={{ scale: 0.95 }}
              >
                {index < currentStep ? (
                  <Check className="h-4 w-4" />
                ) : (
                  index + 1
                )}
              </motion.div>
              <span
                className={cn(
                  "text-[10px] mt-1.5 text-center leading-tight hidden sm:block",
                  index <= currentStep
                    ? "text-[#00B39D] font-semibold"
                    : "text-[var(--cbrio-text3)]"
                )}
              >
                {step.title}
              </span>
            </div>
          ))}
        </div>

        {/* Progress bar */}
        <div className="h-1 w-full rounded-full bg-[var(--cbrio-border)] overflow-hidden">
          <motion.div
            className="h-full rounded-full bg-[#00B39D]"
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.4, ease: "easeInOut" }}
          />
        </div>
      </div>

      {/* Content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={currentStep}
          variants={contentVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
        >
          {children}
        </motion.div>
      </AnimatePresence>

      {/* Footer */}
      {!hideFooter && (
        <div className="flex justify-between items-center pt-6 mt-4 border-t border-[var(--cbrio-border)]">
          <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
            <Button
              type="button"
              variant="outline"
              onClick={onPrev}
              disabled={currentStep === 0}
              className="flex items-center gap-1 rounded-xl"
            >
              <ChevronLeft className="h-4 w-4" /> Voltar
            </Button>
          </motion.div>

          <span className="text-xs text-[var(--cbrio-text3)]">
            {currentStep + 1} de {steps.length}
          </span>

          <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
            <Button
              type="button"
              onClick={isLast ? onSubmit : onNext}
              disabled={!isStepValid || isSubmitting}
              className="flex items-center gap-1 rounded-xl bg-[#00B39D] hover:bg-[#009985] text-white"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Enviando...
                </>
              ) : isLast ? (
                <>
                  {submitLabel} <Check className="h-4 w-4" />
                </>
              ) : (
                <>
                  Próximo <ChevronRight className="h-4 w-4" />
                </>
              )}
            </Button>
          </motion.div>
        </div>
      )}
    </div>
  );
}
