"use client";

import { useState, useCallback, useEffect } from "react";
import { getSupabaseClient } from "@/lib/supabase";

/**
 * prompt.202.func.payment.status.user_id.txt 명세에 따른 결제 상태 조회 Hook
 *
 * 기능:
 * - payment 테이블 조회 및 상태 판정
 * - user_id 필터링 (내 결제 정보만)
 * - transaction_key 그룹화 및 각 그룹에서 created_at 최신 1건 선별
 * - status='Paid' 및 유효기간 필터링 (start_at <= 현재시각 <= end_grace_at)
 * - 체크리스트 형태의 진행 상황 반환
 *
 * 유효 구독 조건:
 * 1. user_id === 로그인된 user_id
 * 2. status === "Paid"
 * 3. start_at <= 현재시각(UTC) <= end_grace_at
 */

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

/**
 * 에러 토스트 문구 정의 (prompt.202 요구사항)
 * 취소 호출 실패 시 노출할 에러 문구
 */
const ERROR_MESSAGES = {
  fetchFailed: "결제 상태 조회에 실패했습니다.",
  parseError: "결제 상태 조회 중 알 수 없는 오류가 발생했습니다.",
  networkError: "네트워크 연결을 확인해주세요.",
} as const;

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
      // Supabase 세션에서 인증 토큰 가져오기
      const supabase = getSupabaseClient();
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();

      if (sessionError || !session?.access_token) {
        throw new Error("인증 토큰을 가져올 수 없습니다. 다시 로그인해주세요.");
      }

      const authToken = session.access_token;

      /**
       * API 호출: /api/payments/status
       * - 서버에서 Supabase 쿼리 수행
       * - 체크리스트 단계별 진행 상황 반환
       * - isLoading 유지: UI 차단 및 스켈레톤/스피너 정책 수립
       */
      const response = await fetch("/api/payments/status", {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
      });

      const data = (await response.json().catch(() => null)) as PaymentStatusResponse | null;

      // 응답에서 체크리스트 추출 (성공/실패 모두)
      setChecklist(data?.checklist ?? []);

      if (!response.ok || !data?.success) {
        throw new Error(ERROR_MESSAGES.fetchFailed);
      }

      // 결제 상태 업데이트
      setIsSubscribed(data.isSubscribed);
      setTransactionKey(data.transactionKey);

      /**
       * 메시지 판정:
       * - 구독중: "구독중" (API 응답 메시지 또는 기본값)
       * - 무료: "Free" (API 응답 메시지 또는 기본값)
       * - 참고: 취소 호출 시 transaction_key와 payment_id 전달
       *   (실제 서비스: 추후 user_id 추가 필수)
       */
      setStatusMessage(data.message ?? (data.isSubscribed ? "구독중" : "Free"));
    } catch (err) {
      const message = err instanceof Error ? err.message : ERROR_MESSAGES.parseError;
      setError(message);

      // 에러 발생 시 무료 상태로 초기화
      setIsSubscribed(false);
      setTransactionKey(undefined);
      setStatusMessage("Free");
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * 컴포넌트 마운트 시 결제 상태 조회
   * useEffect 의존성: fetchPaymentStatus (useCallback으로 메모이제이션됨)
   */
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
