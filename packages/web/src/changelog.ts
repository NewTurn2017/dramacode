export interface ChangelogEntry {
  version: string
  date: string
  features?: string[]
  improvements?: string[]
  fixes?: string[]
}

/**
 * 변경 내역 데이터.
 * 배포 시 최신 버전을 배열 맨 앞에 추가하세요.
 * 기능(features) 위주로, 개발 내부 사항은 생략합니다.
 */
export const changelog: ChangelogEntry[] = [
  {
    version: "0.4.5",
    date: "2026-02-18",
    features: [
      "채팅 이미지 첨부 — 📎 버튼으로 이미지를 첨부하면 AI가 이미지를 분석하여 답변합니다.",
      "이미지 영구 저장 — 첨부한 이미지가 채팅 기록에 보존되어 언제든 다시 확인할 수 있습니다.",
    ],
  },
  {
    version: "0.4.4",
    date: "2026-02-18",
    features: [
      "채팅 내 검색 — 대화 중 특정 내용을 빠르게 찾고 ▲▼ 키로 이동할 수 있습니다.",
      "문장 스크랩 — 마음에 드는 문장을 드래그하여 프로젝트별로 저장할 수 있습니다.",
      "스마트 스크롤 — AI 답변 중에도 위로 스크롤하여 이전 내용을 자유롭게 읽을 수 있습니다.",
      "입력창 자동 확장 — 긴 내용 입력 시 최대 3줄까지 자동으로 늘어납니다.",
    ],
    improvements: [
      "삭제 확인 창 접근성 개선 (ESC 닫기, 포커스 트랩)",
      "오류 발생 시 토스트 메시지로 안내",
      "API 요청 30초 타임아웃 적용",
    ],
  },
]
