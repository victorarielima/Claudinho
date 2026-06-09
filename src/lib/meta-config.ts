export const META_API_VERSION = 'v23.0'
export const META_API_BASE = `https://graph.facebook.com/${META_API_VERSION}`

export function getAccessToken(): string {
  const token = process.env.META_ACCESS_TOKEN
  if (!token) throw new Error("META_ACCESS_TOKEN não configurado")
  return token
}

interface MetaErrorShape {
  message?: string
  error_user_msg?: string
  type?: string
  code?: number
  error_subcode?: number
  fbtrace_id?: string
}

/**
 * Extrai uma mensagem legível do corpo de erro do Meta, preferindo
 * `error_user_msg` (que é a versão aprovada pelo Meta para exibição
 * ao usuário) sobre `message`. Sempre anexa `code`, `error_subcode`
 * e `fbtrace_id` quando presentes — essenciais para triagem.
 */
export function extrairErroMeta(json: Record<string, unknown>): string {
  const err = json.error as MetaErrorShape | undefined
  if (!err) return JSON.stringify(json)

  const parts: string[] = []
  if (err.error_user_msg) parts.push(err.error_user_msg)
  else if (err.message) parts.push(err.message)
  if (err.code) parts.push(`[code ${err.code}]`)
  if (err.error_subcode) parts.push(`[subcode ${err.error_subcode}]`)
  if (err.fbtrace_id) parts.push(`[trace ${err.fbtrace_id}]`)

  return parts.join(" ") || "Erro desconhecido"
}
