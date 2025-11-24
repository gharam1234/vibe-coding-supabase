'use client';

import { useState } from 'react';
import { getSupabaseClient } from '@/lib/supabase';

/**
 * 매거진 등록 훅
 * Supabase를 연동하여 매거진 데이터를 등록합니다.
 * 
 * Step-by-step 구현:
 * 1단계: Supabase 클라이언트 초기화
 * 2단계: 현재 세션 및 사용자 정보 조회
 * 3단계: 이미지 파일 업로드 (있는 경우)
 * 4단계: magazine 테이블에 데이터 등록
 * 5단계: 등록 성공 처리
 */

export interface SubmitChecklistItem {
  step: string;
  completed: boolean;
}

interface SubmitData {
  category: string;
  title: string;
  description: string;
  content: string;
  tags: string[] | null;
  imageFile: File | null;
}

export interface UseSubmitMagazineResult {
  submitMagazine: (data: SubmitData) => Promise<string | null>;
  isSubmitting: boolean;
  error: string | null;
  checklist: SubmitChecklistItem[];
}

/**
 * 체크리스트 단계 정의
 */
const CHECKLIST_STEPS = [
  '1단계: Supabase 클라이언트 초기화',
  '2단계: 현재 세션 및 사용자 정보 조회',
  '3단계: 이미지 파일 업로드 (있는 경우)',
  '4단계: magazine 테이블에 데이터 등록',
  '5단계: 등록 성공 처리',
] as const;

/**
 * 에러 메시지 상수 정의
 */
const ERROR_MESSAGES = {
  sessionError: '세션 조회 중 오류가 발생했습니다.',
  userNotFound: '로그인이 필요합니다.',
  uploadError: '이미지 업로드 중 오류가 발생했습니다.',
  insertError: '데이터 등록 중 오류가 발생했습니다.',
} as const;

export const useSubmitMagazine = (): UseSubmitMagazineResult => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checklist, setChecklist] = useState<SubmitChecklistItem[]>(
    CHECKLIST_STEPS.map((step) => ({ step, completed: false }))
  );

  const markStepCompleted = (step: string) => {
    setChecklist((prev) =>
      prev.map((item) =>
        item.step === step ? { ...item, completed: true } : item
      )
    );
  };

  const resetChecklist = () => {
    setChecklist(CHECKLIST_STEPS.map((step) => ({ step, completed: false })));
  };

  const submitMagazine = async (data: SubmitData): Promise<string | null> => {
    setIsSubmitting(true);
    setError(null);
    resetChecklist();

    try {
      // 1단계: Supabase 클라이언트 초기화
      const supabase = getSupabaseClient();
      markStepCompleted(CHECKLIST_STEPS[0]);

      // 2단계: 현재 세션 및 사용자 정보 조회
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();

      if (sessionError) {
        throw sessionError;
      }

      markStepCompleted(CHECKLIST_STEPS[1]);

      if (!session?.user) {
        throw new Error(ERROR_MESSAGES.userNotFound);
      }

      const userId = session.user.id;

      let imageUrl: string | null = null;

      // 3단계: 이미지 파일이 있으면 Supabase Storage에 업로드
      if (data.imageFile) {
        // 날짜 기반 경로 생성 (yyyy/mm/dd)
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        
        // UUID 생성
        const uuid = crypto.randomUUID();
        
        // 파일 확장자 추출
        const fileExtension = data.imageFile.name.split('.').pop() || 'jpg';
        
        // 파일명: yyyy/mm/dd/{UUID}.jpg
        const filePath = `${year}/${month}/${day}/${uuid}.${fileExtension}`;

        // Supabase Storage에 업로드 (버킷명: vibe-storage)
        const { error: uploadError } = await supabase.storage
          .from('vibe-storage')
          .upload(filePath, data.imageFile, {
            cacheControl: '3600',
            upsert: false
          });

        if (uploadError) {
          throw new Error(`${ERROR_MESSAGES.uploadError}: ${uploadError.message}`);
        }

        // 업로드된 이미지의 Public URL 가져오기
        const { data: publicUrlData } = supabase.storage
          .from('vibe-storage')
          .getPublicUrl(filePath);

        imageUrl = publicUrlData.publicUrl;
        markStepCompleted(CHECKLIST_STEPS[2]);
      } else {
        // 이미지가 없는 경우에도 단계 완료 처리
        markStepCompleted(CHECKLIST_STEPS[2]);
      }

      // 4단계: magazine 테이블에 데이터 등록
      const { data: insertedData, error: insertError } = await supabase
        .from('magazine')
        .insert([
          {
            category: data.category,
            title: data.title,
            description: data.description,
            content: data.content,
            tags: data.tags,
            image_url: imageUrl,
            user_id: userId // 로그인된 user_id 추가
          }
        ])
        .select()
        .single();

      if (insertError) {
        throw new Error(`${ERROR_MESSAGES.insertError}: ${insertError.message}`);
      }

      if (!insertedData) {
        throw new Error(ERROR_MESSAGES.insertError);
      }

      markStepCompleted(CHECKLIST_STEPS[3]);

      // 5단계: 등록 성공 처리
      markStepCompleted(CHECKLIST_STEPS[4]);

      // 생성된 ID 반환
      return insertedData.id;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다.';
      setError(errorMessage);
      console.error('Magazine 등록 오류:', err);
      return null;
    } finally {
      setIsSubmitting(false);
    }
  };

  return {
    submitMagazine,
    isSubmitting,
    error,
    checklist
  };
};
