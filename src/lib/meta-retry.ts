import { logger } from './logger'

interface RetryOptions {
  maxRetries?: number      // default 3
  baseDelayMs?: number     // default 1000
  maxDelayMs?: number      // default 30000
  timeoutMs?: number       // default 30000 — per-attempt fetch timeout
}

/**
 * Safely parse JSON from a Response, returning a descriptive error object
 * instead of throwing "Unexpected end of JSON input" on empty/invalid bodies.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function safeResponseJson(res: Response): Promise<Record<string, any>> {
  const text = await res.text()
  if (!text || text.trim().length === 0) {
    return {
      error: {
        message: `Meta API retornou resposta vazia (HTTP ${res.status} ${res.statusText})`,
        code: res.status,
      },
    }
  }
  try {
    return JSON.parse(text)
  } catch {
    return {
      error: {
        message: `Meta API retornou resposta invalida (HTTP ${res.status}): ${text.slice(0, 200)}`,
        code: res.status,
      },
    }
  }
}

export async function metaFetchWithRetry(
  url: string,
  options?: RequestInit,
  retryOptions?: RetryOptions
): Promise<Response> {
  const {
    maxRetries = 3,
    baseDelayMs = 1000,
    maxDelayMs = 30000,
    timeoutMs = 30000,
  } = retryOptions ?? {}

  const sanitizedUrl = url.replace(/access_token=[^&]+/, 'access_token=***')

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    let response: Response
    try {
      response = await fetch(url, {
        ...options,
        signal: options?.signal ?? AbortSignal.timeout(timeoutMs),
      })
    } catch (err) {
      const isTimeout =
        err instanceof DOMException && err.name === 'TimeoutError'
      const isAbort =
        err instanceof DOMException && err.name === 'AbortError'

      if (isTimeout && attempt < maxRetries) {
        const delay = Math.min(baseDelayMs * Math.pow(2, attempt), maxDelayMs)
        logger.warn('Meta API timeout, retrying', {
          attempt: attempt + 1,
          maxRetries,
          timeoutMs,
          delayMs: delay,
          url: sanitizedUrl,
        })
        await new Promise(resolve => setTimeout(resolve, delay))
        continue
      }

      if (isTimeout) {
        throw new Error(
          `Meta API timeout após ${timeoutMs}ms em ${maxRetries + 1} tentativas`
        )
      }
      if (isAbort) throw err
      throw err
    }

    if (response.ok) return response

    // Check for rate limiting
    const isRateLimit = response.status === 429
    let isMetaRateLimit = false

    let isTransientMeta = false
    if (!response.ok && !isRateLimit) {
      // Check Meta-specific rate limit error codes
      try {
        const body = await response.clone().json()
        const errorCode = body?.error?.code
        const errorSubcode = body?.error?.error_subcode
        isMetaRateLimit =
          errorCode === 17 ||
          errorCode === 32 ||
          errorCode === 4 ||
          errorCode === 100 ||
          errorCode === 613 ||
          errorCode === 80004
        // Transient Meta service hiccups on video upload (/advideos).
        // Subcode 1363047 ("There was a problem uploading your video.
        // Please try again.") is documented as temporary unavailability.
        isTransientMeta = errorSubcode === 1363047
      } catch {}
    }

    if ((isRateLimit || isMetaRateLimit || isTransientMeta) && attempt < maxRetries) {
      const delay = Math.min(baseDelayMs * Math.pow(2, attempt), maxDelayMs)
      logger.warn('Meta API transient error, retrying', {
        attempt: attempt + 1,
        maxRetries,
        delayMs: delay,
        url: sanitizedUrl,
        reason: isTransientMeta ? 'transient_meta_subcode' : 'rate_limit',
      })
      await new Promise(resolve => setTimeout(resolve, delay))
      continue
    }

    // Not a rate limit error or max retries exceeded - return the response as-is
    return response
  }

  // Should not reach here, but TypeScript needs it
  throw new Error('Max retries exceeded')
}
