import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
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
 * 인가: 가장 간단한 방식으로 Supabase 세션 확인
 */
async function getUserIdFromSession(request: NextRequest): Promise<string | null> {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      return null;
    }

    // Authorization 헤더에서 토큰 확인 (가장 간단한 방식)
    const authHeader = request.headers.get("authorization");
    const token = authHeader?.replace("Bearer ", "");

    if (!token) {
      return null;
    }

    // Supabase 클라이언트 생성 및 사용자 확인
    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      return null;
    }

    return user.id;
  } catch (error) {
    console.error("세션 확인 중 오류:", error);
    return null;
  }
}

/**
 * prompt.202.func.payment.status.user_id.txt 명세에 따른 체크리스트 정의
 * 프롬프트 구조:
 * 1. 조회시나리오
 *    1-1) payment 테이블의 목록 조회
 *        1-1-1) 내 결제 정보만 필터링: user_id === 로그인된 user_id
 *        1-1-2) 그룹화: transaction_key 그룹화, 각 그룹에서 created_at 최신 1건씩 추출
 *        1-1-3) 위 그룹 결과에서 조회: status === "Paid", start_at <= 현재시각 <= end_grace_at
 *    1-2) 조회 결과에 따른 로직 완성
 */
const CHECKLIST_STEPS = [
  "1단계: Supabase 데이터베이스 연결 확인",
  "2단계: 인가 확인 (로그인된 user_id 추출)",
  "1-1-1) payment 테이블 목록 조회 - 내 결제 정보만 필터링 (user_id === 로그인된 user_id)",
  "1-1-2-1) transaction_key 기준 그룹화",
  "1-1-2-2) 각 그룹에서 created_at 최신 1건씩 추출",
  "1-1-3) 위 그룹 결과에서 조회 (status === 'Paid', start_at <= 현재시각 <= end_grace_at)",
  "1-2) 조회 결과에 따른 로직 완성 (상태메시지: 구독중/Free, 버튼 활성화 여부 판단, transaction_key 전달)",
] as const;

export async function GET(request: NextRequest): Promise<NextResponse<PaymentStatusResponse>> {
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
     * 2단계: 인가 확인 (로그인된 user_id 추출)
     */
    const userId = await getUserIdFromSession(request);
    if (!userId) {
      console.warn("인가 실패: 유효한 세션이 없습니다");
      return respond(false, false, undefined, "로그인이 필요합니다.", 401);
    }
    markStepCompleted(CHECKLIST_STEPS[1]);

    /**
     * 현재 시간 (UTC 기준)
     * prompt.202 명세: "시간 비교는 UTC 타임존을 기준으로 하며,
     * 클라이언트에서 Date.now() → ISO 문자열 → Supabase timestamptz 비교 순서를 유지한다."
     */
    const nowMs = Date.now(); // 현재 시간(UTC)을 밀리초 단위로 취득
    const nowUtcIso = new Date(nowMs).toISOString(); // ISO 문자열로 변환

    // 로깅 (PII 마스킹 규칙: transaction_key는 처음 10자리만 노출, user_id는 완전 마스킹)
    console.log(`[결제 상태 조회] 조회 시간(UTC): ${nowUtcIso}, user_id: ${userId.substring(0, 8)}****`);

    /**
     * 1-1-1) payment 테이블 목록 조회 - 내 결제 정보만 필터링
     * user_id === 로그인된 user_id
     */
    const { data: allPayments, error: queryError } = await supabase
      .from("payment")
      .select("transaction_key, status, start_at, end_grace_at, created_at, user_id")
      .eq("user_id", userId) // 내 결제 정보만 필터링
      .order("created_at", { ascending: false });

    markStepCompleted(CHECKLIST_STEPS[2]);

    if (queryError) {
      console.error("[결제 상태 조회] 데이터베이스 조회 오류:", queryError);
      return respond(false, false, undefined, "결제 데이터 조회에 실패했습니다.", 500);
    }

    console.log(`[결제 상태 조회] 조회된 결제 기록 수: ${allPayments?.length ?? 0}개`);

    /**
     * 1-1-2-1) 그룹화: transaction_key 그룹화
     */
    const paymentMap = new Map<string, PaymentStatusItem[]>();
    if (allPayments) {
      for (const payment of allPayments) {
        const key = payment.transaction_key;
        if (!key) continue;

        if (!paymentMap.has(key)) {
          paymentMap.set(key, []);
        }
        paymentMap.get(key)!.push(payment as PaymentStatusItem);
      }
    }

    markStepCompleted(CHECKLIST_STEPS[3]);

    console.log(`[결제 상태 조회] transaction_key 그룹 수: ${paymentMap.size}개`);

    /**
     * 1-1-2-2) 각 그룹에서 created_at 최신 1건씩 추출
     */
    const latestPaymentsByGroup = new Map<string, PaymentStatusItem>();
    for (const [key, payments] of paymentMap.entries()) {
      // 각 그룹에서 created_at 기준 최신 1건 찾기
      let latestPayment: PaymentStatusItem | null = null;
      let latestCreatedAt = 0;

      for (const payment of payments) {
        const createdAt = new Date(payment.created_at).getTime();
        if (!Number.isNaN(createdAt) && createdAt > latestCreatedAt) {
          latestCreatedAt = createdAt;
          latestPayment = payment;
        }
      }

      if (latestPayment) {
        latestPaymentsByGroup.set(key, latestPayment);
      }
    }

    markStepCompleted(CHECKLIST_STEPS[4]);

    console.log(`[결제 상태 조회] 그룹화 후 최신 1건씩 추출된 결제 기록 수: ${latestPaymentsByGroup.size}개`);

    /**
     * 1-1-3) 위 그룹 결과에서 조회
     *   1) status === "Paid"
     *   2) start_at <= 현재시각 <= end_grace_at
     */
    const activePayments = Array.from(latestPaymentsByGroup.values()).filter((payment) => {
      // 조건 1: status === "Paid"
      if (payment.status !== "Paid") return false;

      // 조건 2: start_at <= 현재시각 <= end_grace_at (UTC 기준)
      const startAt = new Date(payment.start_at).getTime();
      const endGraceAt = new Date(payment.end_grace_at).getTime();

      // 유효하지 않은 날짜는 제외
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

    markStepCompleted(CHECKLIST_STEPS[5]);

    /**
     * 1-2) 조회 결과에 따른 로직 완성
     * - 조회 결과 1건 이상:
     *   - 상태메시지: 구독중
     *   - "구독취소" 버튼 활성화
     *   - "구독취소" 버튼에 transaction_key 전달
     * - 조회 결과 0건:
     *   - 상태메시지: Free
     *   - "구독하기" 버튼 활성화
     */
    const isSubscribed = activePayments.length > 0;
    const transactionKey = isSubscribed ? activePayments[0].transaction_key : undefined;
    const statusMessage = isSubscribed ? "구독중" : "Free";

    console.log(`[결제 상태 조회] 최종 판정: ${statusMessage}, 활성 구독 건수: ${activePayments.length}건`);

    markStepCompleted(CHECKLIST_STEPS[6]);

    return respond(
      true,
      isSubscribed,
      transactionKey,
      statusMessage,
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
