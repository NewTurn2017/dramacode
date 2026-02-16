import open from "open"
import { Auth, OAUTH_DUMMY_KEY } from "../auth"
import { Log } from "../util/log"

const log = Log.create({ service: "plugin.openai" })

const CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann"
const ISSUER = "https://auth.openai.com"
const CODEX_API_ENDPOINT = "https://chatgpt.com/backend-api/codex/responses"
const OAUTH_PORT = 1455
const OAUTH_POLLING_SAFETY_MARGIN_MS = 3000

type Pkce = {
  verifier: string
  challenge: string
}

type Token = {
  id_token?: string
  access_token: string
  refresh_token: string
  expires_in?: number
}

type Claims = {
  chatgpt_account_id?: string
  "https://api.openai.com/auth.chatgpt_account_id"?: string
  "https://api.openai.com/auth"?: {
    chatgpt_account_id?: string
  }
  organizations?: Array<{ id: string }>
}

type Login = {
  refresh: string
  access: string
  expires: number
  accountId?: string
}

type Pending = {
  state: string
  pkce: Pkce
  resolve: (token: Token) => void
  reject: (error: Error) => void
}

const HTML_HOME = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>DRAMACODE OpenAI OAuth</title>
    <style>
      body {
        font-family:
          system-ui,
          -apple-system,
          sans-serif;
        display: flex;
        justify-content: center;
        align-items: center;
        height: 100vh;
        margin: 0;
        background: #131010;
        color: #f1ecec;
      }
      .box {
        text-align: center;
      }
      p {
        color: #b7b1b1;
      }
    </style>
  </head>
  <body>
    <div class="box">
      <h1>Continue in DRAMACODE</h1>
      <p>Return to your terminal to complete login.</p>
    </div>
  </body>
</html>`

const HTML_OK = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>DRAMACODE OpenAI OAuth Success</title>
    <style>
      body {
        font-family:
          system-ui,
          -apple-system,
          sans-serif;
        display: flex;
        justify-content: center;
        align-items: center;
        height: 100vh;
        margin: 0;
        background: #131010;
        color: #f1ecec;
      }
      .box {
        text-align: center;
      }
      p {
        color: #b7b1b1;
      }
    </style>
  </head>
  <body>
    <div class="box">
      <h1>Authorization Successful</h1>
      <p>You can close this window and return to DRAMACODE.</p>
    </div>
    <script>
      setTimeout(() => window.close(), 2000)
    </script>
  </body>
</html>`

const htmlError = (msg: string) => `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>DRAMACODE OpenAI OAuth Failed</title>
    <style>
      body {
        font-family:
          system-ui,
          -apple-system,
          sans-serif;
        display: flex;
        justify-content: center;
        align-items: center;
        height: 100vh;
        margin: 0;
        background: #131010;
        color: #f1ecec;
      }
      .box {
        text-align: center;
      }
      p {
        color: #b7b1b1;
      }
      .err {
        color: #ff917b;
        font-family: monospace;
        margin-top: 1rem;
      }
    </style>
  </head>
  <body>
    <div class="box">
      <h1>Authorization Failed</h1>
      <p>OpenAI returned an error.</p>
      <div class="err">${msg}</div>
    </div>
  </body>
</html>`

let server: ReturnType<typeof Bun.serve> | undefined
let pending: Pending | undefined

function generateRandomString(length: number) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~"
  const bytes = crypto.getRandomValues(new Uint8Array(length))
  return Array.from(bytes)
    .map((b) => chars[b % chars.length])
    .join("")
}

function base64UrlEncode(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer)
  const binary = String.fromCharCode(...bytes)
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

async function generatePkce(): Promise<Pkce> {
  const verifier = generateRandomString(43)
  const data = new TextEncoder().encode(verifier)
  const hash = await crypto.subtle.digest("SHA-256", data)
  const challenge = base64UrlEncode(hash)
  return { verifier, challenge }
}

function generateState() {
  return base64UrlEncode(crypto.getRandomValues(new Uint8Array(32)).buffer)
}

function parseClaims(token: string): Claims | undefined {
  const parts = token.split(".")
  if (parts.length !== 3) return
  try {
    return JSON.parse(Buffer.from(parts[1] ?? "", "base64url").toString()) as Claims
  } catch {
    return
  }
}

function extractAccountId(token: Token) {
  const find = (claims: Claims) =>
    claims.chatgpt_account_id ||
    claims["https://api.openai.com/auth.chatgpt_account_id"] ||
    claims["https://api.openai.com/auth"]?.chatgpt_account_id ||
    claims.organizations?.[0]?.id

  const idClaims = token.id_token ? parseClaims(token.id_token) : undefined
  const id = idClaims ? find(idClaims) : undefined
  if (id) return id
  const accessClaims = parseClaims(token.access_token)
  return accessClaims ? find(accessClaims) : undefined
}

