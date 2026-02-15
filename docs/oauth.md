---
OpenAI OAuth 구현 상세 문서
> 소스: opencode 프로젝트의 packages/opencode/src/plugin/codex.ts 및 관련 파일 기준
---
1. 시스템 개요
1.1 관련 파일 전체 목록
| 파일 | 역할 |
|------|------|
| src/plugin/codex.ts | 핵심 구현. PKCE 생성, 로컬 콜백 서버, 토큰 교환, 토큰 갱신, API 프록시 fetch |
| src/auth/index.ts | 토큰 영속 저장소. ~/.opencode/data/auth.json에 JSON으로 저장 |
| src/provider/auth.ts | 플러그인 ↔ 인증 브릿지. authorize() → callback() 2단계 조율 |
| src/server/routes/provider.ts | HTTP API 엔드포인트. POST /provider/:id/oauth/authorize, callback |
| src/cli/cmd/auth.ts | CLI opencode auth login 명령에서의 인증 플로우 |
| src/plugin/index.ts | 플러그인 로딩. CodexAuthPlugin을 내장 플러그인으로 등록 |
| src/provider/provider.ts | loader()를 호출하여 런타임에 provider 옵션(custom fetch 등)을 주입 |
| src/session/llm.ts | LLM 호출 시 isCodex 판별 후 Codex 전용 옵션 분기 |
| src/agent/agent.ts | agent 생성 시 OpenAI OAuth일 때 streamObject 분기 |
| packages/plugin/src/index.ts | AuthHook, AuthOuathResult 등 플러그인 타입 정의 |
1.2 상수
const CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann"
const ISSUER = "https://auth.openai.com"
const CODEX_API_ENDPOINT = "https://chatgpt.com/backend-api/codex/responses"
const OAUTH_PORT = 1455
const OAUTH_POLLING_SAFETY_MARGIN_MS = 3000  // Device Flow 폴링 시 추가 대기(ms)
---
2. 인증 저장 스키마
2.1 타입 정의 (src/auth/index.ts)
// OAuth 인증 (ChatGPT Pro/Plus 로그인 시)
const Oauth = z.object({
  type: z.literal("oauth"),
  refresh: z.string(),       // refresh_token
  access: z.string(),        // access_token
  expires: z.number(),       // 만료 시각 (Date.now() + expires_in * 1000)
  accountId: z.string().optional(),     // ChatGPT 계정 ID (조직 구독용)
  enterpriseUrl: z.string().optional(), // (Copilot 전용, OpenAI에서는 미사용)
})
// API Key 인증 (수동 입력 시)
const Api = z.object({
  type: z.literal("api"),
  key: z.string(),
})
2.2 저장소 구현
// 파일 경로
const filepath = path.join(Global.Path.data, "auth.json")
// 예: ~/.opencode/data/auth.json
// 저장 시 파일 권한
await Bun.write(file, JSON.stringify(data, null, 2), { mode: 0o600 })
// 0o600 = owner만 read/write 가능 (보안)
2.3 실제 저장 형태
{
  openai: {
    type: oauth,
    refresh: eyJhbGciOi...,
    access: eyJhbGciOi...,
    expires: 1739612345000,
    accountId: org-xxxxxx
  }
}
2.4 OAUTH_DUMMY_KEY
export const OAUTH_DUMMY_KEY = "opencode-oauth-dummy-key"
OAuth 인증 시 AI SDK가 apiKey를 필수로 요구하기 때문에, 더미 값을 넣고 실제 custom fetch에서 이 헤더를 제거한 뒤 Bearer 토큰으로 교체한다.
---
3. 인증 방법 1: Browser Flow (Authorization Code + PKCE)
3.1 전체 시퀀스 다이어그램
사용자                    앱(로컬)                OpenAI Auth Server
  │                        │                          │
  │  "로그인" 클릭          │                          │
  │───────────────────────>│                          │
  │                        │                          │
  │                        │ 1. PKCE 생성              │
  │                        │   verifier (43자)         │
  │                        │   challenge = SHA256(v)  │
  │                        │                          │
  │                        │ 2. state 생성 (32바이트)   │
  │                        │                          │
  │                        │ 3. 로컬 HTTP 서버 시작     │
  │                        │   localhost:1455          │
  │                        │                          │
  │                        │ 4. Authorization URL 생성  │
  │  브라우저 오픈           │                          │
  │<───────────────────────│                          │
  │                        │                          │
  │  로그인/동의            │                          │
  │───────────────────────────────────────────────────>│
  │                        │                          │
  │                        │  5. 콜백 수신              │
  │                        │<─────────────────────────│
  │                        │  ?code=xxx&state=yyy     │
  │                        │                          │
  │                        │  6. state 검증            │
  │                        │                          │
  │                        │  7. Token Exchange        │
  │                        │─────────────────────────>│
  │                        │  POST /oauth/token        │
  │                        │  { code, code_verifier }  │
  │                        │                          │
  │                        │  8. 토큰 수신              │
  │                        │<─────────────────────────│
  │                        │  { access, refresh,       │
  │                        │    id_token, expires_in } │
  │                        │                          │
  │  성공 HTML 표시          │  9. accountId 추출       │
  │<───────────────────────│                          │
  │  (2초 후 자동 닫힘)      │ 10. auth.json에 저장     │
  │                        │                          │
  │                        │ 11. 로컬 서버 종료         │
