'use client';

import { useLoginSuccess } from './hooks/index.login.success.hook';

export default function LoginSuccessPage() {
  const { isLoading, error, checklist } = useLoginSuccess();

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8">
        {isLoading ? (
          <>
            <div className="flex flex-col items-center justify-center space-y-4">
              {/* 로딩 스피너 */}
              <div className="relative w-16 h-16">
                <div className="absolute top-0 left-0 w-full h-full border-4 border-gray-200 rounded-full"></div>
                <div className="absolute top-0 left-0 w-full h-full border-4 border-blue-600 rounded-full border-t-transparent animate-spin"></div>
              </div>

              {/* 로딩 메시지 */}
              <div className="text-center">
                <h2 className="text-xl font-semibold text-gray-800 mb-2">
                  로그인 처리 중...
                </h2>
                <p className="text-sm text-gray-600">
                  세션 설정이 완료될 때까지 잠시만 기다려주세요.
                </p>
              </div>

              {/* 체크리스트 */}
              <div className="w-full mt-6 space-y-2">
                <h3 className="text-sm font-medium text-gray-700 mb-2">
                  진행 상황:
                </h3>
                {checklist.map((item, index) => (
                  <div
                    key={index}
                    className="flex items-center space-x-2 text-sm"
                  >
                    <div
                      className={`w-5 h-5 rounded-full flex items-center justify-center ${
                        item.completed
                          ? 'bg-green-500'
                          : 'bg-gray-200 border-2 border-gray-300'
                      }`}
                    >
                      {item.completed && (
                        <svg
                          className="w-3 h-3 text-white"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M5 13l4 4L19 7"
                          />
                        </svg>
                      )}
                    </div>
                    <span
                      className={
                        item.completed
                          ? 'text-gray-700'
                          : 'text-gray-400'
                      }
                    >
                      {item.step}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : error ? (
          <div className="flex flex-col items-center justify-center space-y-4">
            {/* 에러 아이콘 */}
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center">
              <svg
                className="w-8 h-8 text-red-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </div>

            {/* 에러 메시지 */}
            <div className="text-center">
              <h2 className="text-xl font-semibold text-gray-800 mb-2">
                로그인 처리 실패
              </h2>
              <p className="text-sm text-red-600 mb-4">{error}</p>
              <button
                onClick={() => window.location.href = '/auth/login'}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                로그인 페이지로 돌아가기
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

