# DRAMACODE 릴리스 및 배포 가이드

## 아키텍처 개요

DRAMACODE는 **로컬-퍼스트 데스크톱 앱**입니다. SaaS가 아니라 사용자 PC에서 직접 실행됩니다.

```
[사용자 PC]
  ├─ dramacode (Bun standalone binary)
  │   ├─ Hono API server (port 4097)
  │   ├─ Static file serving (SPA)
  │   ├─ SQLite DB (로컬 저장)
  │   └─ OpenAI API 호출 (device code auth)
  ├─ web/ (React SPA 빌드 산출물)
  ├─ migration/ (DB 마이그레이션 파일)
  └─ vec0.{dylib|dll} (sqlite-vec 네이티브 확장)
```

## 빌드 시스템

### 기술 스택

- **런타임**: [Bun](https://bun.sh/) — TypeScript 실행 + 컴파일러 + 패키지 매니저
- **컴파일**: `bun build --compile` — Bun 런타임 내장 standalone 바이너리 생성
- **프론트엔드**: Vite + React (SPA)
- **DB**: SQLite + [sqlite-vec](https://github.com/asg017/sqlite-vec) (벡터 검색)
- **패키징**: macOS DMG (`hdiutil`), Windows zip + BAT

### 빌드 명령어

```bash
# 현재 플랫폼용 빌드
bun run scripts/build.ts

# 특정 타겟 크로스 빌드
bun run scripts/build.ts bun-darwin-arm64
bun run scripts/build.ts bun-darwin-x64
bun run scripts/build.ts bun-windows-x64
```

### 빌드 파이프라인 (`scripts/build.ts`)

```
[1/4] Web 빌드     → packages/web → Vite build → packages/web/dist/
[2/4] 바이너리 컴파일 → bun build --compile → dist/dramacode{.exe}
[3/4] 에셋 복사     → web/, migration/ → dist/
[4/4] 네이티브 확장  → vec0.{dylib|dll|so} → dist/

후처리:
  ├─ Windows: Start DRAMACODE.bat 생성
  ├─ zip 아카이브 생성 (자동 업데이터용, 항상)
  └─ macOS: .app 번들 → DMG 생성 (신규 설치용)
```

### 빌드 산출물

| 타겟 | 산출물 | 용도 |
|------|--------|------|
| `bun-darwin-arm64` | `dramacode-darwin-arm64.zip` + `DRAMACODE-mac-arm64.dmg` | Apple Silicon Mac |
| `bun-darwin-x64` | `dramacode-darwin-x64.zip` + `DRAMACODE-mac-x64.dmg` | Intel Mac |
| `bun-windows-x64` | `dramacode-windows-x64.zip` (BAT 포함) | Windows |

- **DMG**: 신규 설치용 (drag-to-Applications)
- **zip**: 자동 업데이터가 사용 (바이너리 교체)

### macOS .app 번들 구조

```
DRAMACODE.app/
  Contents/
    Info.plist            (CFBundleExecutable: launcher)
    MacOS/
      launcher            (bash: exec dramacode serve --open)
      dramacode           (standalone binary)
      web/                (SPA)
      migration/          (DB migrations)
      vec0.dylib          (sqlite-vec)
```

### 주요 빌드 주의사항

| 이슈 | 해결 방법 |
|------|----------|
| `sqlite-vec` 네이티브 확장이 컴파일 바이너리에 포함 안됨 | CI에서 타겟 플랫폼별 패키지 설치 후 `vec0.*` 파일 별도 복사 |
| `import.meta.dirname`이 컴파일 바이너리에서 다름 | `process.execPath` 기반 경로 해석 사용 |
| `xdg-basedir` Windows 미지원 | `packages/dramacode/src/global/index.ts`에서 직접 플랫폼별 경로 계산 |
| macOS Gatekeeper 경고 | 코드 서명/공증 필요 (TODO) |
| Windows SmartScreen 경고 | 코드 서명 필요 (TODO) |

---

## CI/CD 파이프라인

### 워크플로우: `.github/workflows/release.yml`

**트리거**: `v*` 패턴의 git 태그 push

```
git tag v1.2.3
git push origin v1.2.3
```

### 파이프라인 흐름

```
v* 태그 push
  │
  ├─ build (matrix: 3 jobs 병렬)
  │   ├─ macos-latest → bun-darwin-arm64 → zip + DMG
  │   ├─ macos-latest → bun-darwin-x64 (cross-compile) → zip + DMG
  │   └─ windows-latest → bun-windows-x64 → zip (BAT 포함)
  │
  └─ release (build 완료 후)
      ├─ 모든 아티팩트 다운로드
      └─ GitHub Release 생성 (softprops/action-gh-release)
          ├─ Release Notes 자동 생성
          └─ 에셋 첨부: *.zip + *.dmg
```

### 빌드 매트릭스

| Runner | Target | 산출물 |
|--------|--------|--------|
| `macos-latest` (ARM64) | `bun-darwin-arm64` | zip + DMG |
| `macos-latest` (ARM64) | `bun-darwin-x64` | zip + DMG (cross-compile) |
| `windows-latest` | `bun-windows-x64` | zip |

### 환경 변수

| 변수 | 용도 | 값 |
|------|------|-----|
| `VERSION` | 빌드 버전 (Info.plist, BAT 표시용) | `${{ github.ref_name }}` (예: `v1.2.3`) |

### CI 주의사항

| 이슈 | 해결 |
|------|------|
| `macos-13` runner 폐지됨 | `macos-latest` (ARM64)에서 x64 cross-compile |
| sqlite-vec 타겟별 설치 | `bun add sqlite-vec-{os}-{arch} --no-save` |
| zip 명령 Windows 미지원 | `tar -a -cf` fallback |

---

## 릴리스 절차

### 새 버전 릴리스

```bash
# 1. 버전 확인 (packages/dramacode/src/index.ts의 VERSION 상수)
# 2. 변경 내역 업데이트 (아래 체크리스트 참고)
# 3. 태그 생성 및 푸시
git tag v1.2.3
git push origin v1.2.3

# 4. GitHub Actions가 자동으로:
#    - 3개 플랫폼 빌드
#    - GitHub Release 생성
#    - 에셋 업로드

# 5. https://github.com/NewTurn2017/dramacode/releases 에서 확인
```

### 변경 내역 (Changelog) 업데이트 — 매 배포 시 필수

배포 전에 반드시 아래 두 파일을 업데이트합니다:

| 파일 | 용도 | 비고 |
|------|------|------|
| `packages/web/src/changelog.ts` | 앱 내 표시 (사이드바 "변경내역" 링크) | **소스 오브 트루스** — 배열 맨 앞에 새 항목 추가 |
| `CHANGELOG.md` | GitHub 저장소 표시용 | changelog.ts와 동일 내용 유지 |

**작성 규칙:**
- 기능(features) 위주로 작성 — 사용자가 체감할 수 있는 변화만
- 내부 리팩토링, 코드 정리 등 개발 사항은 생략
- 각 항목은 "무엇을 할 수 있는지" 중심으로 한 줄 설명
- 카테고리: `features` (새 기능), `improvements` (개선), `fixes` (수정)

### 버전 관리

- 소스 코드의 VERSION 상수: `packages/dramacode/src/index.ts`
- CI에서는 `VERSION` 환경변수로 태그명 전달 (빌드 스크립트가 `process.env.VERSION` 사용)
- `v` 접두사는 자동 제거 (`v1.2.3` → `1.2.3`)

### Semantic Versioning

```
vMAJOR.MINOR.PATCH
  │     │     └─ 버그 수정, 사소한 변경
  │     └─ 새 기능 추가 (하위 호환)
  └─ Breaking change (DB 스키마 변경 등)
```

---

## 자동 업데이트 시스템

### 작동 방식

```
앱 실행 → 5분마다 GitHub Releases API 체크
  │
  ├─ 새 버전 발견
  │   └─ 사이드바에 "vX.X.X 업데이트 가능" 버튼 표시
  │
  └─ 사용자 클릭
      ├─ POST /api/update/apply
      ├─ zip 다운로드 (progress 표시)
      ├─ 바이너리 교체
      │   ├─ macOS/Linux: 기존 삭제 → 새 파일 복사 → chmod +x
      │   └─ Windows: 기존 → .old 이름 변경 → 새 파일 복사
      └─ 프로세스 재시작
          ├─ macOS/Linux: spawnSync로 자기 자신 재실행
          └─ Windows: detached spawn 후 exit
```

### API 엔드포인트

| 엔드포인트 | 메서드 | 설명 |
|-----------|--------|------|
| `/api/update/check` | GET | 업데이트 확인 → `{ version, hasUpdate, latest, releaseUrl, size }` |
| `/api/update/apply` | POST | 다운로드 + 적용 + 재시작 예약 |

### 핵심 모듈

- `packages/dramacode/src/update/index.ts` — `Updater` namespace
- `packages/web/src/app.tsx` — `VersionBadge` 컴포넌트
- `packages/web/src/lib/api.ts` — `api.update` namespace

### GitHub 연동

- **저장소**: `NewTurn2017/dramacode`
- **API**: `https://api.github.com/repos/NewTurn2017/dramacode/releases/latest`
- **에셋 매칭**: `dramacode-{platform}-{arch}.zip` 패턴으로 현재 플랫폼에 맞는 zip 자동 선택

---

## 핵심 파일 맵

```
dramacode/
  ├─ .github/workflows/release.yml     # CI/CD 파이프라인
  ├─ scripts/build.ts                   # 빌드 스크립트
  ├─ packages/
  │   ├─ dramacode/
  │   │   ├─ src/index.ts               # VERSION 상수, 엔트리포인트
  │   │   ├─ src/update/index.ts        # Updater (check/download/apply/restart)
  │   │   ├─ src/server/server.ts       # API 서버 (update 엔드포인트 포함)
  │   │   ├─ src/cli/cmd/serve.ts       # serve 명령 (cleanupOldBinary)
  │   │   └─ migration/                 # DB 마이그레이션
  │   └─ web/
  │       ├─ src/app.tsx                # VersionBadge, AuthSection
  │       └─ src/lib/api.ts            # api.update namespace
  ├─ docs/
  │   ├─ release-guide.md              # 이 파일
  │   └─ oauth.md                      # OpenAI 인증 문서
  └─ README.md                         # 사용자용 설치 가이드
```

---

## TODO (향후 작업)

- [ ] **macOS 코드 서명 & 공증** — Apple Developer ID로 서명 → Gatekeeper 경고 제거
- [ ] **Windows 코드 서명** — EV 인증서로 서명 → SmartScreen 경고 제거
- [ ] **Linux 지원** — `bun-linux-x64` 타겟 + AppImage 또는 .deb 패키징
- [ ] **자동 업데이트 알림** — 앱 시작 시 강제 업데이트 (critical 버전용)
- [ ] **Delta 업데이트** — 전체 zip 대신 변경된 파일만 다운로드
- [ ] **Tauri 마이그레이션** — 네이티브 윈도우 래핑 (Phase 2)
