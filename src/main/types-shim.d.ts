/**
 * ali-oss 模块类型 shim
 * - 用 require() 引入以兼容 CommonJS
 */
declare module 'ali-oss' {
  const OSS: any
  export default OSS
  export = OSS
}

/**
 * ssh2 模块类型 shim
 * - 只用到的 Client / SFTP 能力，用 any 兜底避免引入 @types/ssh2
 */
declare module 'ssh2' {
  export class Client {
    connect(config: any): void
    exec(command: string, cb: (err: Error | undefined, stream: any) => void): void
    sftp(cb: (err: Error | undefined, sftp: any) => void): void
    end(): void
    on(event: string, listener: (...args: any[]) => void): this
  }
}
