'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseClient } from '@/lib/supabase';

/**
 * 구글 로그인 성공 처리 훅
 * Supabase OAuth 콜백 후 세션 설정을 확인하고 메인 페이지로 리다이렉트합니다.
 * 
 * Step-by-step 구현:
 * 1단계: Supabase 클라이언트 초기화
 * 2단계: URL hash fragment에서 인증 정보 확인
 * 3단계: 세션 설정 대기 (최대 10초)
 * 4단계: 세션 확인 완료 후 메인 페이지로 리다이렉트
 */

export interface LoginSuccessChecklistItem {
  step: string;
  completed: boolean;
}

export interface UseLoginSuccessResult {
  isLoading: boolean;
  error: string | null;
  checklist: LoginSuccessChecklistItem[];
}

/**
 * 체크리스트 단계 정의
 */
const CHECKLIST_STEPS = [
  '1단계: Supabase 클라이언트 초기화',
  '2단계: URL hash fragment에서 인증 정보 확인',
  '3단계: 세션 설정 대기 (최대 10초)',
  '4단계: 세션 확인 완료',
] as const;

/**
 * 에러 메시지 상수 정의
 */
const ERROR_MESSAGES = {
  sessionTimeout: '세션 설정 시간이 초과되었습니다. 다시 로그인해주세요.',
  sessionError: '세션 확인 중 오류가 발생했습니다.',
  loginProcessError: '로그인 처리 중 오류가 발생했습니다.',
} as const;

export function useLoginSuccess(): UseLoginSuccessResult {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [checklist, setChecklist] = useState<LoginSuccessChecklistItem[]>(
    CHECKLIST_STEPS.map((step) => ({ step, completed: false }))
  );

  const markStepCompleted = (step: string) => {
    setChecklist((prev) =>
      prev.map((item) =>
        item.step === step ? { ...item, completed: true } : item
      )
    );
  };

  useEffect(() => {
    let timeoutId: NodeJS.Timeout | null = null;
    let authStateSubscription: { data: { subscription: { unsubscribe: () => void } } } | null = null;
    let isMounted = true;

    const handleLoginSuccess = async () => {
      try {
        setIsLoading(true);
        setError(null);

        // 1단계: Supabase 클라이언트 초기화
        const supabase = getSupabaseClient();
        markStepCompleted(CHECKLIST_STEPS[0]);

        // 2단계: URL hash fragment에서 인증 정보 확인
        // Supabase OAuth 콜백은 hash fragment에 토큰 정보를 포함할 수 있음
        // 예: #access_token=xxx&refresh_token=yyy&type=recovery
        if (typeof window !== 'undefined') {
          const hashParams = new URLSearchParams(
            window.location.hash.substring(1)
          );
          if (hashParams.has('access_token') || hashParams.has('error')) {
            markStepCompleted(CHECKLIST_STEPS[1]);
          }
        }

        // 3단계: 세션 설정 대기 (최대 10초)
        // Supabase 클라이언트가 hash fragment의 토큰을 자동으로 처리하므로
        // onAuthStateChange를 사용하여 세션 변경을 감지
        const maxWaitTime = 10000; // 10초

        // 즉시 한 번 확인 (세션이 이미 설정되어 있을 수 있음)
        const { data: { session: initialSession }, error: initialError } =
          await supabase.auth.getSession();

        if (initialError) {
          throw initialError;
        }

        if (initialSession) {
          // 세션이 이미 설정되어 있으면 바로 리다이렉트
          markStepCompleted(CHECKLIST_STEPS[2]);
          markStepCompleted(CHECKLIST_STEPS[3]);
          if (isMounted) {
            router.push('/magazines');
          }
          return;
        }

        // 세션이 없으면 onAuthStateChange로 세션 변경 감지
        authStateSubscription = supabase.auth.onAuthStateChange(
          async (event, session) => {
            if (!isMounted) return;

            if (event === 'SIGNED_IN' && session) {
              markStepCompleted(CHECKLIST_STEPS[2]);
              markStepCompleted(CHECKLIST_STEPS[3]);
              if (isMounted) {
                router.push('/magazines');
              }
            } else if (event === 'SIGNED_OUT') {
              if (isMounted) {
                setError(ERROR_MESSAGES.sessionError);
                setIsLoading(false);
              }
            }
          }
        );

        // 타임아웃 설정 (안전장치)
        timeoutId = setTimeout(() => {
          if (isMounted) {
            setError(ERROR_MESSAGES.sessionTimeout);
            setIsLoading(false);
          }
        }, maxWaitTime);
      } catch (err) {
        console.error('로그인 성공 처리 오류:', err);
        if (isMounted) {
          setError(
            err instanceof Error
              ? err.message
              : ERROR_MESSAGES.loginProcessError
          );
          setIsLoading(false);
        }
      }
    };

    handleLoginSuccess();

    // cleanup 함수
    return () => {
      isMounted = false;
      if (timeoutId) clearTimeout(timeoutId);
      if (authStateSubscription) {
        authStateSubscription.data.subscription.unsubscribe();
      }
    };
  }, [router]);

  return {
    isLoading,
    error,
    checklist,
  };
}

