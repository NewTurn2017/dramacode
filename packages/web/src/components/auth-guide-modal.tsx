import { Show, createSignal } from "solid-js"

const TABS = ["사전 준비", "로그인 방법", "문제 해결"] as const
type Tab = (typeof TABS)[number]

export function AuthGuideModal(props: { open: boolean; onClose: () => void }) {
  const [tab, setTab] = createSignal<Tab>("사전 준비")

  return (
    <Show when={props.open}>
      <div class="fixed inset-0 z-50 flex items-center justify-center">
        <div class="absolute inset-0 bg-black/60" onClick={props.onClose} />
        <div class="relative bg-bg-card border border-border rounded-xl w-full max-w-lg max-h-[80vh] flex flex-col shadow-2xl">
          <div class="flex items-center justify-between p-4 border-b border-border">
            <h3 class="text-base font-semibold">OpenAI 인증 가이드</h3>
            <button onClick={props.onClose} class="text-text-dim hover:text-text transition-colors text-lg leading-none">
              ✕
            </button>
          </div>

          <div class="flex border-b border-border">
            {TABS.map((t) => (
              <button
                onClick={() => setTab(t)}
                class="flex-1 px-3 py-2 text-xs font-medium transition-colors"
                classList={{
                  "text-accent border-b-2 border-accent": tab() === t,
                  "text-text-dim hover:text-text": tab() !== t,
                }}
              >
                {t}
              </button>
            ))}
          </div>

          <div class="flex-1 overflow-y-auto p-4">
            <Show when={tab() === "사전 준비"}>
              <PrerequisiteGuide />
            </Show>
            <Show when={tab() === "로그인 방법"}>
              <LoginGuide />
            </Show>
            <Show when={tab() === "문제 해결"}>
              <TroubleshootGuide />
            </Show>
          </div>
        </div>
      </div>
    </Show>
  )
}

function Step(props: { n: number; title: string; children: any }) {
  return (
    <div class="flex gap-3 mb-4">
      <div class="shrink-0 w-6 h-6 rounded-full bg-accent/20 text-accent text-xs font-bold flex items-center justify-center mt-0.5">
        {props.n}
      </div>
      <div class="min-w-0">
        <p class="text-sm font-medium mb-1">{props.title}</p>
        <div class="text-xs text-text-dim leading-relaxed">{props.children}</div>
      </div>
    </div>
  )
}

function Warn(props: { children: any }) {
  return (
    <div class="mt-3 mb-4 p-2.5 rounded-md bg-danger/10 border border-danger/20">
      <p class="text-xs text-danger leading-relaxed">{props.children}</p>
    </div>
  )
}

function Tip(props: { children: any }) {
  return (
    <div class="mt-3 p-2.5 rounded-md bg-accent/10 border border-accent/20">
      <p class="text-xs text-accent leading-relaxed">{props.children}</p>
    </div>
  )
}

function ExtLink(props: { href: string; children: any }) {
  return (
    <a href={props.href} target="_blank" rel="noopener" class="text-accent hover:underline">
      {props.children}
    </a>
  )
}

function PrerequisiteGuide() {
  return (
    <div>
      <Warn>
        DRAMACODE는 OpenAI의 Device Code 인증을 사용합니다.
        이메일/비밀번호로 로그인하는 경우 <span class="font-semibold">다중 인증(MFA) 설정이 필수</span>입니다.
        로그인 전에 반드시 MFA를 먼저 설정해주세요.
      </Warn>

      <h4 class="text-sm font-medium mb-3">MFA 설정 방법 (이메일/비밀번호 사용자)</h4>

      <Step n={1} title="ChatGPT 보안 설정 열기">
        <ExtLink href="https://chatgpt.com/settings">chatgpt.com/settings</ExtLink>에
        접속한 뒤 <span class="font-medium text-text">보안(Security)</span> 메뉴로 이동합니다.
      </Step>
      <Step n={2} title="다중 인증(Multi-factor authentication) 활성화">
        MFA 항목에서 활성화를 클릭합니다. 인증 앱으로 QR 코드를 스캔하라는 안내가 나타납니다.
      </Step>
      <Step n={3} title="인증 앱으로 QR 코드 스캔">
        <p>다음 중 하나의 TOTP 인증 앱을 사용합니다:</p>
        <ul class="list-disc ml-4 mt-1 space-y-0.5">
          <li><span class="font-medium text-text">Google Authenticator</span> — <ExtLink href="https://apps.apple.com/app/google-authenticator/id388497605">iOS</ExtLink> / <ExtLink href="https://play.google.com/store/apps/details?id=com.google.android.apps.authenticator2">Android</ExtLink></li>
          <li><span class="font-medium text-text">Microsoft Authenticator</span> — <ExtLink href="https://apps.apple.com/app/microsoft-authenticator/id983156458">iOS</ExtLink> / <ExtLink href="https://play.google.com/store/apps/details?id=com.azure.authenticator">Android</ExtLink></li>
          <li><span class="font-medium text-text">1Password, Authy</span> 등 TOTP 지원 앱</li>
        </ul>
      </Step>
      <Step n={4} title="6자리 코드 입력 후 복구 코드 저장">
        앱에 표시된 6자리 코드를 입력하면 설정이 완료됩니다.
        복구 코드가 제공되면 안전한 곳에 반드시 보관하세요 — 기기 분실 시 계정 복구에 필요합니다.
      </Step>

      <Tip>
        <span class="font-semibold">Google, Microsoft, Apple 소셜 로그인</span> 사용자는
        ChatGPT 계정에 MFA를 따로 설정하지 않아도 됩니다.
        다만 해당 소셜 계정 자체에 2단계 인증을 활성화하는 것을 권장합니다.
        — <ExtLink href="https://support.google.com/accounts/answer/185839">Google 2FA</ExtLink>
        {" / "}
        <ExtLink href="https://support.microsoft.com/en-us/topic/what-is-multifactor-authentication-e5e39437-121c-be60-d123-eda06bddf661">Microsoft MFA</ExtLink>
        {" / "}
        <ExtLink href="https://support.apple.com/en-us/102660">Apple 2FA</ExtLink>
      </Tip>
    </div>
  )
}

