import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";

interface PaymentRequest {
  billingKey: string;
  orderName: string;
  amount: number;
  customer: {
    id: string;
  };
  customData: string; // 로그인된 user_id (UUID)
}

interface PaymentResponse {
  success: boolean;
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

  if (typeof req.customData !== "string" || !req.customData.trim()) {
    return { valid: false, error: "customData는 필수 문자열입니다" };
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

    // 인가: API 요청자 검증
    const userId = await getUserIdFromSession(request);
    if (!userId) {
      console.warn("인가 실패: 유효한 세션이 없습니다");
      return NextResponse.json(
        { success: false },
        { status: 401 }
      );
    }

    // 결제 가능 여부 검증: 인가된 user_id === customData
    if (userId !== paymentData.customData) {
      console.warn("결제 불가: 인가된 user_id와 customData가 일치하지 않습니다");
      return NextResponse.json(
        { success: false },
        { status: 403 }
      );
    }

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

    // billingKey를 사용하여 portone에 결제 요청
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
          customData: paymentData.customData, // 로그인된 user_id
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

    // DB에 저장하지 않고, 응답 반환
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("결제 처리 중 오류 발생:", error);
    return NextResponse.json(
      { success: false },
      { status: 500 }
    );
  }
}
