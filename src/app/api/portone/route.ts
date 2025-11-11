import axios from "axios";
import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
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

interface PaymentTableRow {
  transaction_key: string;
  amount: number;
  status: string;
  start_at: string;
  end_at: string;
  end_grace_at: string;
  next_schedule_at: string;
  next_schedule_id: string;
}

interface PaymentScheduleItem {
  id: string;
  paymentId?: string;
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

async function insertPaymentRecord(params: {
  transactionKey: string;
  amount: number;
  status: "Paid" | "Cancel";
  startAt: string;
  endAt: string;
  endGraceAt: string;
  nextScheduleAt: string;
  nextScheduleId: string;
}) {
  const supabase = getSupabaseServiceRoleClient();

  const { error } = await supabase.from("payment").insert({
    transaction_key: params.transactionKey,
    amount: params.amount,
    status: params.status,
    start_at: params.startAt,
    end_at: params.endAt,
    end_grace_at: params.endGraceAt,
    next_schedule_at: params.nextScheduleAt,
    next_schedule_id: params.nextScheduleId,
  });

  if (error) {
    throw new Error(`Supabase 저장 실패: ${error.message}`);
  }
}

async function fetchLatestPaymentRecord(transactionKey: string): Promise<PaymentTableRow> {
  const supabase = getSupabaseServiceRoleClient();

  const { data, error } = await supabase
    .from("payment")
    .select("*")
    .eq("transaction_key", transactionKey)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Supabase 결제 기록 조회 실패: ${error.message}`);
  }

  if (!data) {
    throw new Error("결제 기록이 존재하지 않습니다");
  }

  return data as PaymentTableRow;
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

async function fetchScheduledPayments(params: {
  billingKey: string;
  from: string;
  until: string;
  apiSecret: string;
}): Promise<PaymentScheduleItem[]> {
  const res = await axios.request<{ items?: PaymentScheduleItem[] }>({
    method: "GET",
    url: `${PORTONE_BASE_URL}/payment-schedules`,
    headers: {
      "Content-Type": "application/json",
      Authorization: `PortOne ${params.apiSecret}`,
    },
    data: {
      filter: {
        billingKey: params.billingKey,
        from: params.from,
        until: params.until,
      },
    },
  });

  if (!Array.isArray(res.data?.items)) {
    throw new Error("예약 결제 조회 응답이 올바르지 않습니다");
  }

  return res.data.items;
}

async function cancelScheduledPayment(scheduleIds: string[], apiSecret: string) {
  if (!scheduleIds.length) {
    return;
  }

  const res = await axios.request({
    method: "DELETE",
    url: `${PORTONE_BASE_URL}/payment-schedules`,
    headers: {
      "Content-Type": "application/json",
      Authorization: `PortOne ${apiSecret}`,
    },
    data: {
      scheduleIds,
    },
  });

  if (res.status >= 400) {
    throw new Error(`예약 결제 취소 실패: ${res.status} ${res.statusText}`);
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
    const checklist: string[] = [];
    checklist.push("포트원 결제정보 조회 완료");

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

      await insertPaymentRecord({
        transactionKey,
        amount: normalizedAmount,
        status: "Paid",
        startAt: startAt.toISOString(),
        endAt: endAt.toISOString(),
        endGraceAt: endGraceAt.toISOString(),
        nextScheduleAt: nextScheduleAt.toISOString(),
        nextScheduleId,
      });
      checklist.push("결제 정보 Supabase 기록 완료");

      await scheduleNextPayment({
        payment,
        amount: normalizedAmount,
        nextScheduleAt,
        nextScheduleId,
        apiSecret,
      });
      checklist.push("다음 회차 결제 예약 완료");
    }

    if (payload.status === "Cancelled") {
      const existingRecord = await fetchLatestPaymentRecord(transactionKey);
      checklist.push("Supabase 결제 기록 조회 완료");

      await insertPaymentRecord({
        transactionKey: existingRecord.transaction_key,
        amount: -existingRecord.amount,
        status: "Cancel",
        startAt: existingRecord.start_at,
        endAt: existingRecord.end_at,
        endGraceAt: existingRecord.end_grace_at,
        nextScheduleAt: existingRecord.next_schedule_at,
        nextScheduleId: existingRecord.next_schedule_id,
      });
      checklist.push("결제 취소 기록 저장 완료");

      if (!payment.billingKey) {
        throw new Error("billingKey 정보가 없어 예약 결제를 확인할 수 없습니다");
      }

      const scheduleAt = new Date(existingRecord.next_schedule_at);
      if (Number.isNaN(scheduleAt.getTime())) {
        throw new Error("다음 결제 예약 시간이 올바르지 않습니다");
      }

      const fromDate = addDays(scheduleAt, -1);
      const untilDate = addDays(scheduleAt, 1);

      const scheduleItems = await fetchScheduledPayments({
        billingKey: payment.billingKey,
        from: fromDate.toISOString(),
        until: untilDate.toISOString(),
        apiSecret,
      });
      checklist.push("예약 결제 정보 조회 완료");

      const targetSchedule = scheduleItems.find(
        (item) => item.paymentId === existingRecord.next_schedule_id
      );

      if (!targetSchedule) {
        throw new Error("예약된 결제 일정을 찾지 못했습니다");
      }

      await cancelScheduledPayment([targetSchedule.id], apiSecret);
      checklist.push("다음 회차 결제 예약 취소 완료");
    }

    return NextResponse.json(
      { success: true, checklist },
      {
        headers: webhookHeaders,
      }
    );
  } catch (error) {
    console.error("포트원 정기결제 처리 실패:", error);
    return jsonError(500);
  }
}
