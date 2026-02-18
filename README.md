# DRAMACODE

AI 기반 드라마 각본 도구. OpenAI 또는 Anthropic(Claude)를 활용하여 캐릭터, 에피소드, 장면을 구조적으로 작성합니다.

## 설치 및 실행

### 1. 다운로드

[최신 릴리스 페이지](https://github.com/NewTurn2017/dramacode/releases/latest)에서 본인 컴퓨터에 맞는 파일을 다운로드합니다.

| 운영체제 | 다운로드 |
|----------|----------|
| **Mac (Apple Silicon)** — M1, M2, M3, M4 칩 | [DRAMACODE-mac-arm64.dmg](https://github.com/NewTurn2017/dramacode/releases/latest/download/DRAMACODE-mac-arm64.dmg) |
| **Mac (Intel)** — 2020년 이전 Mac | [DRAMACODE-mac-x64.dmg](https://github.com/NewTurn2017/dramacode/releases/latest/download/DRAMACODE-mac-x64.dmg) |
| **Windows** | [dramacode-windows-x64.zip](https://github.com/NewTurn2017/dramacode/releases/latest/download/dramacode-windows-x64.zip) |

> **내 Mac이 어떤 칩인지 모르겠다면?**
> 좌측 상단  메뉴 →「이 Mac에 관하여」→ 칩 항목이 "Apple M~"이면 Apple Silicon, "Intel"이면 Intel입니다.

### 2. 설치

#### Mac

1. 다운로드한 `.dmg` 파일을 더블 클릭합니다
2. 열린 창에서 **DRAMACODE** 앱을 **Applications** 폴더로 드래그합니다
3. 완료되면 DMG 창을 닫습니다

#### Windows

1. 다운로드한 `.zip` 파일을 우클릭 →「압축 풀기」
2. 원하는 위치에 압축을 풉니다 (예: 바탕화면)

### 3. Mac 사전 준비 — Homebrew & SQLite (권장)

DRAMACODE의 **벡터 검색(RAG)** 기능을 사용하려면 Homebrew와 SQLite 설치가 필요합니다.
설치하지 않아도 앱은 정상 실행되지만, 벡터 검색 기능이 비활성화됩니다.

**터미널**을 열고 아래 명령어를 순서대로 실행합니다:

```bash
# 1. Homebrew 설치 (이미 설치되어 있으면 생략)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# 2. SQLite 설치
brew install sqlite
```

> **터미널 여는 법**: Spotlight(⌘ + Space) → "터미널" 검색 → Enter

### 4. 실행

#### Mac

**응용 프로그램** 폴더 (또는 Launchpad)에서 **DRAMACODE** 를 더블 클릭합니다.

처음 실행 시 **"개발자를 확인할 수 없습니다"** 경고가 나올 수 있습니다:

1. **시스템 설정** → **개인정보 보호 및 보안** 으로 이동
2. 하단에 "DRAMACODE" 관련 차단 메시지가 표시됨
3. **「확인 없이 열기」** 클릭
4. 다시 DRAMACODE를 더블 클릭

#### Windows

압축 해제한 폴더에서 **`Start DRAMACODE.bat`** 파일을 더블 클릭합니다.

> Windows Defender SmartScreen 경고가 나오면「추가 정보」→「실행」을 클릭합니다.

#### 실행 성공 시

브라우저가 자동으로 열리며 DRAMACODE 화면이 표시됩니다.
자동으로 열리지 않으면 브라우저에서 직접 http://127.0.0.1:4097 에 접속합니다.

### 5. AI 서비스 연결 (OpenAI / Claude)

DRAMACODE를 사용하려면 **OpenAI** 또는 **Anthropic(Claude)** 계정 중 하나가 필요합니다.
둘 다 연결하면 Anthropic이 기본으로 사용되며, 필요에 따라 전환됩니다.

> **벡터 검색(RAG)** 기능은 OpenAI 연결 시에만 활성화됩니다. Claude만 연결해도 기본 기능은 모두 사용 가능합니다.

---

#### 방법 A — OpenAI 연결

##### 사전 준비 — MFA 설정 (이메일/비밀번호 로그인 사용자)

이메일/비밀번호로 ChatGPT에 로그인하는 분은 **다중 인증(MFA)**을 먼저 설정해야 합니다.

1. [chatgpt.com/settings](https://chatgpt.com/settings) 접속 → **보안(Security)** 메뉴
2. **Multi-factor authentication** 활성화
3. 인증 앱(Google Authenticator, Microsoft Authenticator 등)으로 QR 코드 스캔
4. 6자리 코드 입력 후 복구 코드 안전하게 보관

> Google/Microsoft/Apple 소셜 로그인 사용자는 ChatGPT MFA 설정이 불필요합니다.

##### 로그인

1. 사이드바 하단의 **「OpenAI 로그인」** 버튼 클릭
2. 화면에 **인증 코드**(예: `ABCD-EFGHI`)가 표시됨
3. 자동으로 열리는 [인증 페이지](https://auth.openai.com/codex/device)에 코드 입력
4. OpenAI 계정으로 로그인 (MFA 코드 입력 포함)
5. 권한 승인하면 DRAMACODE가 자동으로 연결됨

사이드바에 **「● OpenAI 연결됨」** 이 표시되면 완료입니다.

---

#### 방법 B — Anthropic (Claude) 연결

1. 사이드바 하단의 **「Claude 로그인」** 버튼 클릭
2. 브라우저에서 **Anthropic 인증 페이지**가 자동으로 열림
3. Claude 계정으로 로그인 후 **권한 승인**
4. 화면에 표시된 **인증 코드를 복사**
5. DRAMACODE로 돌아와서 코드를 **입력란에 붙여넣기** 후 「연결」 클릭

사이드바에 **「● Claude 연결됨」** 이 표시되면 완료입니다.

---

> 모르는 부분이 있으면 사이드바의 **?** 버튼을 클릭하여 상세 가이드를 확인할 수 있습니다.

### 6. 업데이트

새 버전이 나오면 사이드바 하단에 **「vX.X.X 업데이트 가능」** 버튼이 표시됩니다. 클릭하면 자동으로 다운로드 → 교체 → 재시작됩니다.

## 종료

- **Mac**: Dock에서 DRAMACODE 아이콘을 우클릭 →「종료」
- **Windows**: 명령 프롬프트 창을 닫거나 `Ctrl+C`

## 문제 해결

| 증상 | 해결 |
|------|------|
| Mac "개발자를 확인할 수 없습니다" | 시스템 설정 → 개인정보 보호 및 보안 → 하단「확인 없이 열기」 |
| Mac "DRAMACODE.app이 손상되었습니다" | 터미널에서 `xattr -cr /Applications/DRAMACODE.app` 실행 후 다시 열기 |
| Windows SmartScreen 경고 | 「추가 정보」→「실행」 |
| "MFA required" 오류 (OpenAI) | [chatgpt.com/settings](https://chatgpt.com/settings) → 보안에서 MFA 활성화 |
| "Please contact your workspace admin" (OpenAI) | 팀/워크스페이스 관리자에게 device code 인증 허용 요청 |
| OpenAI 인증 코드 입력 후 반응 없음 | 5분 타임아웃. 다시 로그인 버튼 클릭 |
| Claude 인증 코드 붙여넣기 후 연결 안 됨 | 코드 앞뒤 공백 없이 정확히 복사했는지 확인. 다시 로그인 시도 |
| Claude 로그인 페이지가 안 열림 | 브라우저 팝업 차단 확인. 직접 표시된 URL을 브라우저에 붙여넣기 |
| 포트 충돌 | `./dramacode serve --port 8080 --open` 으로 다른 포트 사용 |
| Mac 벡터 검색이 안 됨 | 터미널에서 `brew install sqlite` 실행 후 앱 재시작 (Homebrew 없으면 먼저 설치) |
| Claude만 연결했는데 벡터 검색이 안 됨 | 벡터 검색(RAG)은 OpenAI 연결 시에만 활성화. OpenAI도 함께 연결하세요 |

## 라이선스

MIT
