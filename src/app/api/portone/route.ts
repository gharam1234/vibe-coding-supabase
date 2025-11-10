import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getSupabaseServiceRoleClient } from "@/lib/supabase";

// 웹훅 엔드포인트 설정: 동적 라우팅
export const dynamic = "force-dynamic";

type PaymentStatus = "Paid" | "Cancelled";

interface PortOnePayment {
  paymentId?: string;
  id?: string;
  amount?: number | { total?: number | string };
  billingKey?: string;
  orderName?: string;
  customer?: {
    id?: string;
  };
}

interface RequestBody {
  payment_id: string;
  status: PaymentStatus;
}

const PORTONE_BASE_URL = "https://api.portone.io";

// 웹훅 엔드포인트용 헤더 설정
const webhookHeaders = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
  "Pragma": "no-cache",
  "Expires": "0",
};

const jsonError = (status: number) =>
  NextResponse.json(
    { success: false },
    {
      status,
      headers: webhookHeaders,
    }
  );

function parseAmount(amount: PortOnePayment["amount"]): number | null {
  if (typeof amount === "number") {
    return amount;
  }

  if (amount && typeof amount === "object") {
    const total = (amount as { total?: number | string }).total;
    if (typeof total === "number") {
      return total;
    }

    if (typeof total === "string") {
      const parsed = Number(total);
      return Number.isNaN(parsed) ? null : parsed;
    }
  }

  return null;
}

function addDays(date: Date, days: number) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function buildNextScheduleAt(endAt: Date) {
  const nextDay = addDays(endAt, 1);
  nextDay.setHours(10, 0, 0, 0);

  const randomMinutes = Math.floor(Math.random() * 60);
  nextDay.setMinutes(nextDay.getMinutes() + randomMinutes);
  return nextDay;
}

async function fetchPayment(paymentId: string, apiSecret: string) {
  const res = await fetch(`${PORTONE_BASE_URL}/payments/${encodeURIComponent(paymentId)}`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `PortOne ${apiSecret}`,
    },
  });

  if (!res.ok) {
    const errorMessage = await res.text();
    throw new Error(`결제 조회 실패: ${res.status} ${errorMessage}`);
  }

  return (await res.json()) as PortOnePayment;
}

async function savePaymentRecord(params: {
  transactionKey: string;
  amount: number;
  nextScheduleAt: Date;
  nextScheduleId: string;
  startAt: Date;
  endAt: Date;
  endGraceAt: Date;
}) {
  const supabase = getSupabaseServiceRoleClient();

  const { error } = await supabase.from("payment").insert({
    transaction_key: params.transactionKey,
    amount: params.amount,
    status: "Paid",
    start_at: params.startAt.toISOString(),
    end_at: params.endAt.toISOString(),
    end_grace_at: params.endGraceAt.toISOString(),
    next_schedule_at: params.nextScheduleAt.toISOString(),
    next_schedule_id: params.nextScheduleId,
  });

  if (error) {
    throw new Error(`Supabase 저장 실패: ${error.message}`);
  }
}

async function scheduleNextPayment(options: {
  payment: PortOnePayment;
  amount: number;
  nextScheduleAt: Date;
  nextScheduleId: string;
  apiSecret: string;
}) {
  const { payment, amount, nextScheduleAt, nextScheduleId, apiSecret } = options;

  if (!payment.billingKey || !payment.orderName || !payment.customer?.id) {
    throw new Error("결제 예약에 필요한 정보가 부족합니다");
  }

  const res = await fetch(
    `${PORTONE_BASE_URL}/payments/${encodeURIComponent(nextScheduleId)}/schedule`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `PortOne ${apiSecret}`,
      },
      body: JSON.stringify({
        payment: {
          billingKey: payment.billingKey,
          orderName: payment.orderName,
          customer: {
            id: payment.customer.id,
          },
          amount: {
            total: amount,
          },
          currency: "KRW",
        },
        timeToPay: nextScheduleAt.toISOString(),
      }),
    }
  );

  if (!res.ok) {
    const errorMessage = await res.text();
    throw new Error(`결제 예약 실패: ${res.status} ${errorMessage}`);
  }
}

function validateRequestBody(body: unknown): RequestBody | null {
  if (!body || typeof body !== "object") {
    return null;
  }

  const payload = body as Partial<RequestBody>;

  if (!payload.payment_id || typeof payload.payment_id !== "string") {
    return null;
  }

  if (payload.status !== "Paid" && payload.status !== "Cancelled") {
    return null;
  }

  return payload as RequestBody;
}

export async function POST(request: NextRequest) {
  let payload: RequestBody | null = null;
  try {
    payload = validateRequestBody(await request.json());
  } catch {
    return jsonError(400);
  }

  if (!payload) {
    return jsonError(400);
  }

  const apiSecret = process.env.PORTONE_API_SECRET;
  if (!apiSecret) {
    console.error("PORTONE_API_SECRET 환경 변수가 없습니다.");
    return jsonError(500);
  }

  try {
    const payment = await fetchPayment(payload.payment_id, apiSecret);
    const normalizedAmount = parseAmount(payment.amount);

    const transactionKey = payment.paymentId ?? payment.id ?? payload.payment_id;

    if (normalizedAmount === null) {
      console.error("포트원 결제 금액 정보를 확인할 수 없습니다.");
      return jsonError(500);
    }

    if (!transactionKey) {
      console.error("포트원 결제에 필요한 거래 식별자를 확인할 수 없습니다.");
      return jsonError(500);
    }

    if (payload.status === "Paid") {
      const nextScheduleId = randomUUID();
      const startAt = new Date();
      const endAt = addDays(startAt, 30);
      const endGraceAt = addDays(startAt, 31);
      const nextScheduleAt = buildNextScheduleAt(endAt);

      await savePaymentRecord({
        transactionKey,
        amount: normalizedAmount,
        nextScheduleAt,
        nextScheduleId,
        startAt,
        endAt,
        endGraceAt,
      });

      await scheduleNextPayment({
        payment,
        amount: normalizedAmount,
        nextScheduleAt,
        nextScheduleId,
        apiSecret,
      });
    }

    return NextResponse.json(
      { success: true },
      {
        headers: webhookHeaders,
      }
    );
  } catch (error) {
    console.error("포트원 정기결제 처리 실패:", error);
    return jsonError(500);
  }
}
