/**
 * ali-oss 模块类型 shim
 * - 用 require() 引入以兼容 CommonJS
 */
declare module 'ali-oss' {
  const OSS: any
  export default OSS
  export = OSS
}
