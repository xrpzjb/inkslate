import crypto from 'node:crypto'
import { UNLOCK_TTL_MS } from '../shared/types'

const ALGORITHM = 'aes-256-gcm'
const KEY_LENGTH = 32
const IV_LENGTH = 12
const TAG_LENGTH = 16
const SALT_LENGTH = 16
const PBKDF2_ITERATIONS = 100000
const PBKDF2_DIGEST = 'sha512'

/**
 * 每个笔记本的密码缓存（仅运行时内存，不落盘）。每条笔记用自己的 salt 派生密钥，
 * 因此缓存密码而非单一 key，才能解密同一个（子）笔记本内的任意笔记。
 *
 * 条目带有效期：解锁后 UNLOCK_TTL_MS（默认 10 分钟）到期即视为未解锁，
 * 之后再打开笔记需要重新输入密码。
 */
const passwordCache = new Map<string, { password: string; expiresAt: number }>()

/**
 * 写入宽容期：解锁刚过期的一小段时间内，仍允许"加密写入"。
 * 目的：正在编辑的笔记在过期瞬间的自动保存不会被静默丢弃（写入仍然用同一密码加密，
 * 不会造成明文泄漏）。读取（解密）不走宽容期 —— 过期就必须重新验证。
 */
const WRITE_GRACE_MS = 2 * 60 * 1000

/** 取出仍然有效的密码；extraMs 用于写入宽容期。过期即清理并返回 null */
function validPassword(notebookId: string, extraMs = 0): string | null {
  const entry = passwordCache.get(notebookId)
  if (!entry) return null
  if (Date.now() > entry.expiresAt + extraMs) {
    passwordCache.delete(notebookId)
    return null
  }
  return entry.password
}

function deriveKey(password: string, salt: Buffer): Buffer {
  return crypto.pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, KEY_LENGTH, PBKDF2_DIGEST)
}

/**
 * 派生 key 的内存缓存：PBKDF2 很贵（10 万次迭代），而解密时每条笔记都要按自己的
 * salt 派生一次。缓存后，同一进程内重复解锁/批量校验/历史密文修复都不会重复计算。
 * 键为「密码 + salt」，只存在内存里，随进程退出消失。
 */
const derivedKeyCache = new Map<string, Buffer>()
const DERIVED_KEY_CACHE_MAX = 2000

function deriveKeyCached(password: string, saltHex: string): Buffer {
  const cacheKey = `${password}\u0000${saltHex}`
  let key = derivedKeyCache.get(cacheKey)
  if (key) return key
  key = deriveKey(password, Buffer.from(saltHex, 'hex'))
  if (derivedKeyCache.size >= DERIVED_KEY_CACHE_MAX) derivedKeyCache.clear()
  derivedKeyCache.set(cacheKey, key)
  return key
}

export function isEncryptedContent(content: string): boolean {
  if (!content || content.length < 10) return false
  try {
    const obj = JSON.parse(content)
    return obj && typeof obj === 'object' && obj.salt && obj.iv && obj.tag && obj.data && obj.v === 1
  } catch {
    return false
  }
}

export function encryptNoteContent(plaintext: string, password: string): string {
  const salt = crypto.randomBytes(SALT_LENGTH)
  const key = deriveKey(password, salt)
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf-8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return JSON.stringify({
    v: 1,
    salt: salt.toString('hex'),
    iv: iv.toString('hex'),
    tag: tag.toString('hex'),
    data: encrypted.toString('hex')
  })
}

export function decryptNoteContent(encryptedJson: string, password: string): string | null {
  try {
    const obj = JSON.parse(encryptedJson)
    if (obj.v !== 1 || !obj.salt || !obj.iv || !obj.tag || !obj.data) return null
    const key = deriveKeyCached(password, obj.salt)
    return decryptWithKey(encryptedJson, key)
  } catch {
    return null
  }
}

/**
 * 用「已派生好的 key」解密（不按内容自带的 salt 再派生一次）。
 * 仅用于兼容历史遗留密文：早期版本先按某个「锚点」笔记的 salt 派生一次 key，
 * 之后缓存的是 key 而非密码，且新笔记写入时 JSON 里的 salt 是随机值、并不参与加密。
 * 这种密文用当前「密码 + 内容 salt」的方案永远解不开，只能拿候选 salt 派生 key 去试。
 */
export function decryptWithKey(encryptedJson: string, key: Buffer): string | null {
  try {
    const obj = JSON.parse(encryptedJson)
    if (obj.v !== 1 || !obj.iv || !obj.tag || !obj.data) return null
    const iv = Buffer.from(obj.iv, 'hex')
    const tag = Buffer.from(obj.tag, 'hex')
    const data = Buffer.from(obj.data, 'hex')
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
    decipher.setAuthTag(tag)
    const decrypted = Buffer.concat([decipher.update(data), decipher.final()])
    return decrypted.toString('utf-8')
  } catch {
    return null
  }
}

/** 取出密文 JSON 里的 salt（拿不到返回 null） */
export function saltOfEncrypted(encryptedJson: string): string | null {
  try {
    const obj = JSON.parse(encryptedJson)
    return typeof obj?.salt === 'string' && obj.salt ? obj.salt : null
  } catch {
    return null
  }
}

/** 由密码 + 指定 salt 派生 key（历史遗留密文的锚点 salt 复原用） */
export function deriveKeyFromSalt(password: string, saltHex: string): Buffer {
  return deriveKeyCached(password, saltHex)
}

/** 该笔记本当前是否已解锁（且验证未过期） */
export function hasCachedPassword(notebookId: string): boolean {
  return validPassword(notebookId) !== null
}

/** 缓存密码（从此刻起 UNLOCK_TTL_MS 内有效） */
export function cachePassword(notebookId: string, password: string): void {
  passwordCache.set(notebookId, { password, expiresAt: Date.now() + UNLOCK_TTL_MS })
}

export function removeCachedPassword(notebookId: string): void {
  passwordCache.delete(notebookId)
}

/** 用缓存密码解密（按内容自身 salt 派生密钥，可解密该笔记本内任意笔记）；已过期返回 null */
export function decryptWithCachedPassword(encryptedJson: string, notebookId: string): string | null {
  const password = validPassword(notebookId)
  if (!password) return null
  return decryptNoteContent(encryptedJson, password)
}

/** 用缓存密码加密；允许 WRITE_GRACE_MS 的写入宽容期（读取没有宽容期） */
export function encryptWithCachedPassword(plaintext: string, notebookId: string): string | null {
  const password = validPassword(notebookId, WRITE_GRACE_MS)
  if (!password) return null
  return encryptNoteContent(plaintext, password)
}

/**
 * 密码校验用的固定明文（不含任何用户数据）。
 * 把它的密文存在笔记本上，任何时刻都能校验密码对不对 ——
 * 不必依赖"该笔记本下必须还有一篇密文笔记"。
 */
const VERIFY_MARK = 'inkslate:password-verifier:v1'

export function makePasswordVerifier(password: string): string {
  return encryptNoteContent(VERIFY_MARK, password)
}

export function checkPasswordVerifier(verifier: string, password: string): boolean {
  return decryptNoteContent(verifier, password) === VERIFY_MARK
}
