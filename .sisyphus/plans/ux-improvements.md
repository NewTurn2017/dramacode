# DRAMACODE UX 대규모 개선 (7종)

## TL;DR

> **Quick Summary**: DRAMACODE에 인라인 편집, 각본 내보내기(Fountain), 키보드 단축키/커맨드 팔레트, 검색/필터, 드래그&드롭 정렬, 대시보드 개선, 토스트 알림 총 7가지 UX 개선을 구현합니다.
>
> **Deliverables**:
> - 프로젝트 데이터 카드 인라인 편집 (캐릭터/에피소드/장면/세계관/플롯/드라마 메타)
> - Fountain 형식 각본 내보내기 (.fountain 다운로드)
> - ⌘K 커맨드 팔레트 + 키보드 단축키
> - 프로젝트 데이터 검색/필터
> - 장면/에피소드 드래그&드롭 순서 변경
> - 대시보드 통계 카운트 + 정렬 + 검색
> - 토스트 알림 시스템
>
> **Estimated Effort**: Large
> **Parallel Execution**: YES — 4 waves
> **Critical Path**: T1→T6→T8→T16→F1

---

## Context

### Original Request
"8번(다크/라이트 모드)을 제외하고 모두 구현하려고 합니다."

### Interview Summary
**Key Discussions**:
- 각본 내보내기: "채팅 기반 각본" — Scene.dialogue + Scene.description → Fountain 형식
- 테스트 전략: 테스트 없이 진행, QA 시나리오로만 검증
- 대시보드 수준: 실용적 개선 (통계 카운트, 최근 수정일 정렬, 검색 필터)

**Research Findings**:
- API Audit: Drama만 Full CRUD. Episode/Scene은 route 존재하나 client 미구현. Character/World/PlotPoint는 storage만 존재, HTTP route 없음.
- Fountain: Korean 캐릭터 이름은 반드시 `@` 프리픽스 사용. INT./EXT. 표준 사용.
- SolidJS 라이브러리: cmdk-solid, solid-toast, @thisbeyond/solid-dnd, @solid-primitives/keyboard, @solid-primitives/scheduled

### Metis Review
**Identified Gaps** (addressed):
- Korean IME 처리: compositionend 이벤트 + debounce 필수 → 검색/필터 태스크에 반영
- createShortcut input guard: 모든 단축키에 input/textarea 가드 필수 → 커맨드 팔레트 태스크에 반영
- Fountain Korean character names: `@` 프리픽스 규칙 → 내보내기 태스크에 반영
- 의존성 5개 추가 승인 필요 → Wave 1 첫 태스크에 반영
- macOS Meta key DnD 이슈 → DnD 태스크에 반영

---

## Work Objectives

### Core Objective
DRAMACODE 사용자 경험을 읽기 전용 뷰어에서 완전한 인터랙티브 작업 도구로 전환한다.

### Concrete Deliverables
- 프로젝트 데이터 패널의 모든 카드가 클릭으로 편집 가능
- `.fountain` 파일 다운로드 버튼
- `⌘K` 커맨드 팔레트 오버레이
- 패널 상단 검색 입력란 + 실시간 필터
- 장면/에피소드 카드 드래그&드롭
- 대시보드에 프로젝트 통계 배지
- 모든 사용자 액션에 토스트 피드백

### Definition of Done
- [ ] 모든 7개 기능이 UI에서 동작
- [ ] Fountain 내보내기 파일이 정상적인 .fountain 문법
- [ ] 커맨드 팔레트에서 섹션 이동 + 새 대화 가능
- [ ] 한글 검색이 IME 완성 후 정상 필터링
- [ ] 드래그&드롭으로 순서 변경 후 새로고침해도 유지
- [ ] `bun run typecheck` PASS (zero errors)

### Must Have
- 모든 인라인 편집은 즉시 저장 (자동 저장, 저장 버튼 없음)
- Fountain 내보내기는 에피소드별 + 전체 내보내기 지원
- 토스트는 성공/에러/정보 3가지 타입 지원
- 검색은 한글 IME 조합 중 중간 결과 노출 방지 (compositionend 사용)
- 단축키는 Mac(⌘) + Windows(Ctrl) 양쪽 지원
- DnD 순서 변경은 서버에 영속 (새로고침 후에도 유지)

### Must NOT Have (Guardrails)
- 다크/라이트 모드 전환 기능 추가 금지
- 새로운 페이지/라우트 추가 금지 (기존 3개 페이지 내에서만 작업)
- 외부 PDF 라이브러리 추가 금지 (Fountain 텍스트만, PDF 변환은 향후)
- `any` 타입캐스팅 금지
- 기존 SSE/폴링 메커니즘 변경 금지
- 기존 AI 채팅 워크플로 변경 금지
- console.log 프로덕션 코드에 남기기 금지

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed.

### Test Decision
- **Infrastructure exists**: Minimal (1 test file)
- **Automated tests**: None — QA scenarios only
- **Framework**: N/A

### QA Policy
Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

| Deliverable Type | Verification Tool | Method |
|------------------|-------------------|--------|
| Frontend/UI | Playwright (playwright skill) | Navigate, interact, assert DOM, screenshot |
| API/Backend | Bash (curl) | Send requests, assert status + response fields |
| Build | Bash | `bun run typecheck` zero errors |

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Foundation — 7 parallel, all quick):
├── T1:  Install 5 dependencies [quick]
├── T2:  Toast notification system [quick]
├── T3:  Backend: Character PATCH/DELETE/GET routes [quick]
├── T4:  Backend: World PATCH/DELETE/GET routes [quick]
├── T5:  Backend: PlotPoint PATCH/DELETE/GET/resolve routes [quick]
├── T6:  Frontend: API client methods for ALL entities [quick]
└── T7:  Backend: Reorder endpoints (scene/episode position) [quick]

