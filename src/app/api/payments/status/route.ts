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

const CHECKLIST_STEPS = [
  "데이터베이스 연결",
  "결제 데이터 조회",
  "필터링 및 그룹화",
  "결과 반환",
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

    // 데이터베이스 연결
    const supabase = getSupabaseServiceRoleClient();
    markStepCompleted("데이터베이스 연결");

    // 현재 시간
    const now = new Date().toISOString();

    // payment 테이블에서 모든 결제 데이터 조회
    const { data: allPayments, error: queryError } = await supabase
      .from("payment")
      .select("transaction_key, user_id, status, start_at, end_grace_at, created_at")
      .eq("status", "Paid")
      .lte("start_at", now)
      .gte("end_grace_at", now)
      .order("created_at", { ascending: false });

    markStepCompleted("결제 데이터 조회");

    if (queryError) {
      console.error("결제 데이터 조회 오류:", queryError);
      return respond(false, false, undefined, "결제 데이터 조회에 실패했습니다.", 500);
    }

    // transaction_key로 그룹화하여 각 그룹의 최신 1건만 추출
    const paymentMap = new Map<string, PaymentStatusItem>();
    if (allPayments) {
      for (const payment of allPayments) {
        const key = payment.transaction_key;
        // 같은 transaction_key가 없거나 더 최신 데이터면 업데이트
        if (!paymentMap.has(key)) {
          paymentMap.set(key, payment as PaymentStatusItem);
        }
      }
    }

    markStepCompleted("필터링 및 그룹화");

    // 결과 판단
    const activePayments = Array.from(paymentMap.values());
    const isSubscribed = activePayments.length > 0;
    const transactionKey = isSubscribed ? activePayments[0].transaction_key : undefined;

    markStepCompleted("결과 반환");

    return respond(
      true,
      isSubscribed,
      transactionKey,
      isSubscribed ? "구독중" : "Free",
      200
    );
  } catch (error) {
    console.error("결제 상태 조회 중 오류 발생:", error);
    return NextResponse.json(
      {
        success: false,
        isSubscribed: false,
        message: "결제 상태 조회에 실패했습니다.",
        checklist: CHECKLIST_STEPS.map((step) => ({ step, completed: false })),
      },
      { status: 500 }
    );
  }
}
