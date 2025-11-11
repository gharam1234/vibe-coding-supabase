import { NextResponse } from "next/server";
import { getSupabaseServiceRoleClient } from "@/lib/supabase";

interface PaymentStatusItem {
  transaction_key: string;
  user_id?: string;
  status: string;
  start_at: string;
  end_grace_at: string;
  created_at: string;
}

interface PaymentStatusResponse {
  success: boolean;
  isSubscribed: boolean;
  transactionKey?: string;
  message?: string;
  checklist: Array<{ step: string; completed: boolean }>;
}

/**
 * prompt.202 명세에 따른 체크리스트 정의
 * - 공통 전제: 테스트 목적이므로 사용자 식별값 없이 전체 payment 테이블 조회
 * - 실제 서비스 반영 시 user_id 또는 식별 조건 필수 (아래 TODO 참고)
 */
const CHECKLIST_STEPS = [
  "1단계: Supabase 데이터베이스 연결 확인",
  "2단계: payment 테이블에서 전체 데이터 조회 (최신순 정렬)",
  "3단계: transaction_key 기준 그룹화 및 최신 1건만 선별",
  "4단계: status='Paid' 및 유효기간(start_at <= now <= end_grace_at) 필터 적용",
  "5단계: 최종 결과 판단 및 메시지 생성",
] as const;