Wave 2 (Core Features — 8 parallel):
├── T8:  Inline editing: Character cards [visual-engineering]
├── T9:  Inline editing: Episode cards [visual-engineering]
├── T10: Inline editing: Scene cards [visual-engineering]
├── T11: Inline editing: World & Plot cards [visual-engineering]
├── T12: Inline editing: Drama metadata header [visual-engineering]
├── T13: Search/Filter in project panel [visual-engineering]
├── T14: Dashboard improvements [visual-engineering]
└── T15: Fountain export backend endpoint [quick]

Wave 3 (Advanced Interactive — 3 parallel):
├── T16: ⌘K Command palette + keyboard shortcuts [deep]
├── T17: Drag-and-drop reordering [deep]
└── T18: Fountain export frontend UI + download [visual-engineering]

Wave FINAL (Verification — 4 parallel):
├── F1: Plan compliance audit [oracle]
├── F2: Code quality review [unspecified-high]
├── F3: Real manual QA - Playwright [unspecified-high]
└── F4: Scope fidelity check [deep]

Critical Path: T1 → T6 → T8 → T16 → F1
Parallel Speedup: ~65% faster than sequential
Max Concurrent: 8 (Wave 2)
```

### Dependency Matrix

| Task | Depends On | Blocks | Wave |
|------|------------|--------|------|
| T1 | — | T13, T16, T17 | 1 |
| T2 | — | T8-T12, T16, T18 | 1 |
| T3 | — | T8 | 1 |
| T4 | — | T11 | 1 |
| T5 | — | T11 | 1 |
| T6 | — | T8-T14 | 1 |
| T7 | — | T17 | 1 |
| T8 | T3, T6, T2 | T16 | 2 |
| T9 | T6, T2 | T16, T17 | 2 |
| T10 | T6, T2 | T16, T17 | 2 |
| T11 | T4, T5, T6, T2 | T16 | 2 |
| T12 | T6, T2 | T16 | 2 |
| T13 | T1 | T16 | 2 |
| T14 | T6 | — | 2 |
| T15 | — | T18 | 2 |
| T16 | T1, T2 | F1-F4 | 3 |
| T17 | T1, T7 | F1-F4 | 3 |
| T18 | T2, T15 | F1-F4 | 3 |

### Agent Dispatch Summary

| Wave | # Parallel | Tasks → Agent Category |
|------|------------|----------------------|
| 1 | **7** | T1-T7 → `quick` |
| 2 | **8** | T8-T12 → `visual-engineering`, T13 → `visual-engineering`, T14 → `visual-engineering`, T15 → `quick` |
| 3 | **3** | T16 → `deep`, T17 → `deep`, T18 → `visual-engineering` |
| FINAL | **4** | F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep` |

---

## TODOs

---

- [ ] 1. Install Dependencies (5 packages)

  **What to do**:
  - `bun add solid-toast cmdk-solid @thisbeyond/solid-dnd @solid-primitives/keyboard @solid-primitives/scheduled` in `packages/web/`
  - Verify all 5 packages resolve correctly and TypeScript types are available
  - Run `bun run typecheck` to confirm zero new errors

  **Must NOT do**:
  - Install to root workspace (must be in packages/web only)
  - Use `^` version ranges (pin exact versions)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with T2-T7)
  - **Blocks**: T13, T16, T17
  - **Blocked By**: None

  **References**:
  - `packages/web/package.json` — Current dependencies list, add new packages here
  - `packages/web/tsconfig.json` — TypeScript config to verify types resolve

  **Acceptance Criteria**:
  ```
  Scenario: Dependencies installed and types resolve
    Tool: Bash
    Steps:
      1. Run `bun install` in packages/web/
      2. Run `bun run typecheck` from project root
    Expected Result: Exit code 0, zero errors
    Evidence: .sisyphus/evidence/task-1-deps-install.txt
  ```

  **Commit**: YES
  - Message: `feat(web): add UX improvement dependencies`
  - Files: `packages/web/package.json`, `bun.lock`
  - Pre-commit: `bun run typecheck`

---

- [ ] 2. Toast Notification System

  **What to do**:
  - Create `packages/web/src/components/toast-provider.tsx`
  - Integrate `solid-toast` with `<Toaster />` component in `packages/web/src/app.tsx`
  - Export helper `toast.success()`, `toast.error()`, `toast.info()` 
  - Style toasts to match existing dark theme (bg-bg-card, border-border, text-text)
  - Position: bottom-right

  **Must NOT do**:
  - Build custom toast from scratch (use solid-toast library)
  - Add toast calls yet (other tasks will use the system)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: [`frontend-ui-ux`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with T1, T3-T7)
  - **Blocks**: T8-T12, T16, T18
  - **Blocked By**: None

  **References**:
  - `packages/web/src/app.tsx` — Root component where `<Toaster />` must be mounted
  - `packages/web/src/index.css` — CSS custom properties for theme colors (--bg-card, --border, --text, --accent, --danger, --success)
  - solid-toast docs: https://github.com/ardeora/solid-toast

  **Acceptance Criteria**:
  ```
  Scenario: Toast renders on programmatic call
    Tool: Playwright (playwright skill)
    Steps:
      1. Navigate to http://127.0.0.1:4097
      2. Open browser console, execute: document.querySelector('[data-testid="toast-test"]') or trigger via temporary test
      3. Verify toast appears bottom-right with correct styling
    Expected Result: Toast visible with dark theme styling
    Evidence: .sisyphus/evidence/task-2-toast-render.png

  Scenario: Toast auto-dismisses
    Tool: Playwright
    Steps:
      1. Trigger a toast
      2. Wait 4 seconds
      3. Verify toast is no longer in DOM
    Expected Result: Toast disappears after ~3-4 seconds
    Evidence: .sisyphus/evidence/task-2-toast-dismiss.png
  ```

  **Commit**: YES
  - Message: `feat(web): add toast notification system`
  - Files: `packages/web/src/components/toast-provider.tsx`, `packages/web/src/app.tsx`
  - Pre-commit: `bun run typecheck`

---

