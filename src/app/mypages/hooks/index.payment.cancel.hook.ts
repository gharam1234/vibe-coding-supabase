"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";

export interface PaymentCancelChecklistItem {
  step: string;
  completed: boolean;
}

interface PaymentCancelResponse {
  success: boolean;
  checklist: PaymentCancelChecklistItem[];
}

interface CancelSubscriptionArgs {
  transactionKey: string;
  onSuccess?: () => void;
  onError?: (message: string) => void;
}

export function usePaymentCancel() {
  const router = useRouter();
  const [isCancelling, setIsCancelling] = useState(false);
  const [checklist, setChecklist] = useState<PaymentCancelChecklistItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  const cancelSubscription = useCallback(
    async ({ transactionKey, onSuccess, onError }: CancelSubscriptionArgs) => {
      if (!transactionKey) {
        const message = "유효한 transactionKey가 없습니다.";
        setError(message);
        onError?.(message);
        alert(message);
        return;
      }

      setIsCancelling(true);
      setError(null);

      try {
        const response = await fetch("/api/payments/cancel", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ transactionKey }),
        });

        const data = (await response.json().catch(() => null)) as PaymentCancelResponse | null;
        setChecklist(data?.checklist ?? []);

        if (!response.ok || !data?.success) {
          throw new Error("구독 취소 요청이 실패했습니다.");
        }

        onSuccess?.();
        alert("구독이 취소되었습니다.");
        router.push("/magazines");
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "결제 취소 처리 중 알 수 없는 오류가 발생했습니다.";
        setError(message);
        onError?.(message);
        alert(message);
      } finally {
        setIsCancelling(false);
      }
    },
    [router]
  );

  return { cancelSubscription, isCancelling, checklist, error };
}
