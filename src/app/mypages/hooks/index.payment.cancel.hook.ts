"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseClient } from "@/lib/supabase";

export interface PaymentCancelChecklistItem {
  step: string;
  completed: boolean;
}

interface CancelSubscriptionArgs {
  transactionKey: string;
  onSuccess?: () => void;
  onError?: (message: string) => void;
}

// 체크리스트 단계 정의
const CHECKLIST_STEPS = [
  "1-1) 포트원 결제취소 요청 (PG: 토스페이먼츠)",
  "1-2) 구독취소 API 요청 (인증토큰 포함)",
  "1-3) 구독취소 이후 로직 완료 (알림메시지 및 페이지 이동)",
];

/**
 * 단계 완료 표시 함수
 */
const markStepCompleted = (
  setChecklist: React.Dispatch<React.SetStateAction<PaymentCancelChecklistItem[]>>,
  step: string
) => {
  setChecklist((prev) =>
    prev.map((item) =>
      item.step === step ? { ...item, completed: true } : item
    )
  );
};

export function usePaymentCancel() {
  const router = useRouter();
  const [isCancelling, setIsCancelling] = useState(false);
  const [checklist, setChecklist] = useState<PaymentCancelChecklistItem[]>(
    CHECKLIST_STEPS.map((step) => ({ step, completed: false }))
  );
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
      // 체크리스트 초기화
      setChecklist(CHECKLIST_STEPS.map((step) => ({ step, completed: false })));

      try {
        // 1-1) 포트원 결제취소 요청 (PG: 토스페이먼츠)
        // 참고: 포트원 결제취소는 서버 API(/api/payments/cancel)에서 처리됩니다.
        // 서버 API가 포트원 V2 API를 사용하여 결제 취소를 수행합니다.
        // 클라이언트에서는 구독취소 API 호출을 통해 포트원 결제취소도 함께 처리됩니다.

        // 1-2) 구독취소 API 요청 (인증토큰 포함)
        // Supabase 세션에서 인증 토큰 가져오기
        const supabase = getSupabaseClient();
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();

        if (sessionError || !session?.access_token) {
          throw new Error("인증 토큰을 가져올 수 없습니다. 다시 로그인해주세요.");
        }

        const authToken = session.access_token;

        // 구독취소 API 호출 (인증토큰 헤더 포함)
        // 이 API 호출 시 서버에서 포트원 결제취소도 함께 처리됩니다.
        const response = await fetch("/api/payments/cancel", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify({ transactionKey }),
        });

        const data = await response.json().catch(() => null);

        if (!response.ok || !data?.success) {
          throw new Error("구독 취소 요청이 실패했습니다.");
        }

        // 1-1) 포트원 결제취소 요청 완료 (서버 API에서 처리됨)
        markStepCompleted(setChecklist, CHECKLIST_STEPS[0]);
        // 1-2) 구독취소 API 요청 완료
        markStepCompleted(setChecklist, CHECKLIST_STEPS[1]);

        // 1-3) 구독취소 이후 로직 완료
        // 알림메시지: "구독이 취소되었습니다."
        alert("구독이 취소되었습니다.");
        markStepCompleted(setChecklist, CHECKLIST_STEPS[2]);

        // 이동할페이지: "/magazines"
        onSuccess?.();
        router.push("/magazines");
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "결제 취소 처리 중 알 수 없는 오류가 발생했습니다.";
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
