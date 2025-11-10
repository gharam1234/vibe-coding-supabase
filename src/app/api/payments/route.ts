import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";

interface PaymentRequest {
  billingKey: string;
  orderName: string;
  amount: number;
  customer: {
    id: string;
  };
}

interface PaymentResponse {
  success: boolean;
}

// 요청 데이터 검증 함수
function validatePaymentRequest(body: unknown): { valid: boolean; error?: string } {
  if (!body || typeof body !== "object") {
    return { valid: false, error: "요청 본문이 객체가 아닙니다" };
  }

  const req = body as Record<string, unknown>;

  if (typeof req.billingKey !== "string" || !req.billingKey.trim()) {
    return { valid: false, error: "billingKey는 필수 문자열입니다" };
  }

  if (typeof req.orderName !== "string" || !req.orderName.trim()) {
    return { valid: false, error: "orderName은 필수 문자열입니다" };
  }

  if (typeof req.amount !== "number" || req.amount <= 0) {
    return { valid: false, error: "amount는 양수여야 합니다" };
  }

  if (!req.customer || typeof req.customer !== "object") {
    return { valid: false, error: "customer 객체가 필수입니다" };
  }

  const customer = req.customer as Record<string, unknown>;
  if (typeof customer.id !== "string" || !customer.id.trim()) {
    return { valid: false, error: "customer.id는 필수 문자열입니다" };
  }

  return { valid: true };
}

export async function POST(request: NextRequest): Promise<NextResponse<PaymentResponse>> {
  try {
    // 요청 본문 파싱
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false },
        { status: 400 }
      );
    }

    // 요청 데이터 검증
    const validation = validatePaymentRequest(body);
    if (!validation.valid) {
      console.warn("요청 검증 실패:", validation.error);
      return NextResponse.json(
        { success: false },
        { status: 400 }
      );
    }

    const paymentData = body as PaymentRequest;

    // 포트원 API 시크릿 확인
    const apiSecret = process.env.PORTONE_API_SECRET;
    if (!apiSecret) {
      console.error("포트원 API 시크릿이 설정되지 않았습니다");
      return NextResponse.json(
        { success: false },
        { status: 500 }
      );
    }

    // 결제 ID 생성 (UUID 사용)
    const paymentId = randomUUID();

    // 포트원 V2 API를 통한 빌링키 결제
    const portoneResponse = await fetch(
      `https://api.portone.io/payments/${encodeURIComponent(paymentId)}/billing-key`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `PortOne ${apiSecret}`,
        },
        body: JSON.stringify({
          billingKey: paymentData.billingKey,
          orderName: paymentData.orderName,
          amount: {
            total: paymentData.amount,
          },
          customer: {
            id: paymentData.customer.id,
          },
          currency: "KRW",
        }),
      }
    );

    // 포트원 API 응답 확인
    if (!portoneResponse.ok) {
      const errorData = await portoneResponse.text();
      console.error("포트원 API 오류:", portoneResponse.status, errorData);
      return NextResponse.json(
        { success: false },
        { status: 500 }
      );
    }

    // 결제 성공 반환
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("결제 처리 중 오류 발생:", error);
    return NextResponse.json(
      { success: false },
      { status: 500 }
    );
  }
}