- [ ] 3. Backend: Character CRUD Routes

  **What to do**:
  - Add to `packages/dramacode/src/server/routes/drama.ts`:
    - `GET /character/:id` → `Character.get()`
    - `PATCH /character/:id` → `Character.update()`
    - `DELETE /character/:id` → `Character.remove()`
  - Validate PATCH body with Zod schema (partial fields: name, role, age, occupation, personality, backstory, arc)
  - Return 404 if character not found

  **Must NOT do**:
  - Modify existing character image upload/delete routes
  - Change Character.create() behavior

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with T1-T2, T4-T7)
  - **Blocks**: T8
  - **Blocked By**: None

  **References**:
  - `packages/dramacode/src/server/routes/drama.ts` — Existing route patterns (follow Drama PATCH pattern at line ~20-30 for consistency)
  - `packages/dramacode/src/drama/index.ts` — `Character.get()`, `Character.update()`, `Character.remove()` already exist in storage layer
  - `packages/dramacode/src/drama/drama.sql.ts` — Character table schema with all column definitions

  **Acceptance Criteria**:
  ```
  Scenario: PATCH character updates fields
    Tool: Bash (curl)
    Steps:
      1. curl -X GET http://127.0.0.1:4097/api/drama/{id}/characters → get first character ID
      2. curl -X PATCH http://127.0.0.1:4097/api/character/{charId} -H 'Content-Type: application/json' -d '{"personality":"냉정하고 카리스마 있는"}'
      3. curl -X GET http://127.0.0.1:4097/api/character/{charId}
    Expected Result: Status 200, personality field updated to "냉정하고 카리스마 있는"
    Evidence: .sisyphus/evidence/task-3-character-patch.txt

  Scenario: DELETE character removes it
    Tool: Bash (curl)
    Steps:
      1. Create a test character via POST
      2. curl -X DELETE http://127.0.0.1:4097/api/character/{charId}
      3. curl -X GET http://127.0.0.1:4097/api/character/{charId}
    Expected Result: DELETE returns 200, GET returns 404
    Evidence: .sisyphus/evidence/task-3-character-delete.txt
  ```

  **Commit**: YES (groups with T4, T5)
  - Message: `feat(api): add Character/World/PlotPoint CRUD routes`
  - Files: `packages/dramacode/src/server/routes/drama.ts`
  - Pre-commit: `bun run typecheck`

---

- [ ] 4. Backend: World CRUD Routes

  **What to do**:
  - Add to `packages/dramacode/src/server/routes/drama.ts`:
    - `GET /world/:id` → `World.get()`
    - `PATCH /world/:id` → `World.update()`
    - `DELETE /world/:id` → `World.remove()`
  - Validate PATCH body (partial fields: category, name, description)

  **Must NOT do**:
  - Modify existing World list/create routes

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with T1-T3, T5-T7)
  - **Blocks**: T11
  - **Blocked By**: None

  **References**:
  - `packages/dramacode/src/server/routes/drama.ts` — Existing World list route at `GET /drama/:id/world`
  - `packages/dramacode/src/drama/index.ts` — `World.get()`, `World.update()`, `World.remove()` in storage layer

  **Acceptance Criteria**:
  ```
  Scenario: PATCH world updates description
    Tool: Bash (curl)
    Steps:
      1. curl GET /api/drama/{id}/world → get first world entry ID
      2. curl -X PATCH /api/world/{worldId} -d '{"description":"수정된 세계관 설명"}'
      3. curl GET /api/world/{worldId}
    Expected Result: Status 200, description updated
    Evidence: .sisyphus/evidence/task-4-world-patch.txt
  ```

  **Commit**: YES (groups with T3, T5)
  - Message: `feat(api): add Character/World/PlotPoint CRUD routes`
  - Files: `packages/dramacode/src/server/routes/drama.ts`

---

- [ ] 5. Backend: PlotPoint CRUD Routes

  **What to do**:
  - Add to `packages/dramacode/src/server/routes/drama.ts`:
    - `GET /plot-point/:id` → `PlotPoint.get()`
    - `PATCH /plot-point/:id` → `PlotPoint.update()`
    - `DELETE /plot-point/:id` → `PlotPoint.remove()`
    - `POST /plot-point/:id/resolve` → `PlotPoint.resolve()`
  - Validate PATCH body (partial fields: type, description, resolved, episode_id)

  **Must NOT do**:
  - Modify existing PlotPoint list/create routes

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with T1-T4, T6-T7)
  - **Blocks**: T11
  - **Blocked By**: None

  **References**:
  - `packages/dramacode/src/server/routes/drama.ts` — Existing PlotPoint routes
  - `packages/dramacode/src/drama/index.ts` — `PlotPoint.get()`, `PlotPoint.update()`, `PlotPoint.remove()`, `PlotPoint.resolve()` in storage

  **Acceptance Criteria**:
  ```
  Scenario: Resolve plot point
    Tool: Bash (curl)
    Steps:
      1. curl GET /api/drama/{id}/plot-points → get unresolved plot point ID
      2. curl -X POST /api/plot-point/{ppId}/resolve -d '{"resolved_episode_id":"..."}'
      3. curl GET /api/drama/{id}/plot-points → verify resolved=true
    Expected Result: Plot point marked as resolved
    Evidence: .sisyphus/evidence/task-5-plotpoint-resolve.txt
  ```

  **Commit**: YES (groups with T3, T4)
  - Message: `feat(api): add Character/World/PlotPoint CRUD routes`
  - Files: `packages/dramacode/src/server/routes/drama.ts`

---

