'use client';

import { useEffect, useState } from 'react';
import { getSupabaseClient } from '@/lib/supabase';
import type { User } from '@supabase/supabase-js';

/**
 * 유저 프로필 조회 훅
 * Supabase 인증을 통해 현재 사용자의 프로필 정보를 조회합니다.
 * 
 * Step-by-step 구현:
 * 1단계: Supabase 클라이언트 초기화
 * 2단계: 현재 세션 및 사용자 정보 조회
 * 3단계: 프로필 데이터 추출 및 포맷팅
 * 4단계: 프로필 데이터 반환
 */

export interface ProfileChecklistItem {
  step: string;
  completed: boolean;
}

export interface UserProfile {
  profileImage: string | null;
  nickname: string;
  email: string;
  joinDate: string;
}

export interface UseProfileResult {
  profile: UserProfile | null;
  isLoading: boolean;
  error: string | null;
  checklist: ProfileChecklistItem[];
}

/**
 * 체크리스트 단계 정의
 */
const CHECKLIST_STEPS = [
  '1단계: Supabase 클라이언트 초기화',
  '2단계: 현재 세션 및 사용자 정보 조회',
  '3단계: 프로필 데이터 추출 및 포맷팅',
  '4단계: 프로필 데이터 반환',
] as const;

/**
 * 에러 메시지 상수 정의
 */
const ERROR_MESSAGES = {
  sessionError: '세션 조회 중 오류가 발생했습니다.',
  profileError: '프로필 정보 조회 중 오류가 발생했습니다.',
} as const;

/**
 * 날짜 포맷팅 함수 (YYYY.MM 형식)
 */
function formatJoinDate(createdAt: string | undefined): string {
  if (!createdAt) return '';
  
  const date = new Date(createdAt);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  
  return `${year}.${month}`;
}

/**
 * 사용자 프로필 정보 추출
 */
function extractUserProfile(user: User | null): UserProfile | null {
  if (!user) return null;

  // 프로필 사진: user_metadata에서 avatar_url 또는 picture 추출
  const profileImage = user.user_metadata?.avatar_url || user.user_metadata?.picture || null;
  
  // 이름: user_metadata의 full_name 또는 name, 없으면 이메일의 @ 앞부분
  const nickname = user.user_metadata?.full_name 
    || user.user_metadata?.name 
    || user.email?.split('@')[0] 
    || '사용자';
  
  // 이메일
  const email = user.email || '';
  
  // 가입일: created_at을 YYYY.MM 형식으로 포맷팅
  const joinDate = formatJoinDate(user.created_at);

  return {
    profileImage,
    nickname,
    email,
    joinDate,
  };
}

export function useProfile(): UseProfileResult {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [checklist, setChecklist] = useState<ProfileChecklistItem[]>(
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
    let authStateSubscription: { data: { subscription: { unsubscribe: () => void } } } | null = null;
    let isMounted = true;

    const fetchProfile = async () => {
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

        // 3단계: 프로필 데이터 추출 및 포맷팅
        if (session?.user) {
          const userProfile = extractUserProfile(session.user);
          markStepCompleted(CHECKLIST_STEPS[2]);
          
          if (isMounted) {
            setProfile(userProfile);
            markStepCompleted(CHECKLIST_STEPS[3]);
          }
        } else {
          // 로그인하지 않은 경우: null 반환도 데이터 추출의 한 형태
          markStepCompleted(CHECKLIST_STEPS[2]);
          
          if (isMounted) {
            setProfile(null);
            markStepCompleted(CHECKLIST_STEPS[3]);
          }
        }

        // 인증 상태 변경 감지 (로그인/로그아웃 시 프로필 업데이트)
        authStateSubscription = supabase.auth.onAuthStateChange(
          async (event, session) => {
            if (!isMounted) return;

            if (event === 'SIGNED_IN' && session?.user) {
              const userProfile = extractUserProfile(session.user);
              setProfile(userProfile);
            } else if (event === 'SIGNED_OUT') {
              setProfile(null);
            }
          }
        );
      } catch (err) {
        console.error('프로필 조회 오류:', err);
        if (isMounted) {
          setError(
            err instanceof Error
              ? err.message
              : ERROR_MESSAGES.profileError
          );
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    fetchProfile();

    // cleanup 함수
    return () => {
      isMounted = false;
      if (authStateSubscription) {
        authStateSubscription.data.subscription.unsubscribe();
      }
    };
  }, []);

  return {
    profile,
    isLoading,
    error,
    checklist,
  };
}