function authorizeUrl(redirectUri: string, pkce: Pkce, state: string) {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: CLIENT_ID,
    redirect_uri: redirectUri,
    scope: "openid profile email offline_access",
    code_challenge: pkce.challenge,
    code_challenge_method: "S256",
    id_token_add_organizations: "true",
    codex_cli_simplified_flow: "true",
    state,
    originator: "opencode",
  })
  return `${ISSUER}/oauth/authorize?${params.toString()}`
}

async function exchangeCode(code: string, redirectUri: string, pkce: Pkce) {
  const response = await fetch(`${ISSUER}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: CLIENT_ID,
      code_verifier: pkce.verifier,
    }).toString(),
  })
  if (!response.ok) throw new Error(`Token exchange failed: ${response.status}`)
  return (await response.json()) as Token
}

function startServer() {
  if (server) return `http://localhost:${OAUTH_PORT}/callback`

  server = Bun.serve({
    port: OAUTH_PORT,
    fetch(req) {
      const url = new URL(req.url)

      if (url.pathname === "/") {
        return new Response(HTML_HOME, { headers: { "Content-Type": "text/html" } })
      }

      if (url.pathname === "/error") {
        return new Response(htmlError(url.searchParams.get("error") ?? "authorization_failed"), {
          status: 400,
          headers: { "Content-Type": "text/html" },
        })
      }

      if (url.pathname !== "/callback") {
        return new Response("Not found", { status: 404 })
      }

      const code = url.searchParams.get("code")
      const state = url.searchParams.get("state")
      const err = url.searchParams.get("error")
      const msg = url.searchParams.get("error_description")

      if (err) {
        const text = msg || err
        pending?.reject(new Error(text))
        pending = undefined
        return Response.redirect(`http://localhost:${OAUTH_PORT}/error?error=${encodeURIComponent(text)}`, 302)
      }

      if (!code) {
        const text = "Missing authorization code"
        pending?.reject(new Error(text))
        pending = undefined
        return Response.redirect(`http://localhost:${OAUTH_PORT}/error?error=${encodeURIComponent(text)}`, 302)
      }

      if (!pending || state !== pending.state) {
        const text = "Invalid state"
        pending?.reject(new Error(text))
        pending = undefined
        return Response.redirect(`http://localhost:${OAUTH_PORT}/error?error=${encodeURIComponent(text)}`, 302)
      }

      const cur = pending
      pending = undefined
      exchangeCode(code, `http://localhost:${OAUTH_PORT}/callback`, cur.pkce)
        .then((token) => cur.resolve(token))
        .catch((error) => cur.reject(error instanceof Error ? error : new Error(String(error))))

      return new Response(HTML_OK, { headers: { "Content-Type": "text/html" } })
    },
  })

  log.info("openai oauth server started", { port: OAUTH_PORT })
  return `http://localhost:${OAUTH_PORT}/callback`
}

function stopServer() {
  if (!server) return
  server.stop()
  server = undefined
  log.info("openai oauth server stopped")
}

function waitForCallback(pkce: Pkce, state: string) {
  return new Promise<Token>((resolve, reject) => {
    const timeout = setTimeout(
      () => {
        if (!pending) return
        pending = undefined
        reject(new Error("OAuth callback timeout - authorization took too long"))
      },
      5 * 60 * 1000,
    )

    pending = {
      pkce,
      state,
      resolve(token) {
        clearTimeout(timeout)
        resolve(token)
      },
      reject(error) {
        clearTimeout(timeout)
        reject(error)
      },
    }
  })
}

function authResult(token: Token, fallback?: string): Login {
  const accountId = extractAccountId(token) || fallback
  return {
    refresh: token.refresh_token,
    access: token.access_token,
    expires: Date.now() + (token.expires_in ?? 3600) * 1000,
    accountId,
  }
}

function makeHeaders(input?: ConstructorParameters<typeof Headers>[0]) {
  const headers = new Headers(input)
  headers.delete("authorization")
  headers.delete("Authorization")
  if (headers.get("x-api-key") === OAUTH_DUMMY_KEY) headers.delete("x-api-key")
  if (headers.get("X-API-Key") === OAUTH_DUMMY_KEY) headers.delete("X-API-Key")
  return headers
}

export namespace OpenAIAuth {
  export async function browserLogin() {
    const redirectUri = startServer()
    const pkce = await generatePkce()
    const state = generateState()
    const url = authorizeUrl(redirectUri, pkce, state)
    const done = waitForCallback(pkce, state)

    console.log(`OpenAI authorization URL: ${url}`)
    await open(url).catch(() => undefined)

    try {
      const token = await done
      return authResult(token)
    } finally {
      stopServer()
    }
  }

  export async function webLogin(): Promise<{ url: string; userCode: string; done: Promise<Login> }> {
    const ua = "dramacode/0.1.0"
    const start = await fetch(`${ISSUER}/api/accounts/deviceauth/usercode`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": ua },
      body: JSON.stringify({ client_id: CLIENT_ID }),
    })
    if (!start.ok) throw new Error("Failed to initiate device authorization")

    const info = (await start.json()) as {
      device_auth_id: string
      user_code: string
      interval: string
    }
    const wait = Math.max(parseInt(info.interval) || 5, 1) * 1000

    const done = (async () => {
      while (true) {
        const poll = await fetch(`${ISSUER}/api/accounts/deviceauth/token`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "User-Agent": ua },
          body: JSON.stringify({
            device_auth_id: info.device_auth_id,
            user_code: info.user_code,
          }),
        })

        if (poll.ok) {
          const code = (await poll.json()) as {
            authorization_code: string
            code_verifier: string
          }
          const token = await exchangeCode(code.authorization_code, `${ISSUER}/deviceauth/callback`, {
            verifier: code.code_verifier,
            challenge: "",
          })
          return authResult(token)
        }

        if (poll.status !== 403 && poll.status !== 404) {
          throw new Error(`Device authorization failed: ${poll.status}`)
        }

        await Bun.sleep(wait + OAUTH_POLLING_SAFETY_MARGIN_MS)
      }
    })()

    return { url: `${ISSUER}/codex/device`, userCode: info.user_code, done }
  }

  export async function deviceLogin() {
    const ua = "dramacode/0.1.0"
    const start = await fetch(`${ISSUER}/api/accounts/deviceauth/usercode`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": ua },
      body: JSON.stringify({ client_id: CLIENT_ID }),
    })
    if (!start.ok) throw new Error("Failed to initiate device authorization")

    const info = (await start.json()) as {
      device_auth_id: string
      user_code: string
      interval: string
    }
    const wait = Math.max(parseInt(info.interval) || 5, 1) * 1000

    const url = `${ISSUER}/codex/device`
    console.log(`\n  1. Open: ${url}`)
    console.log(`  2. Enter code: ${info.user_code}\n`)
    await open(url).catch(() => undefined)
    console.log("  Waiting for authorization...")

    while (true) {
      const poll = await fetch(`${ISSUER}/api/accounts/deviceauth/token`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "User-Agent": ua },
        body: JSON.stringify({
          device_auth_id: info.device_auth_id,
          user_code: info.user_code,
        }),
      })

      if (poll.ok) {
        const code = (await poll.json()) as {
          authorization_code: string
          code_verifier: string
        }
        const token = await exchangeCode(code.authorization_code, `${ISSUER}/deviceauth/callback`, {
          verifier: code.code_verifier,
          challenge: "",
        })
        return authResult(token)
      }

      if (poll.status !== 403 && poll.status !== 404) {
        throw new Error(`Device authorization failed: ${poll.status}`)
      }

      await Bun.sleep(wait + OAUTH_POLLING_SAFETY_MARGIN_MS)
    }
  }

  export async function refresh(refreshToken: string) {
    const response = await fetch(`${ISSUER}/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: CLIENT_ID,
      }).toString(),
    })
    if (!response.ok) throw new Error(`Token refresh failed: ${response.status}`)
    return authResult((await response.json()) as Token)
  }

  export function createFetch(providerID: string): typeof globalThis.fetch {
    const customFetch = async (requestInput: string | URL | Request, init?: RequestInit) => {
      const info = await Auth.get(providerID)
      const headers = makeHeaders(init?.headers)
      if (!info) return fetch(requestInput, { ...init, headers })

      if (info.type === "api") {
        headers.set("authorization", `Bearer ${info.key}`)
        return fetch(requestInput, { ...init, headers })
      }

      const token = !info.access || info.expires < Date.now() ? await refresh(info.refresh) : undefined
      const auth = token
        ? {
            type: "oauth" as const,
            refresh: token.refresh,
            access: token.access,
            expires: token.expires,
            accountId: token.accountId || info.accountId,
          }
        : info

      if (token) await Auth.set(providerID, auth)

      headers.set("authorization", `Bearer ${auth.access}`)
      if (auth.accountId) headers.set("ChatGPT-Account-Id", auth.accountId)

      const parsed = new URL(
        typeof requestInput === "string"
          ? requestInput
          : requestInput instanceof URL
            ? requestInput.href
            : requestInput.url,
      )
      const url =
        parsed.pathname.includes("/v1/responses") || parsed.pathname.includes("/chat/completions")
          ? new URL(CODEX_API_ENDPOINT)
          : parsed

      return fetch(url, { ...init, headers })
    }
    customFetch.preconnect = fetch.preconnect
    return customFetch
  }
}
