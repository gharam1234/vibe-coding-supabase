import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseServiceRoleClient } from "@/lib/supabase";

interface CancelRequest {
  transactionKey: string;
}

interface ChecklistItem {
  step: string;
  completed: boolean;
}

interface CancelResponse {
  success: boolean;
  checklist: ChecklistItem[];
}

/**
 * 프롬프트 명세에 따른 체크리스트 정의
 */
const CHECKLIST_STEPS = [
  "요청 바디 파싱",
  "요청 데이터 검증",
  "인가 확인 (API 요청자 검증)",
  "취소 가능 여부 검증 (payment 테이블 조회)",
  "포트원 API 시크릿 확인",
  "포트원 결제 취소 요청",
] as const;

// 요청 데이터 검증 함수
function validateCancelRequest(body: unknown): { valid: boolean; error?: string } {
  if (!body || typeof body !== "object") {
    return { valid: false, error: "요청 본문이 객체가 아닙니다" };
  }

  const req = body as Record<string, unknown>;

  if (typeof req.transactionKey !== "string" || !req.transactionKey.trim()) {
    return { valid: false, error: "transactionKey는 필수 문자열입니다" };
  }

  return { valid: true };
}

// 인가: 가장 간단한 방식으로 Supabase 세션 확인
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

export async function POST(request: NextRequest): Promise<NextResponse<CancelResponse>> {
  try {
    const checklist: ChecklistItem[] = CHECKLIST_STEPS.map((step) => ({ step, completed: false }));
    const markStepCompleted = (step: string) => {
      const target = checklist.find((item) => item.step === step);
      if (target) target.completed = true;
    };
    const respond = (success: boolean, status: number) => NextResponse.json({ success, checklist }, { status });

    // 요청 본문 파싱
    let body: unknown;
    try {
      body = await request.json();
      markStepCompleted("요청 바디 파싱");
    } catch {
      return respond(false, 400);
    }

    // 요청 데이터 검증
    const validation = validateCancelRequest(body);
    if (!validation.valid) {
      console.warn("요청 검증 실패:", validation.error);
      return respond(false, 400);
    }

    markStepCompleted("요청 데이터 검증");

    const cancelData = body as CancelRequest;

    // 인가: API 요청자 검증
    const userId = await getUserIdFromSession(request);
    if (!userId) {
      console.warn("인가 실패: 유효한 세션이 없습니다");
      return respond(false, 401);
    }

    markStepCompleted("인가 확인 (API 요청자 검증)");

    // 취소 가능 여부 검증: payment 테이블에서 조회
    const supabase = getSupabaseServiceRoleClient();
    const { data: payment, error: paymentError } = await supabase
      .from("payment")
      .select("transaction_key, user_id")
      .eq("user_id", userId)
      .eq("transaction_key", cancelData.transactionKey)
      .maybeSingle();

    if (paymentError) {
      console.error("결제 정보 조회 실패:", paymentError);
      return respond(false, 500);
    }

    if (!payment) {
      console.warn("취소 불가: 해당 결제 정보를 찾을 수 없습니다");
      return respond(false, 404);
    }

    markStepCompleted("취소 가능 여부 검증 (payment 테이블 조회)");

    // 포트원 API 시크릿 확인
    const apiSecret = process.env.PORTONE_API_SECRET;
    if (!apiSecret) {
      console.error("포트원 API 시크릿이 설정되지 않았습니다");
      return respond(false, 500);
    }

    markStepCompleted("포트원 API 시크릿 확인");

    // transactionKey를 사용하여 portone에 결제 취소 요청
    const portoneResponse = await fetch(
      `https://api.portone.io/payments/${encodeURIComponent(cancelData.transactionKey)}/cancel`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `PortOne ${apiSecret}`,
        },
        body: JSON.stringify({
          reason: "취소 사유 없음",
        }),
      }
    );

    // 포트원 API 응답 확인
    if (!portoneResponse.ok) {
      const errorText = await portoneResponse.text();
      let errorJson: { type?: string } | null = null;
      try {
        errorJson = JSON.parse(errorText);
      } catch {
        /* noop: 포트원 오류 응답이 JSON이 아닐 수 있음 */
      }

      if (
        portoneResponse.status === 409 &&
        errorJson?.type === "PAYMENT_ALREADY_CANCELLED"
      ) {
        console.info("이미 취소된 결제 요청으로 간주하여 성공 처리합니다.");
      } else {
        console.error("포트원 API 오류:", portoneResponse.status, errorText);
        return respond(false, 500);
      }
    }

    markStepCompleted("포트원 결제 취소 요청");

    // DB에 저장하지 않고 응답 반환
    return respond(true, 200);
  } catch (error) {
    console.error("결제 취소 중 오류 발생:", error);
    return NextResponse.json(
      { success: false, checklist: CHECKLIST_STEPS.map((step) => ({ step, completed: false })) },
      { status: 500 }
    );
  }
}