- [ ] 6. Frontend: API Client Methods for ALL Entities

  **What to do**:
  - Add to `packages/web/src/lib/api.ts`:
    - **Episode**: `get(id)`, `create(data)`, `update(id, data)`, `remove(id)`
    - **Scene**: `get(id)`, `create(data)`, `update(id, data)`, `remove(id)`
    - **Character**: `get(id)`, `update(id, data)`, `remove(id)`
    - **World**: `get(id)`, `update(id, data)`, `remove(id)`
    - **PlotPoint**: `get(id)`, `update(id, data)`, `remove(id)`, `resolve(id, data)`
  - Follow existing api.drama.* pattern
  - Add TypeScript types for update payloads (Partial<> of create types)

  **Must NOT do**:
  - Change existing api methods signatures
  - Add React Query or SWR (keep existing createResource pattern)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with T1-T5, T7)
  - **Blocks**: T8-T14
  - **Blocked By**: None

  **References**:
  - `packages/web/src/lib/api.ts` — Existing API client with `api.drama.*` pattern, follow exact fetch wrapper pattern
  - `packages/dramacode/src/drama/drama.sql.ts` — Table schemas for TypeScript type definitions

  **Acceptance Criteria**:
  ```
  Scenario: TypeScript types resolve correctly
    Tool: Bash
    Steps:
      1. bun run typecheck
    Expected Result: Zero errors, all new methods have proper types
    Evidence: .sisyphus/evidence/task-6-typecheck.txt

  Scenario: Client update method works
    Tool: Playwright
    Steps:
      1. Navigate to app, open browser console
      2. Execute: await fetch('/api/character/{id}', {method:'PATCH', headers:{'Content-Type':'application/json'}, body:'{"personality":"test"}'}).then(r=>r.json())
      3. Verify response has updated field
    Expected Result: 200 response with updated data
    Evidence: .sisyphus/evidence/task-6-client-update.txt
  ```

  **Commit**: YES
  - Message: `feat(web): add complete CRUD client methods for all entities`
  - Files: `packages/web/src/lib/api.ts`
  - Pre-commit: `bun run typecheck`

---

- [ ] 7. Backend: Reorder Endpoints

  **What to do**:
  - Add to `packages/dramacode/src/server/routes/drama.ts`:
    - `PATCH /episode/:id/reorder` — body: `{ number: number }` → update episode number
    - `PATCH /scene/:id/reorder` — body: `{ number: number }` → update scene number
  - After reorder, adjust other items' numbers to maintain sequence (shift up/down)
  - Add `Episode.reorder()` and `Scene.reorder()` in storage if not exists

  **Must NOT do**:
  - Change the existing number field semantics
  - Add batch reorder endpoint (keep it simple — single item move)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with T1-T6)
  - **Blocks**: T17
  - **Blocked By**: None

  **References**:
  - `packages/dramacode/src/drama/index.ts` — Episode and Scene storage functions
  - `packages/dramacode/src/drama/drama.sql.ts` — Episode.number and Scene.number columns

  **Acceptance Criteria**:
  ```
  Scenario: Reorder scene changes number and shifts others
    Tool: Bash (curl)
    Steps:
      1. GET /api/drama/{id}/scenes → note scene numbers [1, 2, 3]
      2. PATCH /api/scene/{scene3Id}/reorder -d '{"number": 1}'
      3. GET /api/drama/{id}/scenes → verify numbers are [1(was3), 2(was1), 3(was2)]
    Expected Result: Scene numbers correctly shifted
    Evidence: .sisyphus/evidence/task-7-reorder.txt
  ```

  **Commit**: YES
  - Message: `feat(api): add episode/scene reorder endpoints`
  - Files: `packages/dramacode/src/server/routes/drama.ts`, `packages/dramacode/src/drama/index.ts`

---

- [ ] 8. Inline Editing: Character Cards

  **What to do**:
  - In `packages/web/src/pages/drama.tsx`, make character cards editable:
    - Click on name → inline text input
    - Click on role → dropdown select (protagonist/antagonist/supporting/extra)
    - Click on occupation/personality/backstory → inline textarea
    - ESC to cancel, blur to save (auto-save on blur via `api.drama.updateCharacter()`)
  - Show toast on save success/error
  - Add subtle edit indicator (pencil icon on hover)
  - Handle "(미정)" characters — allow editing name to remove prefix

  **Must NOT do**:
  - Extract character editing into a separate modal/page
  - Add save/cancel buttons (auto-save on blur)
  - Change character card layout structure

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: [`frontend-ui-ux`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with T9-T15)
  - **Blocks**: T16
  - **Blocked By**: T3, T6, T2

  **References**:
  - `packages/web/src/pages/drama.tsx:447-563` — Current character card rendering (namedCharacters + pendingCharacters sections)
  - `packages/web/src/lib/api.ts` — New `api.drama.updateCharacter(id, data)` method (from T6)
  - `packages/web/src/components/toast-provider.tsx` — Toast helper (from T2)
  - Character mutable fields: name, role, age, occupation, personality, backstory, arc

  **Acceptance Criteria**:
  ```
  Scenario: Click character name to edit inline
    Tool: Playwright (playwright skill)
    Steps:
      1. Navigate to http://127.0.0.1:4097/drama/{id}
      2. Click on a character name text
      3. Verify input field appears with current name
      4. Type new name "수정된이름"
      5. Click outside (blur)
      6. Verify toast "저장됨" appears
      7. Refresh page, verify name persisted
    Expected Result: Name updated inline, saved to server, persists after refresh
    Evidence: .sisyphus/evidence/task-8-char-inline-edit.png

  Scenario: ESC cancels edit
    Tool: Playwright
    Steps:
      1. Click character name
      2. Type partial text
      3. Press Escape
      4. Verify original name restored
    Expected Result: Edit cancelled, original value shown
    Evidence: .sisyphus/evidence/task-8-char-esc-cancel.png
  ```

  **Commit**: YES
  - Message: `feat(web): add inline editing for character cards`
  - Files: `packages/web/src/pages/drama.tsx`
  - Pre-commit: `bun run typecheck`

---

