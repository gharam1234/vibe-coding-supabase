'use client';

import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { usePaymentBillingKey } from "./hooks/index.payment.hook";
import { useState, useEffect } from "react";
import { getSupabaseClient } from "@/lib/supabase";

export default function GlossaryPayments() {
  const router = useRouter();
  const { requestBillingKey, processPayment, isLoading, error } = usePaymentBillingKey();
  const [isProcessing, setIsProcessing] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoadingUser, setIsLoadingUser] = useState(true);

  // 로그인된 사용자 정보 가져오기
  useEffect(() => {
    const fetchUser = async () => {
      try {
        const supabase = getSupabaseClient();
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        
        if (sessionError) {
          console.error('세션 확인 오류:', sessionError);
          setIsLoadingUser(false);
          return;
        }

        if (session?.user) {
          setUserId(session.user.id);
          setAccessToken(session.access_token);
        } else {
          // 로그인하지 않은 경우 로그인 페이지로 리다이렉트
          router.push('/auth/login');
        }
      } catch (err) {
        console.error('사용자 정보 조회 오류:', err);
      } finally {
        setIsLoadingUser(false);
      }
    };

    fetchUser();
  }, [router]);

  const handleNavigateToList = () => {
    router.push('/magazines');
  };

  const handleSubscribe = async () => {
    if (!userId || !accessToken) {
      alert('로그인이 필요합니다.');
      router.push('/auth/login');
      return;
    }

    setIsProcessing(true);
    try {
      // 고객 정보 설정
      const customerId = userId;
      const customerName = "구독자";
      const orderName = "IT 매거진 월간 구독";
      const amount = 9900;

      // 1. 빌링키 발급 요청 (PG: 토스페이먼츠)
      const billingKeyResult = await requestBillingKey(customerId, customerName);
      if (!billingKeyResult) {
        alert(`빌링키 발급 실패: ${error || '알 수 없는 오류'}`);
        return;
      }

      // 2. 빌링키로 결제 처리 (customData에 로그인된 user_id 포함)
      const paymentResult = await processPayment({
        billingKey: billingKeyResult.billingKey,
        orderName: orderName,
        amount: amount,
        customer: {
          id: customerId,
        },
        customData: userId, // 로그인된 user_id (UUID)
      }, accessToken);

      if (!paymentResult) {
        alert('결제 처리 실패');
        return;
      }

      // 3. 구독결제 성공 이후 로직
      if (paymentResult.success) {
        alert('구독에 성공하였습니다.');
        router.push('/magazines'); // 이동할 페이지: /magazines
      } else {
        alert('결제에 실패했습니다.');
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : '오류가 발생했습니다.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="magazine-form-container magazine-payment-page">
      <button className="magazine-detail-back" onClick={handleNavigateToList}>
        <ArrowLeft className="magazine-detail-back-icon" />
        <span>목록으로</span>
      </button>
      <div className="magazine-form-header">
        <h1>IT 매거진 구독</h1>
        <p className="magazine-form-subtitle">프리미엄 콘텐츠를 제한 없이 이용하세요</p>
      </div>

      <div className="payment-content">
        <div className="payment-card">
          <div className="payment-card-header">
            <h2 className="payment-plan-title">월간 구독</h2>
            <p className="payment-plan-description">
              모든 IT 매거진 콘텐츠에 무제한 접근
            </p>
          </div>

          <div className="payment-card-body">
            <div className="payment-price-section">
              <span className="payment-price">9,900원</span>
              <span className="payment-period">/월</span>
            </div>

            <div className="payment-features">
              <div className="payment-feature-item">
                <svg className="payment-check-icon" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                <span>모든 프리미엄 아티클 열람</span>
              </div>
              <div className="payment-feature-item">
                <svg className="payment-check-icon" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                <span>최신 기술 트렌드 리포트</span>
              </div>
              <div className="payment-feature-item">
                <svg className="payment-check-icon" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                <span>광고 없는 읽기 환경</span>
              </div>
              <div className="payment-feature-item">
                <svg className="payment-check-icon" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                <span>언제든지 구독 취소 가능</span>
              </div>
            </div>

            <button
              className="payment-subscribe-button"
              onClick={handleSubscribe}
              disabled={isProcessing || isLoading || isLoadingUser || !userId}
            >
              {isLoadingUser ? '로딩 중...' : isProcessing || isLoading ? '처리 중...' : '구독하기'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
