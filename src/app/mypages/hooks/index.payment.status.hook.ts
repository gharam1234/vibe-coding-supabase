"use client";

import { useState, useCallback, useEffect } from "react";

export interface PaymentStatusChecklistItem {
  step: string;
  completed: boolean;
}

interface PaymentStatusResponse {
  success: boolean;
  isSubscribed: boolean;
  transactionKey?: string;
  message?: string;
  checklist: PaymentStatusChecklistItem[];
}

interface UsePaymentStatusResult {
  isSubscribed: boolean;
  transactionKey: string | undefined;
  statusMessage: string;
  isLoading: boolean;
  error: string | null;
  checklist: PaymentStatusChecklistItem[];
  refetch: () => Promise<void>;
}

export function usePaymentStatus(): UsePaymentStatusResult {
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [transactionKey, setTransactionKey] = useState<string | undefined>();
  const [statusMessage, setStatusMessage] = useState("로딩 중...");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [checklist, setChecklist] = useState<PaymentStatusChecklistItem[]>([]);

  const fetchPaymentStatus = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/payments/status", {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      });

      const data = (await response.json().catch(() => null)) as PaymentStatusResponse | null;
      setChecklist(data?.checklist ?? []);

      if (!response.ok || !data?.success) {
        throw new Error("결제 상태 조회에 실패했습니다.");
      }

      setIsSubscribed(data.isSubscribed);
      setTransactionKey(data.transactionKey);
      setStatusMessage(data.message ?? (data.isSubscribed ? "구독중" : "Free"));
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "결제 상태 조회 중 알 수 없는 오류가 발생했습니다.";
      setError(message);
      setIsSubscribed(false);
      setTransactionKey(undefined);
      setStatusMessage("Free");
    } finally {
      setIsLoading(false);
    }
  }, []);

  // 컴포넌트 마운트 시 결제 상태 조회
  useEffect(() => {
    fetchPaymentStatus();
  }, [fetchPaymentStatus]);

  return {
    isSubscribed,
    transactionKey,
    statusMessage,
    isLoading,
    error,
    checklist,
    refetch: fetchPaymentStatus,
  };
}
