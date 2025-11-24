'use client';

import { getSupabaseClient } from '@/lib/supabase';

/**
 * 구글 로그인 훅
 * Supabase의 구글 OAuth를 사용하여 로그인을 처리합니다.
 * 
 * Step-by-step 구현:
 * 1단계: Supabase 클라이언트 초기화
 * 2단계: 리다이렉트 URL 설정 (로그인 성공 후 이동할 페이지)
 * 3단계: Supabase 구글 OAuth 로그인 API 호출
 * 4단계: 에러 처리 및 사용자 피드백
 */
export function useGoogleLogin() {
  const handleGoogleLogin = async () => {
    try {
      // 1단계: Supabase 클라이언트 초기화
      const supabase = getSupabaseClient();
      
      // 2단계: 리다이렉트 URL 설정
      // 로그인 성공 시 이동할 페이지: /auth/login/success
      const redirectTo = `${window.location.origin}/auth/login/success`;
      
      // 3단계: Supabase 구글 OAuth 로그인 API 호출
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo,
        },
      });

      // 4단계: 에러 처리 및 사용자 피드백
      if (error) {
        console.error('구글 로그인 오류:', error);
        alert(`로그인 실패: ${error.message}`);
        throw error;
      }

      // signInWithOAuth는 자동으로 구글 로그인 페이지로 리다이렉트됩니다.
      // 성공 시 redirectTo로 지정한 URL(/auth/login/success)로 콜백됩니다.
    } catch (err) {
      console.error('구글 로그인 처리 중 오류 발생:', err);
      throw err;
    }
  };

  return {
    handleGoogleLogin,
  };
}

