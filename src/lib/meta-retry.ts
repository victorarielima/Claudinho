import { logger } from './logger'

interface RetryOptions {
  maxRetries?: number      // default 3
  baseDelayMs?: number     // default 1000
  maxDelayMs?: number      // default 30000
}

export async function metaFetchWithRetry(
  url: string,
  options?: RequestInit,
  retryOptions?: RetryOptions
): Promise<Response> {
  const { maxRetries = 3, baseDelayMs = 1000, maxDelayMs = 30000 } = retryOptions ?? {}

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, options)

    if (response.ok) return response

    // Check for rate limiting
    const isRateLimit = response.status === 429
    let isMetaRateLimit = false

    if (!response.ok && !isRateLimit) {
      // Check Meta-specific rate limit error codes
      try {
        const body = await response.clone().json()
        const errorCode = body?.error?.code
        isMetaRateLimit = errorCode === 17 || errorCode === 32 || errorCode === 4
      } catch {}
    }

    if ((isRateLimit || isMetaRateLimit) && attempt < maxRetries) {
      const delay = Math.min(baseDelayMs * Math.pow(2, attempt), maxDelayMs)
      logger.warn('Meta API rate limit hit, retrying', {
        attempt: attempt + 1,
        maxRetries,
        delayMs: delay,
        url: url.replace(/access_token=[^&]+/, 'access_token=***'),
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
