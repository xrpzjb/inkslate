import crypto from 'node:crypto'

const ALGORITHM = 'aes-256-gcm'
const KEY_LENGTH = 32
const IV_LENGTH = 12
const TAG_LENGTH = 16
const SALT_LENGTH = 16
const PBKDF2_ITERATIONS = 100000
const PBKDF2_DIGEST = 'sha512'

/** 每个笔记本的密码缓存（仅运行时内存，不落盘）。每条笔记用自己的 salt 派生密钥，
 *  因此缓存密码而非单一 key，才能解密同一个（子）笔记本内的任意笔记 */
const passwordCache = new Map<string, string>()

function deriveKey(password: string, salt: Buffer): Buffer {
  return crypto.pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, KEY_LENGTH, PBKDF2_DIGEST)
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
    const salt = Buffer.from(obj.salt, 'hex')
    const key = deriveKey(password, salt)
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

export function hasCachedPassword(notebookId: string): boolean {
  return passwordCache.has(notebookId)
}

export function cachePassword(notebookId: string, password: string): void {
  passwordCache.set(notebookId, password)
}

export function removeCachedPassword(notebookId: string): void {
  passwordCache.delete(notebookId)
}

/** 用缓存密码解密（按内容自身 salt 派生密钥，可解密该笔记本内任意笔记） */
export function decryptWithCachedPassword(encryptedJson: string, notebookId: string): string | null {
  const password = passwordCache.get(notebookId)
  if (!password) return null
  return decryptNoteContent(encryptedJson, password)
}

/** 用缓存密码加密（需要先 unlock 缓存密码） */
export function encryptWithCachedPassword(plaintext: string, notebookId: string): string | null {
  const password = passwordCache.get(notebookId)
  if (!password) return null
  return encryptNoteContent(plaintext, password)
}
