'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseClient } from '@/lib/supabase';
import type { User } from '@supabase/supabase-js';

/**
 * 로그인 상태 조회 및 로그아웃 처리 훅
 * Supabase 인증 상태를 확인하고 로그인/로그아웃 기능을 제공합니다.
 * 
 * Step-by-step 구현:
 * 1단계: Supabase 클라이언트 초기화
 * 2단계: 현재 세션 및 사용자 정보 조회
 * 3단계: 인증 상태 변경 감지
 * 4단계: 로그아웃 기능 구현
 */

export interface LoginLogoutStatusChecklistItem {
  step: string;
  completed: boolean;
}

export interface UserProfile {
  id: string;
  email: string | undefined;
  name: string | undefined;
  avatarUrl: string | undefined;
}

export interface UseLoginLogoutStatusResult {
  isLoggedIn: boolean;
  isLoading: boolean;
  user: UserProfile | null;
  logout: () => Promise<void>;
  checklist: LoginLogoutStatusChecklistItem[];
  error: string | null;
}

/**
 * 체크리스트 단계 정의
 */
const CHECKLIST_STEPS = [
  '1단계: Supabase 클라이언트 초기화',
  '2단계: 현재 세션 및 사용자 정보 조회',
  '3단계: 인증 상태 변경 감지',
  '4단계: 로그아웃 기능 구현',
] as const;

/**
 * 에러 메시지 상수 정의
 */
const ERROR_MESSAGES = {
  sessionError: '세션 조회 중 오류가 발생했습니다.',
  logoutError: '로그아웃 처리 중 오류가 발생했습니다.',
} as const;

/**
 * 사용자 프로필 정보 추출
 */
function extractUserProfile(user: User | null): UserProfile | null {
  if (!user) return null;

  return {
    id: user.id,
    email: user.email,
    name: user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0] || undefined,
    avatarUrl: user.user_metadata?.avatar_url || user.user_metadata?.picture || undefined,
  };
}

export function useLoginLogoutStatus(): UseLoginLogoutStatusResult {
  const router = useRouter();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [checklist, setChecklist] = useState<LoginLogoutStatusChecklistItem[]>(
    CHECKLIST_STEPS.map((step) => ({ step, completed: false }))
  );
  const [error, setError] = useState<string | null>(null);

  const markStepCompleted = (step: string) => {
    setChecklist((prev) =>
      prev.map((item) =>
        item.step === step ? { ...item, completed: true } : item
      )
    );
  };

  useEffect(() => {
    let authStateSubscription: { data: { subscription: { unsubscribe: () => void } } } | null = null;
    let isMounted = true;

    const checkAuthStatus = async () => {
      try {
        setIsLoading(true);
        setError(null);

        // 1단계: Supabase 클라이언트 초기화
        const supabase = getSupabaseClient();
        markStepCompleted(CHECKLIST_STEPS[0]);

        // 2단계: 현재 세션 및 사용자 정보 조회
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();

        if (sessionError) {
          throw sessionError;
        }

        markStepCompleted(CHECKLIST_STEPS[1]);

        if (session?.user) {
          setIsLoggedIn(true);
          setUser(extractUserProfile(session.user));
        } else {
          setIsLoggedIn(false);
          setUser(null);
        }

        // 3단계: 인증 상태 변경 감지
        authStateSubscription = supabase.auth.onAuthStateChange(
          async (event, session) => {
            if (!isMounted) return;

            if (event === 'SIGNED_IN' && session?.user) {
              setIsLoggedIn(true);
              setUser(extractUserProfile(session.user));
            } else if (event === 'SIGNED_OUT') {
              setIsLoggedIn(false);
              setUser(null);
            }
          }
        );

        markStepCompleted(CHECKLIST_STEPS[2]);
      } catch (err) {
        console.error('인증 상태 확인 오류:', err);
        if (isMounted) {
          setError(
            err instanceof Error
              ? err.message
              : ERROR_MESSAGES.sessionError
          );
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    checkAuthStatus();

    // cleanup 함수
    return () => {
      isMounted = false;
      if (authStateSubscription) {
        authStateSubscription.data.subscription.unsubscribe();
      }
    };
  }, []);

  // 4단계: 로그아웃 기능 구현
  const logout = async () => {
    try {
      setError(null);
      const supabase = getSupabaseClient();
      
      const { error: logoutError } = await supabase.auth.signOut();

      if (logoutError) {
        throw logoutError;
      }

      markStepCompleted(CHECKLIST_STEPS[3]);
      
      // 로그인 페이지로 이동
      router.push('/auth/login');
    } catch (err) {
      console.error('로그아웃 오류:', err);
      setError(
        err instanceof Error
          ? err.message
          : ERROR_MESSAGES.logoutError
      );
    }
  };

  return {
    isLoggedIn,
    isLoading,
    user,
    logout,
    checklist,
    error,
  };
}