function LoginGuide() {
  return (
    <div>
      <p class="text-xs text-text-dim mb-4">
        MFA 설정이 완료되었다면 아래 순서로 로그인합니다.
      </p>

      <h4 class="text-sm font-medium mb-3">Device Code 로그인</h4>

      <Step n={1} title="'OpenAI 로그인' 버튼 클릭">
        사이드바 하단의 로그인 버튼을 클릭합니다. 인증 코드가 표시되고, OpenAI 인증 페이지가 새 탭에 열립니다.
      </Step>
      <Step n={2} title="인증 코드 입력">
        열린 페이지(<ExtLink href="https://auth.openai.com/codex/device">auth.openai.com/codex/device</ExtLink>)에서 사이드바에 표시된 코드를 입력합니다.
      </Step>
      <Step n={3} title="OpenAI 계정으로 로그인">
        이메일/비밀번호 또는 Google/Microsoft/Apple 계정으로 로그인합니다.
        이메일/비밀번호 사용자는 인증 앱의 6자리 MFA 코드를 추가로 입력합니다.
      </Step>
      <Step n={4} title="인증 완료 대기">
        권한을 승인하면 DRAMACODE가 자동으로 인증을 감지합니다. 사이드바에 '● OpenAI 연결됨'이 표시됩니다.
      </Step>

      <Tip>
        모바일에서도 인증할 수 있습니다. PC에서 DRAMACODE를 실행한 상태로
        모바일 브라우저에서 <ExtLink href="https://auth.openai.com/codex/device">auth.openai.com/codex/device</ExtLink>를
        열고 코드를 입력하면 됩니다.
      </Tip>

      <h4 class="text-sm font-medium mt-5 mb-3">API 키 직접 입력 (대안)</h4>
      <p class="text-xs text-text-dim leading-relaxed">
        <ExtLink href="https://platform.openai.com/api-keys">platform.openai.com/api-keys</ExtLink>에서
        API 키를 발급받아 <code class="px-1 py-0.5 bg-bg rounded text-text">sk-...</code> 형식으로
        사이드바의 'API 키 직접 입력'에 붙여넣습니다. API 키 사용 시 MFA는 필요 없지만,
        OpenAI Platform 계정에 사용량 기반 요금이 부과됩니다.
      </p>
    </div>
  )
}

function TroubleshootGuide() {
  return (
    <div>
      <h4 class="text-sm font-medium mb-3">자주 발생하는 문제</h4>

      <div class="space-y-4">
        <div>
          <p class="text-xs font-medium text-text mb-1">"Please contact your workspace admin to enable device code authentication"</p>
          <p class="text-xs text-text-dim leading-relaxed">
            팀/워크스페이스 계정을 사용하는 경우 워크스페이스 관리자가 device code 인증을 별도로 활성화해야 합니다.
            관리자에게 ChatGPT 워크스페이스 설정에서 device code 인증 허용을 요청하세요.
            개인 계정이라면 <ExtLink href="https://chatgpt.com/settings">chatgpt.com/settings</ExtLink> → 보안(Security)에서 직접 활성화할 수 있습니다.
          </p>
        </div>

        <div>
          <p class="text-xs font-medium text-text mb-1">"MFA required" 또는 인증 거부</p>
          <p class="text-xs text-text-dim leading-relaxed">
            이메일/비밀번호 로그인 사용자는 MFA가 필수입니다. '사전 준비' 탭의 안내에 따라 MFA를 설정해주세요.
            이메일/비밀번호와 소셜 로그인을 모두 지원하는 계정이라면, 이메일/비밀번호 방식이 존재하는 한 MFA 설정이 필요합니다.
          </p>
        </div>

        <div>
          <p class="text-xs font-medium text-text mb-1">인증 코드 입력 후 아무 반응이 없음</p>
          <p class="text-xs text-text-dim leading-relaxed">
            인증은 최대 5분간 대기합니다. 시간이 초과되면 다시 로그인 버튼을 클릭하세요.
            브라우저의 쿠키/팝업 차단이 활성화되어 있다면 해제 후 재시도해주세요.
          </p>
        </div>

        <div>
          <p class="text-xs font-medium text-text mb-1">모바일에서 인증하고 싶은 경우</p>
          <p class="text-xs text-text-dim leading-relaxed">
            PC에서 DRAMACODE를 실행한 상태로 모바일 브라우저에서{" "}
            <ExtLink href="https://auth.openai.com/codex/device">auth.openai.com/codex/device</ExtLink>를
            열고 PC 화면에 표시된 코드를 입력하면 됩니다. 인증 완료 후 모바일 브라우저는 닫아도 됩니다.
          </p>
        </div>
      </div>

      <Tip>
        그래도 문제가 해결되지 않으면 API 키 직접 입력을 사용해보세요.{" "}
        <ExtLink href="https://platform.openai.com/api-keys">platform.openai.com/api-keys</ExtLink>에서 키를 발급받을 수 있습니다.
      </Tip>
    </div>
  )
}