- [ ] 9. Inline Editing: Episode Cards

  **What to do**:
  - In `packages/web/src/pages/drama.tsx`, make episode cards editable:
    - Click title → inline text input
    - Click synopsis → inline textarea (expandable)
    - Click status → dropdown select (draft/outlined/scripted/final)
    - Auto-save on blur, toast feedback
  - Show episode number as non-editable badge

  **Must NOT do**:
  - Allow editing episode number inline (use DnD reorder instead — T17)
  - Add separate episode detail page

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: [`frontend-ui-ux`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with T8, T10-T15)
  - **Blocks**: T16, T17
  - **Blocked By**: T6, T2

  **References**:
  - `packages/web/src/pages/drama.tsx:566-586` — Current episode card rendering
  - `packages/web/src/lib/api.ts` — New `api.episode.update(id, data)` method
  - Episode mutable fields: title, synopsis, status

  **Acceptance Criteria**:
  ```
  Scenario: Edit episode title inline
    Tool: Playwright
    Steps:
      1. Navigate to drama workspace, expand Episodes section
      2. Click episode title text
      3. Type "수정된 에피소드 제목"
      4. Blur
      5. Verify toast + refresh persistence
    Expected Result: Title updated, persisted
    Evidence: .sisyphus/evidence/task-9-ep-edit.png

  Scenario: Change episode status via dropdown
    Tool: Playwright
    Steps:
      1. Click status text on episode card
      2. Select "scripted" from dropdown
      3. Verify status badge updates
    Expected Result: Status changed to "scripted"
    Evidence: .sisyphus/evidence/task-9-ep-status.png
  ```

  **Commit**: YES (groups with T10)
  - Message: `feat(web): add inline editing for episode and scene cards`
  - Files: `packages/web/src/pages/drama.tsx`

---

- [ ] 10. Inline Editing: Scene Cards

  **What to do**:
  - In `packages/web/src/pages/drama.tsx`, make scene cards editable:
    - Click location → inline text input
    - Click time_of_day badge → dropdown (DAY/NIGHT/DAWN/DUSK)
    - Click description → inline textarea
    - Auto-save on blur, toast feedback
  - Characters present tags: show add/remove buttons on hover

  **Must NOT do**:
  - Allow editing scene number inline (use DnD — T17)
  - Edit image_prompt inline (complex structure, leave as-is)

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: [`frontend-ui-ux`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with T8-T9, T11-T15)
  - **Blocks**: T16, T17
  - **Blocked By**: T6, T2

  **References**:
  - `packages/web/src/pages/drama.tsx:588-664` — Current scene card rendering (grouped by episode)
  - `packages/web/src/lib/api.ts` — New `api.scene.update(id, data)` method
  - Scene mutable fields: location, time_of_day, description, dialogue, notes

  **Acceptance Criteria**:
  ```
  Scenario: Edit scene location inline
    Tool: Playwright
    Steps:
      1. Expand Scenes section
      2. Click scene location text
      3. Type "서울 법원 앞 광장"
      4. Blur → verify toast + persistence
    Expected Result: Location updated and saved
    Evidence: .sisyphus/evidence/task-10-scene-edit.png

  Scenario: Change time of day via dropdown
    Tool: Playwright
    Steps:
      1. Click time-of-day badge (e.g., "낮")
      2. Select "밤" from dropdown
      3. Verify badge color changes to indigo (NIGHT)
    Expected Result: Time of day updated, badge color reflects change
    Evidence: .sisyphus/evidence/task-10-scene-tod.png
  ```

  **Commit**: YES (groups with T9)
  - Message: `feat(web): add inline editing for episode and scene cards`
  - Files: `packages/web/src/pages/drama.tsx`

---

- [ ] 11. Inline Editing: World & Plot Cards

  **What to do**:
  - **World cards**: Click name/description → inline edit, click category badge → dropdown select
  - **Plot cards**: Click description → inline textarea, click type badge → dropdown, click resolved indicator → toggle resolved
  - Auto-save on blur, toast feedback
  - Add delete button (✕) on hover for both world entries and plot points

  **Must NOT do**:
  - Change the visual hierarchy of plot type indicators (color bar)

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: [`frontend-ui-ux`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with T8-T10, T12-T15)
  - **Blocks**: T16
  - **Blocked By**: T4, T5, T6, T2

  **References**:
  - `packages/web/src/pages/drama.tsx:667-725` — World card rendering + Plot point rendering
  - `packages/web/src/lib/api.ts` — New `api.world.update()`, `api.plotPoint.update()`, `api.plotPoint.resolve()` methods
  - World mutable fields: category, name, description
  - PlotPoint mutable fields: type, description, resolved

  **Acceptance Criteria**:
  ```
  Scenario: Toggle plot point resolved status
    Tool: Playwright
    Steps:
      1. Expand Plot section
      2. Click the unresolved indicator on a plot point
      3. Verify ✓ resolved icon appears + toast
    Expected Result: Plot point toggled to resolved
    Evidence: .sisyphus/evidence/task-11-plot-resolve.png

  Scenario: Delete world entry
    Tool: Playwright
    Steps:
      1. Expand World section
      2. Hover over world entry, click ✕
      3. Confirm in modal
      4. Verify entry removed from list
    Expected Result: World entry deleted
    Evidence: .sisyphus/evidence/task-11-world-delete.png
  ```

  **Commit**: YES
  - Message: `feat(web): add inline editing for world and plot cards`
  - Files: `packages/web/src/pages/drama.tsx`

---

- [ ] 12. Inline Editing: Drama Metadata Header

  **What to do**:
  - In drama workspace header (`packages/web/src/pages/drama.tsx:378-392`):
    - Click title → inline text input (larger font)
    - Click genre badge → inline text input or dropdown
    - Click tone badge → inline text input or dropdown
    - Click logline → inline textarea
  - Auto-save via existing `api.drama.update()` (already has PATCH endpoint)
  - Toast feedback

  **Must NOT do**:
  - Add fields beyond existing ones (title, genre, tone, logline)
  - Change header layout structure

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: [`frontend-ui-ux`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with T8-T11, T13-T15)
  - **Blocks**: T16
  - **Blocked By**: T6, T2

  **References**:
  - `packages/web/src/pages/drama.tsx:378-392` — Current header rendering with title, genre, tone, logline
  - `packages/web/src/lib/api.ts` — Existing `api.drama.update(id, data)` method (already works)
  - Drama mutable fields: title, logline, genre, setting, tone, total_episodes

  **Acceptance Criteria**:
  ```
  Scenario: Edit drama title inline
    Tool: Playwright
    Steps:
      1. Click drama title in header
      2. Type "새로운 드라마 제목"
      3. Blur → verify toast + title updated
    Expected Result: Title changed in header and persisted
    Evidence: .sisyphus/evidence/task-12-drama-title.png
  ```

  **Commit**: YES
  - Message: `feat(web): add inline editing for drama metadata header`
  - Files: `packages/web/src/pages/drama.tsx`

