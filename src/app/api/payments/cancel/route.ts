import { NextRequest, NextResponse } from "next/server";

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

const CHECKLIST_STEPS = [
  "요청 바디 파싱",
  "요청 데이터 검증",
  "포트원 시크릿 확인",
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

    // 포트원 API 시크릿 확인
    const apiSecret = process.env.PORTONE_API_SECRET;
    if (!apiSecret) {
      console.error("포트원 API 시크릿이 설정되지 않았습니다");
      return respond(false, 500);
    }

    markStepCompleted("포트원 시크릿 확인");

    // 포트원 V2 API를 통한 결제 취소
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
      const errorData = await portoneResponse.text();
      console.error("포트원 API 오류:", portoneResponse.status, errorData);
      return respond(false, 500);
    }

    markStepCompleted("포트원 결제 취소 요청");

    // 취소 성공 반환
    return respond(true, 200);
  } catch (error) {
    console.error("결제 취소 중 오류 발생:", error);
    return NextResponse.json(
      { success: false, checklist: CHECKLIST_STEPS.map((step) => ({ step, completed: false })) },
      { status: 500 }
    );
  }
}