export async function GET(): Promise<NextResponse<PaymentStatusResponse>> {
  try {
    const checklist = CHECKLIST_STEPS.map((step) => ({ step, completed: false }));
    const markStepCompleted = (step: string) => {
      const target = checklist.find((item) => item.step === step);
      if (target) target.completed = true;
    };
    const respond = (
      success: boolean,
      isSubscribed: boolean,
      transactionKey: string | undefined,
      message: string | undefined,
      status: number
    ) =>
      NextResponse.json(
        {
          success,
          isSubscribed,
          transactionKey,
          message,
          checklist,
        },
        { status }
      );

    /**
     * 1단계: Supabase 데이터베이스 연결
     */
    const supabase = getSupabaseServiceRoleClient();
    markStepCompleted(CHECKLIST_STEPS[0]);

    /**
     * 2단계: 현재 시간 (UTC 기준)
     * prompt.202 명세: "시간 비교는 UTC 타임존을 기준으로 하며,
     * 클라이언트에서 Date.now() → ISO 문자열 → Supabase timestamptz 비교 순서를 유지한다."
     */
    const nowMs = Date.now(); // 현재 시간(UTC)을 밀리초 단위로 취득
    const nowUtcIso = new Date(nowMs).toISOString(); // ISO 문자열로 변환

    // 로깅 (PII 마스킹 규칙: transaction_key는 처음 10자리만 노출, user_id는 완전 마스킹)
    console.log(`[결제 상태 조회] 조회 시간(UTC): ${nowUtcIso}`);

    /**
     * 3단계: payment 테이블에서 전체 데이터 조회
     * 주석: Supabase SDK의 기본 select로는 그룹화가 어렵기 때문에
     * 다음 중 하나의 방식을 선택하여 구현 가능:
     * 옵션1) payments_latest_by_transaction 같은 View 를 미리 만들어 select 한다.
     * 옵션2) rpc('payments_latest_by_transaction') 형태의 서버 함수를 호출한다.
     *
     * 현재 구현: 클라이언트 사이드 그룹화 방식 사용
     * (서버 부하 최소화, 하지만 데이터량 많을 경우 View/RPC 권장)
     */
    const { data: allPayments, error: queryError } = await supabase
      .from("payment")
      .select("transaction_key, status, start_at, end_grace_at, created_at")
      .order("created_at", { ascending: false });

    markStepCompleted(CHECKLIST_STEPS[1]);

    if (queryError) {
      console.error("[결제 상태 조회] 데이터베이스 조회 오류:", queryError);
      return respond(false, false, undefined, "결제 데이터 조회에 실패했습니다.", 500);
    }

    console.log(`[결제 상태 조회] 조회된 결제 기록 수: ${allPayments?.length ?? 0}개`);

    /**
     * 4단계: transaction_key 기준 그룹화 및 최신 1건만 선별
     * prompt.202 명세: "각 그룹에서 created_at 기준 최신 1건만 남기기"
     */
    const paymentMap = new Map<string, PaymentStatusItem>();
    if (allPayments) {
      for (const payment of allPayments) {
        const key = payment.transaction_key;
        if (!key) continue;

        const existing = paymentMap.get(key);
        if (!existing) {
          paymentMap.set(key, payment as PaymentStatusItem);
          continue;
        }

        const existingCreated = new Date(existing.created_at).getTime();
        const currentCreated = new Date(payment.created_at).getTime();

        // null 또는 범위를 벗어난 값은 "Free" 처리
        if (Number.isNaN(existingCreated) || Number.isNaN(currentCreated)) {
          if (Number.isNaN(existingCreated) && !Number.isNaN(currentCreated)) {
            paymentMap.set(key, payment as PaymentStatusItem);
          }
          continue;
        }

        if (currentCreated > existingCreated) {
          paymentMap.set(key, payment as PaymentStatusItem);
        }
      }
    }

    markStepCompleted(CHECKLIST_STEPS[2]);

    console.log(`[결제 상태 조회] 그룹화 후 결제 기록 수: ${paymentMap.size}개`);

    /**
     * 5단계: status='Paid' 및 유효기간 필터 적용
     * 필터 조건:
     * 1) status === "Paid"
     * 2) start_at <= nowUtc <= end_grace_at (동일 타임존 비교, 경계값 포함)
     */
    const activePayments = Array.from(paymentMap.values()).filter((payment) => {
      // 조건 1: status 확인
      if (payment.status !== "Paid") return false;

      // 조건 2: 유효기간 확인 (UTC 기준)
      const startAt = new Date(payment.start_at).getTime();
      const endGraceAt = new Date(payment.end_grace_at).getTime();

      // 유효하지 않은 날짜는 제외 (null 또는 범위를 벗어난 값)
      if (Number.isNaN(startAt) || Number.isNaN(endGraceAt)) {
        return false;
      }

      const isInValidPeriod = startAt <= nowMs && nowMs <= endGraceAt;

      if (isInValidPeriod) {
        // 로깅: transaction_key 처음 10자리만 노출
        const maskedKey = payment.transaction_key.substring(0, 10) + "****";
        console.log(`[결제 상태 조회] 활성 구독 발견 (key: ${maskedKey}, period: ${payment.start_at} ~ ${payment.end_grace_at})`);
      }

      return isInValidPeriod;
    });

    markStepCompleted(CHECKLIST_STEPS[3]);

    /**
     * 최종 결과 판단
     * - 활성 결제 데이터 없음 → "Free" 상태
     * - 활성 결제 데이터 1건 이상 → "구독중" 상태 (최신 1건만 사용)
     */
    const isSubscribed = activePayments.length > 0;
    const transactionKey = isSubscribed ? activePayments[0].transaction_key : undefined;

    console.log(`[결제 상태 조회] 최종 판정: ${isSubscribed ? "구독중" : "Free"}`);

    markStepCompleted(CHECKLIST_STEPS[4]);

    return respond(
      true,
      isSubscribed,
      transactionKey,
      isSubscribed ? "구독중" : "Free",
      200
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "알 수 없는 오류";
    console.error("[결제 상태 조회] 예외 발생:", errorMessage);

    // 에러 상태도 체크리스트에 포함하여 반환
    const errorChecklist = CHECKLIST_STEPS.map((step) => ({
      step,
      completed: false,
    }));

    return NextResponse.json(
      {
        success: false,
        isSubscribed: false,
        message: "결제 상태 조회에 실패했습니다.",
        checklist: errorChecklist,
      },
      { status: 500 }
    );
  }
}