---

- [ ] 13. Search/Filter in Project Panel

  **What to do**:
  - Add search input at top of project data panel (above sections)
  - Create `packages/web/src/components/search-input.tsx`:
    - Input with magnifying glass icon, clear button
    - Korean IME handling: use `compositionend` event + `@solid-primitives/scheduled` debounce (300ms)
    - Filter state as SolidJS signal
  - Filter characters by name/personality/occupation
  - Filter episodes by title/synopsis
  - Filter scenes by location/description/characters_present
  - Filter world by name/description
  - Filter plot by description
  - Use `createMemo()` for client-side filtering (no API calls)
  - Show match count per section in badge
  - Empty state: "검색 결과 없음"

  **Must NOT do**:
  - Add server-side search API (client-side filter is sufficient for this data size)
  - Add complex query syntax (simple text contains match)

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: [`frontend-ui-ux`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with T8-T12, T14-T15)
  - **Blocks**: T16
  - **Blocked By**: T1

  **References**:
  - `packages/web/src/pages/drama.tsx:408-419` — Panel header where search input should go
  - `packages/web/src/pages/drama.tsx:279-292` — `count()` function per section (update to reflect filtered count)
  - `@solid-primitives/scheduled` docs for debounce: https://github.com/solidjs-community/solid-primitives/tree/main/packages/scheduled

  **WHY compositionend**: Korean IME composes characters incrementally (ㅎ→하→한). Without compositionend, search triggers on each keystroke during composition, showing nonsensical intermediate results.

  **Acceptance Criteria**:
  ```
  Scenario: Korean text search filters characters
    Tool: Playwright
    Steps:
      1. Navigate to drama workspace
      2. Type "김" in search input
      3. Wait 400ms for debounce
      4. Verify only characters with "김" in name are shown
      5. Verify section badge shows filtered count
    Expected Result: Characters filtered, count badge updated
    Evidence: .sisyphus/evidence/task-13-search-filter.png

  Scenario: Clear search restores all items
    Tool: Playwright
    Steps:
      1. With active search, click clear (✕) button
      2. Verify all items restored
    Expected Result: Full list restored
    Evidence: .sisyphus/evidence/task-13-search-clear.png
  ```

  **Commit**: YES
  - Message: `feat(web): add search/filter for project data panel`
  - Files: `packages/web/src/components/search-input.tsx`, `packages/web/src/pages/drama.tsx`

---

- [ ] 14. Dashboard Improvements

  **What to do**:
  - In `packages/web/src/pages/dashboard.tsx`:
    - Add per-project stats badges: character count, episode count, scene count
    - Fetch counts via existing list APIs or add lightweight count endpoint
    - Sort projects by `time_updated` (most recent first) — already sorted by default?
    - Add search input to filter projects by title
    - Show "최근 수정" relative time (e.g., "3시간 전")
  - Keep current card layout, just enhance information density

  **Must NOT do**:
  - Add grid/list view toggle (keep current list)
  - Add project templates or clone feature
  - Add project thumbnails (no project-level images yet)

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: [`frontend-ui-ux`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with T8-T13, T15)
  - **Blocks**: None
  - **Blocked By**: T6

  **References**:
  - `packages/web/src/pages/dashboard.tsx` — Current dashboard (113 lines, simple list)
  - `packages/web/src/lib/api.ts` — `api.drama.list()` returns Drama objects with title, genre, tone, total_episodes, logline, time_updated

  **Acceptance Criteria**:
  ```
  Scenario: Dashboard shows project stats
    Tool: Playwright
    Steps:
      1. Navigate to http://127.0.0.1:4097
      2. Verify each project card shows character/episode/scene count badges
      3. Verify relative time display (e.g., "3시간 전")
    Expected Result: Stats visible on each card
    Evidence: .sisyphus/evidence/task-14-dashboard-stats.png

  Scenario: Dashboard search filters projects
    Tool: Playwright
    Steps:
      1. Type project name in search input
      2. Verify only matching projects shown
    Expected Result: Projects filtered by title
    Evidence: .sisyphus/evidence/task-14-dashboard-search.png
  ```

  **Commit**: YES
  - Message: `feat(web): improve dashboard with stats and search`
  - Files: `packages/web/src/pages/dashboard.tsx`

---

