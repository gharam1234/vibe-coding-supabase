"use client"

import { useRouter } from "next/navigation";
import { User } from "lucide-react";
import { usePaymentCancel } from "./hooks/index.payment.cancel.hook";
import { usePaymentStatus } from "./hooks/index.payment.status.hook";
import { useProfile } from "./hooks/index.profile.hook";

export default function Page() {
  const router = useRouter();
  const { cancelSubscription, isCancelling, checklist: cancelChecklist, error: cancelError } = usePaymentCancel();
  const { isSubscribed, transactionKey, statusMessage, isLoading: isStatusLoading, error: statusError, checklist: statusChecklist } = usePaymentStatus();
  const { profile, isLoading: isProfileLoading, error: profileError, checklist: profileChecklist } = useProfile();

  const handleBackToList = () => {
    router.push('/magazines');
  };

  const handleCancelSubscription = async () => {
    if (!isSubscribed) return;

    if (!transactionKey) {
      alert("결제 정보가 없어 구독을 취소할 수 없습니다.");
      return;
    }

    const confirmed = confirm("구독을 취소하시겠습니까?");
    if (!confirmed) return;

    await cancelSubscription({
      transactionKey: transactionKey,
      onSuccess: () => {
        // 구독 취소 후 상태 새로고침
        window.location.reload();
      },
    });
  };

  const handleSubscribe = () => {
    router.push('/payments');
  };

  return (
    <div className="mypage-wrapper">
      <button className="mypage-back-btn" onClick={handleBackToList}>
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12.5 15L7.5 10L12.5 5" />
        </svg>
        목록으로
      </button>

      <div className="mypage-header">
        <h1>IT 매거진 구독</h1>
        <p className="mypage-header-desc">프리미엄 콘텐츠를 제한 없이 이용하세요</p>
      </div>

      <div className="mypage-grid">
        {/* 프로필 카드 */}
        <div className="mypage-profile-card">
          {isProfileLoading ? (
            <div className="mypage-loading">
              프로필 정보를 조회하는 중입니다...
            </div>
          ) : profileError ? (
            <div className="mypage-error-section">
              <p className="mypage-error-text">{profileError}</p>
              <button
                className="mypage-retry-btn"
                onClick={() => window.location.reload()}
              >
                다시 시도
              </button>
            </div>
          ) : profile ? (
            <>
              {profile.profileImage ? (
                <img
                  src={profile.profileImage}
                  alt={profile.nickname}
                  className="mypage-avatar"
                />
              ) : (
                <div className="mypage-avatar mypage-avatar-placeholder">
                  <User size={48} strokeWidth={1.5} />
                </div>
              )}
              <h2 className="mypage-name">{profile.nickname}</h2>
              <p className="mypage-bio-text">{profile.email}</p>
              <div className="mypage-join-date">가입일 {profile.joinDate}</div>
              {profileChecklist.length > 0 && (
                <div className="mypage-checklist">
                  <div className="mypage-checklist-title">프로필 조회 단계</div>
                  <ul className="mypage-checklist-list">
                    {profileChecklist.map(item => (
                      <li
                        key={item.step}
                        className={`mypage-checklist-item ${item.completed ? "completed" : ""}`}
                      >
                        <span>{item.step}</span>
                        <span className="mypage-checklist-status">{item.completed ? "완료" : "대기"}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          ) : (
            <div className="mypage-error-section">
              <p className="mypage-error-text">로그인이 필요합니다.</p>
              <button
                className="mypage-retry-btn"
                onClick={() => router.push('/auth/login')}
              >
                로그인하기
              </button>
            </div>
          )}
        </div>

        {/* 구독 플랜 카드 */}
        <div className={`mypage-subscription-card ${isSubscribed ? 'active' : ''}`}>
          <div className="mypage-subscription-header">
            <h3 className="mypage-card-title">구독 플랜</h3>
            {isStatusLoading ? (
              <span className="mypage-badge-loading">로딩 중...</span>
            ) : isSubscribed ? (
              <span className="mypage-badge-active">구독중</span>
            ) : (
              <span className="mypage-badge-inactive">Free</span>
            )}
          </div>

          {isStatusLoading ? (
            <div className="mypage-loading">
              결제 상태를 조회하는 중입니다...
            </div>
          ) : statusError ? (
            <div className="mypage-error-section">
              <p className="mypage-error-text">{statusError}</p>
              <button
                className="mypage-retry-btn"
                onClick={() => window.location.reload()}
              >
                다시 시도
              </button>
            </div>
          ) : isSubscribed ? (
            <div className="mypage-subscription-active">
              <div className="mypage-plan-name">IT Magazine Premium</div>
              <div className="mypage-plan-features">
                <div className="mypage-feature-item">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M13.3337 4L6.00033 11.3333L2.66699 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  <span>모든 프리미엄 콘텐츠 무제한 이용</span>
                </div>
                <div className="mypage-feature-item">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M13.3337 4L6.00033 11.3333L2.66699 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  <span>매주 새로운 IT 트렌드 리포트</span>
                </div>
                <div className="mypage-feature-item">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M13.3337 4L6.00033 11.3333L2.66699 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  <span>광고 없는 깔끔한 읽기 환경</span>
                </div>
              </div>
              <button
                className="mypage-cancel-btn"
                onClick={handleCancelSubscription}
                disabled={isCancelling}
              >
                {isCancelling ? "취소 처리중..." : "구독 취소"}
              </button>
              {cancelError && (
                <p className="mypage-error-text">{cancelError}</p>
              )}
              {cancelChecklist.length > 0 && (
                <div className="mypage-checklist">
                  <div className="mypage-checklist-title">취소 진행 단계</div>
                  <ul className="mypage-checklist-list">
                    {cancelChecklist.map(item => (
                      <li
                        key={item.step}
                        className={`mypage-checklist-item ${item.completed ? "completed" : ""}`}
                      >
                        <span>{item.step}</span>
                        <span className="mypage-checklist-status">{item.completed ? "완료" : "대기"}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {statusChecklist.length > 0 && (
                <div className="mypage-checklist">
                  <div className="mypage-checklist-title">상태 조회 단계</div>
                  <ul className="mypage-checklist-list">
                    {statusChecklist.map(item => (
                      <li
                        key={item.step}
                        className={`mypage-checklist-item ${item.completed ? "completed" : ""}`}
                      >
                        <span>{item.step}</span>
                        <span className="mypage-checklist-status">{item.completed ? "완료" : "대기"}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <div className="mypage-subscription-inactive">
              <div className="mypage-unsubscribed-message">
                {statusMessage}
              </div>
              <div className="mypage-plan-preview">
                <div className="mypage-preview-item">✓ 모든 프리미엄 콘텐츠</div>
                <div className="mypage-preview-item">✓ 매주 트렌드 리포트</div>
                <div className="mypage-preview-item">✓ 광고 없는 환경</div>
              </div>
              <button
                className="mypage-subscribe-btn"
                onClick={handleSubscribe}
              >
                지금 구독하기
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
