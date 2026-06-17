import { AppSettings, AssetUploadResult } from '../../shared/types'

/** OSS 客户端统一接口 */
export interface IOssClient {
  configure(config: AppSettings['oss']): void
  testConnection(): Promise<{ ok: boolean; message: string }>
  upload(key: string, buffer: Buffer, contentType: string): Promise<AssetUploadResult>
  uploadAsset(buffer: Buffer, filename: string, contentType: string): Promise<AssetUploadResult>
  exists(key: string): Promise<boolean>
  delete(key: string): Promise<void>
  list(prefix: string): Promise<{ key: string; size: number; lastModified: number }[]>
  get(key: string): Promise<Buffer>
}
