import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getSupabaseClient } from "@/lib/supabase";

type PaymentStatus = "Paid" | "Cancelled";

interface PortOnePayment {
  paymentId?: string;
  amount?: number | { total?: number };
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

const jsonError = (status: number) =>
  NextResponse.json({ success: false }, { status });

function parseAmount(amount: PortOnePayment["amount"]): number | null {
  if (typeof amount === "number") {
    return amount;
  }

  if (amount && typeof amount.total === "number") {
    return amount.total;
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
  payment: PortOnePayment;
  amount: number;
  nextScheduleAt: Date;
  nextScheduleId: string;
  startAt: Date;
  endAt: Date;
  endGraceAt: Date;
}) {
  const supabase = getSupabaseClient();

  const { error } = await supabase.from("payment").insert({
    transaction_key: params.payment.paymentId,
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

    if (!normalizedAmount || !payment.paymentId) {
      console.error("포트원 결제 정보에 필수 데이터가 없습니다.");
      return jsonError(500);
    }

    if (payload.status === "Paid") {
      const nextScheduleId = randomUUID();
      const startAt = new Date();
      const endAt = addDays(startAt, 30);
      const endGraceAt = addDays(startAt, 31);
      const nextScheduleAt = buildNextScheduleAt(endAt);

      await savePaymentRecord({
        payment,
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

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("포트원 정기결제 처리 실패:", error);
    return jsonError(500);
  }
}