3.2 Step 1: PKCE 생성
interface PkceCodes {
  verifier: string   // 43자 랜덤 문자열
  challenge: string  // SHA-256 해시 → base64url 인코딩
}
async function generatePKCE(): Promise<PkceCodes> {
  const verifier = generateRandomString(43)
  const encoder = new TextEncoder()
  const data = encoder.encode(verifier)
  const hash = await crypto.subtle.digest("SHA-256", data)
  const challenge = base64UrlEncode(hash)
  return { verifier, challenge }
}
generateRandomString(43):
function generateRandomString(length: number): string {
  // RFC 7636 unreserved characters: [A-Z] [a-z] [0-9] - . _ ~
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~"
  const bytes = crypto.getRandomValues(new Uint8Array(length))
  return Array.from(bytes)
    .map((b) => chars[b % chars.length])
    .join("")
}
base64UrlEncode:
function base64UrlEncode(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  const binary = String.fromCharCode(...bytes)
  return btoa(binary)
    .replace(/\+/g, "-")   // + → -
    .replace(/\//g, "_")   // / → _
    .replace(/=+$/, "")    // trailing = 제거
}
3.3 Step 2: State 생성
function generateState(): string {
  return base64UrlEncode(crypto.getRandomValues(new Uint8Array(32)).buffer)
  // 32바이트 = 256비트 엔트로피, CSRF 방지용
}
3.4 Step 3: 로컬 콜백 서버 시작
let oauthServer: ReturnType<typeof Bun.serve> | undefined
let pendingOAuth: PendingOAuth | undefined  // 현재 진행 중인 OAuth 세션 (한 번에 하나만)
interface PendingOAuth {
  pkce: PkceCodes
  state: string
  resolve: (tokens: TokenResponse) => void
  reject: (error: Error) => void
}
async function startOAuthServer(): Promise<{ port: number; redirectUri: string }> {
  // 이미 실행 중이면 재사용
  if (oauthServer) {
    return { port: OAUTH_PORT, redirectUri: `http://localhost:${OAUTH_PORT}/auth/callback` }
  }
  oauthServer = Bun.serve({
    port: 1455,
    fetch(req) {
      const url = new URL(req.url)
      // 라우팅: /auth/callback, /cancel, 그 외 404
    },
  })
  return { port: OAUTH_PORT, redirectUri: `http://localhost:${OAUTH_PORT}/auth/callback` }
}
콜백 서버의 라우트 3개:
| 경로 | 역할 |
|------|------|
| GET /auth/callback | OpenAI에서 리다이렉트 → code/state 수신 → 토큰 교환 |
| GET /cancel | 사용자가 취소 시 pendingOAuth reject |
| 그 외 | 404 Not found |
/auth/callback 핸들러 상세:
if (url.pathname === "/auth/callback") {
  const code = url.searchParams.get("code")
  const state = url.searchParams.get("state")
  const error = url.searchParams.get("error")
  const errorDescription = url.searchParams.get("error_description")
  // 1) 에러 응답 처리
  if (error) {
    const errorMsg = errorDescription || error
    pendingOAuth?.reject(new Error(errorMsg))
    pendingOAuth = undefined
    return new Response(HTML_ERROR(errorMsg), {
      headers: { "Content-Type": "text/html" },
    })
  }
  // 2) code 누락
  if (!code) {
    pendingOAuth?.reject(new Error("Missing authorization code"))
    pendingOAuth = undefined
    return new Response(HTML_ERROR("Missing authorization code"), {
      status: 400,
      headers: { "Content-Type": "text/html" },
    })
  }
  // 3) state 검증 (CSRF 방지) — 가장 중요
  if (!pendingOAuth || state !== pendingOAuth.state) {
    pendingOAuth?.reject(new Error("Invalid state - potential CSRF attack"))
    pendingOAuth = undefined
    return new Response(HTML_ERROR("Invalid state - potential CSRF attack"), {
      status: 400,
      headers: { "Content-Type": "text/html" },
    })
  }
  // 4) 검증 통과 → 토큰 교환 시작 (비동기)
  const current = pendingOAuth
  pendingOAuth = undefined  // 한 번만 처리
  exchangeCodeForTokens(code, `http://localhost:${OAUTH_PORT}/auth/callback`, current.pkce)
    .then((tokens) => current.resolve(tokens))
    .catch((err) => current.reject(err))
  // 5) 즉시 성공 HTML 반환 (토큰 교환은 백그라운드)
  return new Response(HTML_SUCCESS, {
    headers: { "Content-Type": "text/html" },
  })
}
3.5 Step 4: Authorization URL 빌드
function buildAuthorizeUrl(redirectUri: string, pkce: PkceCodes, state: string): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: "app_EMoamEEZ73f0CkXaXp7hrann",
    redirect_uri: "http://localhost:1455/auth/callback",
    scope: "openid profile email offline_access",
    code_challenge: pkce.challenge,
    code_challenge_method: "S256",
    id_token_add_organizations: "true",    // 조직 정보를 id_token에 포함
    codex_cli_simplified_flow: "true",     // Codex CLI 전용 간소화 플로우
    state: state,
    originator: "opencode",                // 요청 출처 식별
  })
  return `https://auth.openai.com/oauth/authorize?${params.toString()}`
}
파라미터 설명:
| 파라미터 | 값 | 설명 |
|---------|---|------|
| response_type | "code" | Authorization Code Flow |
| client_id | "app_EMoamEEZ73f0CkXaXp7hrann" | OpenAI에 등록된 OAuth 앱 ID |
| redirect_uri | "http://localhost:1455/auth/callback" | 로컬 콜백 서버 |
| scope | "openid profile email offline_access" | OIDC 스코프. offline_access로 refresh_token 확보 |
| code_challenge | SHA256(verifier) base64url | PKCE S256 챌린지 |
| code_challenge_method | "S256" | PKCE 해시 방식 |
| id_token_add_organizations | "true" | OpenAI 전용. 조직 정보를 토큰에 포함 |
| codex_cli_simplified_flow | "true" | OpenAI 전용. CLI용 간소화 인증 |
| state | 32바이트 랜덤 | CSRF 방지 |
| originator | "opencode" | 요청 출처 식별 |
3.6 Step 5: 콜백 대기 (Promise + 타임아웃)
function waitForOAuthCallback(pkce: PkceCodes, state: string): Promise<TokenResponse> {
  return new Promise((resolve, reject) => {
    // 5분 타임아웃
    const timeout = setTimeout(() => {
      if (pendingOAuth) {
        pendingOAuth = undefined
        reject(new Error("OAuth callback timeout - authorization took too long"))
      }
    }, 5 * 60 * 1000)
    // pendingOAuth에 등록 → 콜백 서버가 resolve/reject 호출
    pendingOAuth = {
      pkce,
      state,
      resolve: (tokens) => { clearTimeout(timeout); resolve(tokens) },
      reject: (error) => { clearTimeout(timeout); reject(error) },
    }
  })
}
3.7 Step 6~7: Token Exchange
interface TokenResponse {
  id_token: string      // JWT. 조직/계정 정보 포함
  access_token: string  // API 호출용
  refresh_token: string // 갱신용
  expires_in?: number   // 초 단위 유효기간 (없으면 기본 3600)
}
async function exchangeCodeForTokens(
  code: string,
  redirectUri: string,
  pkce: PkceCodes
): Promise<TokenResponse> {
  const response = await fetch("https://auth.openai.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: code,
      redirect_uri: redirectUri,                    // "http://localhost:1455/auth/callback"
      client_id: "app_EMoamEEZ73f0CkXaXp7hrann",
      code_verifier: pkce.verifier,                 // PKCE 원본 (서버가 S256으로 검증)
    }).toString(),
  })
  if (!response.ok) throw new Error(`Token exchange failed: ${response.status}`)
  return response.json()
}
3.8 Step 8: Account ID 추출 (JWT 파싱)
interface IdTokenClaims {
  chatgpt_account_id?: string
  organizations?: Array<{ id: string }>
  email?: string
  "https://api.openai.com/auth"?: {
    chatgpt_account_id?: string
  }
}
function parseJwtClaims(token: string): IdTokenClaims | undefined {
  const parts = token.split(".")
  if (parts.length !== 3) return undefined
  try {
    return JSON.parse(Buffer.from(parts[1], "base64url").toString())
  } catch { return undefined }
}
function extractAccountIdFromClaims(claims: IdTokenClaims): string | undefined {
  // 3개 위치에서 순서대로 탐색
  return (
    claims.chatgpt_account_id ||                                       // 직접 필드
    claims["https://api.openai.com/auth"]?.chatgpt_account_id ||      // 네임스페이스 클레임
    claims.organizations?.[0]?.id                                      // 조직 목록의 첫 번째
  )
}
function extractAccountId(tokens: TokenResponse): string | undefined {
  // id_token을 먼저 시도, 없으면 access_token에서 추출
  if (tokens.id_token) {
    const claims = parseJwtClaims(tokens.id_token)
    const accountId = claims && extractAccountIdFromClaims(claims)
    if (accountId) return accountId
  }
  if (tokens.access_token) {
    const claims = parseJwtClaims(tokens.access_token)
    return claims ? extractAccountIdFromClaims(claims) : undefined
  }
  return undefined
}
3.9 Step 9~10: 최종 결과 반환 및 저장
// authorize() 메서드 내부 callback
callback: async () => {
  const tokens = await callbackPromise   // 로컬 서버가 resolve할 때까지 대기
  stopOAuthServer()                       // 로컬 서버 종료
  const accountId = extractAccountId(tokens)
  return {
    type: "success" as const,
    refresh: tokens.refresh_token,
    access: tokens.access_token,
    expires: Date.now() + (tokens.expires_in ?? 3600) * 1000,  // 기본 1시간
    accountId,                                                   // 조직 구독용
  }
}
이 결과는 ProviderAuth.callback() → Auth.set("openai", ...) 경로로 auth.json에 저장됨:
// provider/auth.ts의 callback 함수
if ("refresh" in result) {
  const info: Auth.Info = {
    type: "oauth",
    access: result.access,
    refresh: result.refresh,
    expires: result.expires,
  }
  if (result.accountId) {
    info.accountId = result.accountId
  }
  await Auth.set("openai", info)
}
3.10 성공/실패 HTML 페이지
성공 시 — 브라우저에 표시 후 2초 뒤 자동 닫힘:
<h1>Authorization Successful</h1>
<p>You can close this window and return to OpenCode.</p>
<script>setTimeout(() => window.close(), 2000)</script>
실패 시 — 에러 메시지 표시:
<h1>Authorization Failed</h1>
<p>An error occurred during authorization.</p>
<div class="error">${error}</div>
---