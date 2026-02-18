import { Auth, OAUTH_DUMMY_KEY } from "../auth"
import { Log } from "../util/log"

const log = Log.create({ service: "plugin.anthropic" })

const CLIENT_ID = "9d1c250a-e61b-44d9-88ed-5944d1962f5e"
const TOKEN_ENDPOINT = "https://console.anthropic.com/v1/oauth/token"
const REDIRECT_URI = "https://console.anthropic.com/oauth/code/callback"
const SCOPES = "org:create_api_key user:profile user:inference"

type Token = {
  access_token: string
  refresh_token: string
  expires_in: number
}

type Login = {
  refresh: string
  access: string
  expires: number
}

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

async function generatePkce() {
  const verifier = generateRandomString(43)
  const data = new TextEncoder().encode(verifier)
  const hash = await crypto.subtle.digest("SHA-256", data)
  const challenge = base64UrlEncode(hash)
  return { verifier, challenge }
}

function authorizeUrl(challenge: string, verifier: string) {
  const url = new URL("https://claude.ai/oauth/authorize")
  url.searchParams.set("code", "true")
  url.searchParams.set("client_id", CLIENT_ID)
  url.searchParams.set("response_type", "code")
  url.searchParams.set("redirect_uri", REDIRECT_URI)
  url.searchParams.set("scope", SCOPES)
  url.searchParams.set("code_challenge", challenge)
  url.searchParams.set("code_challenge_method", "S256")
  url.searchParams.set("state", verifier)
  return url.toString()
}

async function exchangeCode(rawCode: string, verifier: string): Promise<Login> {
  const splits = rawCode.split("#")
  const code = splits[0]
  const state = splits[1]

  const response = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      code,
      state,
      grant_type: "authorization_code",
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      code_verifier: verifier,
    }),
  })

  if (!response.ok) {
    const text = await response.text().catch(() => "")
    throw new Error(`Anthropic token exchange failed: ${response.status} ${text}`)
  }

  const json = (await response.json()) as Token
  return {
    refresh: json.refresh_token,
    access: json.access_token,
    expires: Date.now() + json.expires_in * 1000,
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

export namespace AnthropicAuth {
  export async function webLogin(): Promise<{ url: string; verifier: string }> {
    const pkce = await generatePkce()
    const url = authorizeUrl(pkce.challenge, pkce.verifier)
    log.info("anthropic web login initiated")
    return { url, verifier: pkce.verifier }
  }

  export async function exchange(rawCode: string, verifier: string): Promise<Login> {
    const login = await exchangeCode(rawCode, verifier)
    log.info("anthropic token exchange succeeded")
    return login
  }

  export async function refresh(refreshToken: string): Promise<Login> {
    const response = await fetch(TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: CLIENT_ID,
      }),
    })

    if (!response.ok) {
      throw new Error(`Anthropic token refresh failed: ${response.status}`)
    }

    const json = (await response.json()) as Token
    return {
      refresh: json.refresh_token,
      access: json.access_token,
      expires: Date.now() + json.expires_in * 1000,
    }
  }

  export function createFetch(providerID: string): typeof globalThis.fetch {
    const customFetch = async (requestInput: string | URL | Request, init?: RequestInit) => {
      const info = await Auth.get(providerID)
      const headers = makeHeaders(init?.headers)
      if (!info) return fetch(requestInput, { ...init, headers })

      if (info.type === "api") {
        headers.set("x-api-key", info.key)
        return fetch(requestInput, { ...init, headers })
      }

      const token = !info.access || info.expires < Date.now() ? await refresh(info.refresh) : undefined
      const auth = token
        ? {
            type: "oauth" as const,
            refresh: token.refresh,
            access: token.access,
            expires: token.expires,
          }
        : info

      if (token) await Auth.set(providerID, auth)

      headers.set("authorization", `Bearer ${auth.access}`)
      headers.delete("x-api-key")

      const existing = headers.get("anthropic-beta") || ""
      const existingList = existing.split(",").map((b) => b.trim()).filter(Boolean)
      const required = ["oauth-2025-04-20", "interleaved-thinking-2025-05-14"]
      const merged = [...new Set([...required, ...existingList])].join(",")
      headers.set("anthropic-beta", merged)
      headers.set("user-agent", "claude-cli/2.1.2 (external, cli)")

      const TOOL_PREFIX = "mcp_"
      let body = init?.body
      if (body && typeof body === "string") {
        try {
          const parsed = JSON.parse(body)

          if (parsed.system && Array.isArray(parsed.system)) {
            parsed.system = parsed.system.map((item: { type: string; text?: string }) => {
              if (item.type === "text" && item.text) {
                return {
                  ...item,
                  text: item.text
                    .replace(/OpenCode/g, "Claude Code")
                    .replace(/opencode/gi, "Claude"),
                }
              }
              return item
            })
          }

          if (parsed.tools && Array.isArray(parsed.tools)) {
            parsed.tools = parsed.tools.map((tool: { name?: string }) => ({
              ...tool,
              name: tool.name ? `${TOOL_PREFIX}${tool.name}` : tool.name,
            }))
          }

          if (parsed.messages && Array.isArray(parsed.messages)) {
            parsed.messages = parsed.messages.map(
              (msg: { content?: Array<{ type: string; name?: string }> }) => {
                if (msg.content && Array.isArray(msg.content)) {
                  msg.content = msg.content.map((block) => {
                    if (block.type === "tool_use" && block.name) {
                      return { ...block, name: `${TOOL_PREFIX}${block.name}` }
                    }
                    return block
                  })
                }
                return msg
              },
            )
          }

          body = JSON.stringify(parsed)
        } catch {}
      }

      let finalInput: string | URL | Request = requestInput
      let requestUrl: URL | null = null
      try {
        if (typeof requestInput === "string" || requestInput instanceof URL) {
          requestUrl = new URL(requestInput.toString())
        } else if (requestInput instanceof Request) {
          requestUrl = new URL(requestInput.url)
        }
      } catch {
        requestUrl = null
      }

      if (requestUrl && requestUrl.pathname === "/v1/messages" && !requestUrl.searchParams.has("beta")) {
        requestUrl.searchParams.set("beta", "true")
        finalInput =
          requestInput instanceof Request ? new Request(requestUrl.toString(), requestInput) : requestUrl
      }

      const response = await fetch(finalInput, { ...init, body, headers })

      if (response.body) {
        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        const encoder = new TextEncoder()

        const stream = new ReadableStream({
          async pull(controller) {
            const { done, value } = await reader.read()
            if (done) {
              controller.close()
              return
            }
            let text = decoder.decode(value, { stream: true })
            text = text.replace(/"name"\s*:\s*"mcp_([^"]+)"/g, '"name": "$1"')
            controller.enqueue(encoder.encode(text))
          },
        })

        return new Response(stream, {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
        })
      }

      return response
    }
    customFetch.preconnect = fetch.preconnect
    return customFetch
  }
}