- [ ] 15. Fountain Export Backend Endpoint

  **What to do**:
  - Add to `packages/dramacode/src/server/routes/drama.ts`:
    - `GET /drama/:id/export/fountain` → returns `.fountain` text
    - Query param: `?episode={number}` for single episode export (omit for full)
  - Create `packages/dramacode/src/drama/fountain.ts`:
    - Convert Scene data → Fountain format
    - Korean character names: always use `@` prefix (e.g., `@김서연`)
    - Scene heading: `INT. {location} - {time_of_day}` or `EXT. {location} - {time_of_day}`
    - Default to INT. if no INT/EXT info available
    - Map time_of_day: DAY→DAY, NIGHT→NIGHT, DAWN→DAWN, DUSK→DUSK
    - Scene description → action paragraphs
    - Scene dialogue → parse "캐릭터명: 대사" format into Fountain character+dialogue blocks
    - Scene notes → Fountain notes `[[note text]]`
    - Episode title → `# Episode {number}: {title}` (Fountain section heading)
  - Set response header: `Content-Type: text/plain; charset=utf-8`

  **Must NOT do**:
  - Add PDF generation (only .fountain text format)
  - Use external Fountain library (simple string concatenation is sufficient)
  - Modify scene data during export

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with T8-T14)
  - **Blocks**: T18
  - **Blocked By**: None

  **References**:
  - `packages/dramacode/src/drama/drama.sql.ts` — Scene table: dialogue, description, notes, location, time_of_day, characters_present
  - `packages/dramacode/src/drama/index.ts` — `Scene.listByDrama()`, `Episode.listByDrama()` for data fetching
  - Fountain spec: https://fountain.io/syntax — Character (`@Name`), Scene Heading (`INT./EXT.`), Action, Dialogue, Notes

  **Acceptance Criteria**:
  ```
  Scenario: Export full drama as Fountain
    Tool: Bash (curl)
    Steps:
      1. curl -X GET http://127.0.0.1:4097/api/drama/{id}/export/fountain
      2. Verify Content-Type is text/plain
      3. Verify output contains Fountain-format scene headings (INT./EXT.)
      4. Verify Korean character names have @ prefix
    Expected Result: Valid Fountain text with Korean character names
    Evidence: .sisyphus/evidence/task-15-fountain-export.fountain

  Scenario: Export single episode
    Tool: Bash (curl)
    Steps:
      1. curl -X GET http://127.0.0.1:4097/api/drama/{id}/export/fountain?episode=1
      2. Verify only episode 1 scenes are included
    Expected Result: Single episode Fountain output
    Evidence: .sisyphus/evidence/task-15-fountain-single-ep.fountain
  ```

  **Commit**: YES
  - Message: `feat(api): add Fountain format export endpoint`
  - Files: `packages/dramacode/src/drama/fountain.ts`, `packages/dramacode/src/server/routes/drama.ts`

---

- [ ] 16. ⌘K Command Palette + Keyboard Shortcuts

  **What to do**:
  - Create `packages/web/src/components/command-palette.tsx`:
    - Use `cmdk-solid` for fuzzy-searchable command list
    - Style to match dark theme (bg-bg, border-border, text-text)
    - Open with `⌘K` (Mac) / `Ctrl+K` (Windows)
  - Register shortcuts with `@solid-primitives/keyboard`:
    - `⌘K` → open command palette
    - `⌘N` → new session (in drama workspace)
    - `⌘1~5` → toggle sections (등장인물/에피소드/장면/세계관/플롯)
    - `⌘\` → toggle project panel
    - `⌘E` → export Fountain
  - **CRITICAL**: Guard ALL shortcuts against input/textarea focus:
    ```tsx
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el?.getAttribute('contenteditable')) return
    ```
  - Command palette actions:
    - Navigate: 대시보드, 각 드라마 프로젝트
    - Section: 등장인물/에피소드/장면/세계관/플롯 토글
    - Action: 새 대화, Fountain 내보내기
  - Add keyboard shortcut help overlay (⌘? or bottom of palette)

  **Must NOT do**:
  - Override browser defaults (⌘C, ⌘V, ⌘Z, etc.)
  - Add vim-style navigation

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: [`frontend-ui-ux`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with T17, T18)
  - **Blocks**: F1-F4
  - **Blocked By**: T1, T2

  **References**:
  - `packages/web/src/app.tsx` — Root component for global shortcut registration
  - `packages/web/src/pages/drama.tsx:180-186` — `expanded` signal for section toggles
  - `packages/web/src/pages/drama.tsx:187` — `panelOpen` signal for panel toggle
  - `packages/web/src/pages/drama.tsx:247-251` — `create()` function for new session
  - cmdk-solid: https://github.com/niconiahi/cmdk-solid
  - @solid-primitives/keyboard: https://github.com/solidjs-community/solid-primitives/tree/main/packages/keyboard

  **Acceptance Criteria**:
  ```
  Scenario: ⌘K opens command palette
    Tool: Playwright
    Steps:
      1. Navigate to drama workspace
      2. Press Meta+K
      3. Verify command palette overlay appears
      4. Type "장면" in search
      5. Verify "장면" section toggle action filtered
      6. Press Enter → verify scenes section expands
    Expected Result: Palette opens, search works, action executes
    Evidence: .sisyphus/evidence/task-16-cmdk-open.png

  Scenario: Shortcuts don't fire in input fields
    Tool: Playwright
    Steps:
      1. Click on a character name to enter edit mode (inline input)
      2. Press Meta+K while input is focused
      3. Verify command palette does NOT open
    Expected Result: Shortcut suppressed in input context
    Evidence: .sisyphus/evidence/task-16-shortcut-guard.png

  Scenario: ⌘N creates new session
    Tool: Playwright
    Steps:
      1. In drama workspace (no input focused)
      2. Press Meta+N
      3. Verify new session tab appears
    Expected Result: New session created via keyboard
    Evidence: .sisyphus/evidence/task-16-new-session.png
  ```

  **Commit**: YES
  - Message: `feat(web): add command palette and keyboard shortcuts`
  - Files: `packages/web/src/components/command-palette.tsx`, `packages/web/src/app.tsx`, `packages/web/src/pages/drama.tsx`

---

- [ ] 17. Drag-and-Drop Reordering

  **What to do**:
  - Integrate `@thisbeyond/solid-dnd` in drama workspace:
    - Episodes section: drag to reorder episode numbers
    - Scenes within episode group: drag to reorder scene numbers
  - On drop: call `api.episode.reorder()` or `api.scene.reorder()` (from T7)
  - Visual feedback: drag handle on left, drop placeholder, smooth animation
  - Toast on successful reorder
  - Handle macOS Meta key "stuck" issue: configure DnD with proper keyboard modifier handling

  **Must NOT do**:
  - Allow cross-episode scene dragging (keep scenes within their episode group)
  - Allow character/world/plot reordering (no natural ordering)
  - Add drag-and-drop to dashboard (project reorder not needed)

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: [`frontend-ui-ux`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with T16, T18)
  - **Blocks**: F1-F4
  - **Blocked By**: T1, T7

  **References**:
  - `packages/web/src/pages/drama.tsx:566-586` — Episode cards (add drag handle + DnD wrapper)
  - `packages/web/src/pages/drama.tsx:588-664` — Scene cards grouped by episode
  - `packages/web/src/lib/api.ts` — New `api.episode.reorder()`, `api.scene.reorder()` methods
  - @thisbeyond/solid-dnd docs: https://github.com/thisbeyond/solid-dnd

  **Acceptance Criteria**:
  ```
  Scenario: Drag scene to new position
    Tool: Playwright
    Steps:
      1. Expand Scenes section
      2. Drag Scene #3 above Scene #1
      3. Verify scene numbers update to [3→1, 1→2, 2→3]
      4. Refresh page → verify order persisted
    Expected Result: Scene order changed and persisted
    Evidence: .sisyphus/evidence/task-17-dnd-scene.png

  Scenario: Drag episode to reorder
    Tool: Playwright
    Steps:
      1. Expand Episodes section
      2. Drag Episode 2 above Episode 1
      3. Verify episode numbers swap
    Expected Result: Episode order changed
    Evidence: .sisyphus/evidence/task-17-dnd-episode.png
  ```

  **Commit**: YES
  - Message: `feat(web): add drag-and-drop reordering for episodes and scenes`
  - Files: `packages/web/src/pages/drama.tsx`

---

- [ ] 18. Fountain Export Frontend UI + Download

  **What to do**:
  - Add export button in drama workspace header (next to genre/tone badges):
    - Icon button with download symbol
    - Dropdown: "전체 내보내기" / "에피소드별 내보내기" (list episodes)
  - On click: fetch `GET /api/drama/:id/export/fountain` → trigger browser download as `.fountain` file
  - Filename: `{drama.title}.fountain` or `{drama.title}_ep{number}.fountain`
  - Show toast on download start
  - Also add "Fountain 내보내기" action in command palette (T16)

  **Must NOT do**:
  - Add preview modal (direct download)
  - Add PDF export option

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: [`frontend-ui-ux`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with T16, T17)
  - **Blocks**: F1-F4
  - **Blocked By**: T2, T15

  **References**:
  - `packages/web/src/pages/drama.tsx:378-392` — Header where export button should go
  - `packages/web/src/lib/api.ts` — Add `api.drama.exportFountain(id, episode?)` method
  - `packages/web/src/components/toast-provider.tsx` — Toast for download feedback

  **Acceptance Criteria**:
  ```
  Scenario: Export full drama as Fountain file
    Tool: Playwright
    Steps:
      1. Click export button in header
      2. Select "전체 내보내기"
      3. Verify .fountain file downloaded
      4. Read file content → verify Fountain syntax (INT./EXT. headings, @character names)
    Expected Result: Valid .fountain file downloaded
    Evidence: .sisyphus/evidence/task-18-fountain-download.fountain

  Scenario: Export single episode
    Tool: Playwright
    Steps:
      1. Click export button
      2. Select specific episode from dropdown
      3. Verify file named "{title}_ep{N}.fountain" downloaded
    Expected Result: Single episode exported
    Evidence: .sisyphus/evidence/task-18-fountain-single.fountain
  ```

  **Commit**: YES
  - Message: `feat(web): add Fountain export UI with download`
  - Files: `packages/web/src/pages/drama.tsx`, `packages/web/src/lib/api.ts`

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Rejection → fix → re-run.

- [ ] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, curl endpoint, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
  Run `bun run typecheck`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names.
  Output: `Typecheck [PASS/FAIL] | Files [N clean/N issues] | VERDICT`

- [ ] F3. **Real Manual QA** — `unspecified-high` (+ `playwright` skill)
  Start from clean state. Execute EVERY QA scenario from EVERY task — follow exact steps, capture evidence. Test cross-task integration: inline edit → search filters updated content, ⌘K → toggle section → DnD reorder, export after edits. Test edge cases: empty state, rapid clicks, long text, special characters. Save to `.sisyphus/evidence/final-qa/`.
  Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual diff. Verify 1:1 — everything in spec was built, nothing beyond spec was built. Check "Must NOT do" compliance. Detect cross-task contamination. Flag unaccounted changes.
  Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | VERDICT`

