'use client';

import { useState, useCallback } from 'react';
import PortOne from '@portone/browser-sdk/v2';

interface BillingKeyResponse {
  billingKey: string;
  customerKey: string;
}

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

interface UsePaymentHookResult {
  isLoading: boolean;
  error: string | null;
  requestBillingKey: (customerKey: string, customerName: string) => Promise<BillingKeyResponse | null>;
  processPayment: (paymentData: PaymentRequest) => Promise<PaymentResponse | null>;
}

export const usePaymentBillingKey = (): UsePaymentHookResult => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 포트원 빌링키 발급 요청
  const requestBillingKey = useCallback(
    async (customerKey: string, customerName: string): Promise<BillingKeyResponse | null> => {
      setIsLoading(true);
      setError(null);

      try {
        const storeId = process.env.NEXT_PUBLIC_PORTONE_STORE_ID;
        if (!storeId) {
          throw new Error('포트원 Store ID가 설정되지 않았습니다.');
        }

        // 포트원 SDK 확인
        if (!PortOne) {
          throw new Error('포트원 SDK 로드 실패');
        }

        // 빌링키 발급 요청
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const requestData = {
          storeId: storeId,
          billingKeyMethod: 'CARD',
          pgProvider: 'TOSS_PAYMENTS',
          redirectUrl: `${window.location.origin}/payments`,
          customerId: customerKey,
          customerName: customerName,
          windowType: {
            pc: 'POPUP',
            mobile: 'REDIRECTION',
          },
        } as any;
        const response = await PortOne.requestIssueBillingKey(requestData);

        if (!response) {
          throw new Error('빌링키 발급 실패');
        }

        if (response.code !== undefined && response.code !== null) {
          // 에러 발생
          throw new Error(response.message || '빌링키 발급에 실패했습니다.');
        }

        setIsLoading(false);
        return {
          billingKey: response.billingKey || '',
          customerKey: customerKey,
        };
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : '빌링키 발급 중 오류가 발생했습니다.';
        setError(errorMsg);
        setIsLoading(false);
        return null;
      }
    },
    []
  );

  // 결제 API 호출
  const processPayment = useCallback(
    async (paymentData: PaymentRequest): Promise<PaymentResponse | null> => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch('/api/payments', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(paymentData),
        });

        if (!response.ok) {
          throw new Error(`결제 요청 실패: ${response.statusText}`);
        }

        const result: PaymentResponse = await response.json();
        setIsLoading(false);
        return result;
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : '결제 처리 중 오류가 발생했습니다.';
        setError(errorMsg);
        setIsLoading(false);
        return null;
      }
    },
    []
  );

  return {
    isLoading,
    error,
    requestBillingKey,
    processPayment,
  };
};