---

## Commit Strategy

| After Task(s) | Message | Key Files |
|--------------|---------|-----------|
| T1 | `feat(web): add UX improvement dependencies` | package.json, bun.lock |
| T2 | `feat(web): add toast notification system` | toast-provider.tsx, app.tsx |
| T3+T4+T5 | `feat(api): add Character/World/PlotPoint CRUD routes` | routes/drama.ts |
| T6 | `feat(web): add complete CRUD client methods` | api.ts |
| T7 | `feat(api): add episode/scene reorder endpoints` | routes/drama.ts, drama/index.ts |
| T8 | `feat(web): inline editing for character cards` | drama.tsx |
| T9+T10 | `feat(web): inline editing for episode and scene cards` | drama.tsx |
| T11 | `feat(web): inline editing for world and plot cards` | drama.tsx |
| T12 | `feat(web): inline editing for drama metadata header` | drama.tsx |
| T13 | `feat(web): search/filter for project data panel` | search-input.tsx, drama.tsx |
| T14 | `feat(web): improve dashboard with stats and search` | dashboard.tsx |
| T15 | `feat(api): add Fountain format export endpoint` | fountain.ts, routes/drama.ts |
| T16 | `feat(web): command palette and keyboard shortcuts` | command-palette.tsx, app.tsx, drama.tsx |
| T17 | `feat(web): drag-and-drop reordering` | drama.tsx |
| T18 | `feat(web): Fountain export UI with download` | drama.tsx, api.ts |

---

## Success Criteria

### Verification Commands
```bash
bun run typecheck  # Expected: zero errors
curl http://127.0.0.1:4097/api/character/{id}  # Expected: 200 with character data
curl http://127.0.0.1:4097/api/drama/{id}/export/fountain  # Expected: valid Fountain text
```

### Final Checklist
- [ ] All 7 features functional in UI
- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] `bun run typecheck` passes
- [ ] Fountain export produces valid .fountain syntax
- [ ] Korean IME search works correctly
- [ ] Keyboard shortcuts work on Mac + Windows
- [ ] DnD reorder persists after refresh
- [ ] Toast appears for all user actions
