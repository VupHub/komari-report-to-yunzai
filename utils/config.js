import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const configPath = path.resolve(__dirname, '..', 'config', 'config.json')

const defaultConfig = Object.freeze({
  enable: true,
  listenHost: '0.0.0.0',
  listenPort: 25888,
  path: '/komari/webhook',
  secret: '',
  komari: {
    url: '',
    method: 'POST',
    content_type: 'application/json',
    headers: '{}',
    body: '{"title":"{{title}}","message":"{{message}}"}',
    username: '',
    password: ''
  },
  targets: {
    groups: [],
    users: []
  },
  message: {
    prefix: '[Komari]',
    template: '{prefix} {title}\n{message}'
  },
  security: {
    maxBodyBytes: 1024 * 1024
  }
})

function ensureDirForFile(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
}

function deepMerge(base, override) {
  if (override == null || typeof override !== 'object' || Array.isArray(override)) {
    return override ?? base
  }
  const result = { ...(base ?? {}) }
  for (const [k, v] of Object.entries(override)) {
    const bv = base?.[k]
    if (v != null && typeof v === 'object' && !Array.isArray(v)) {
      result[k] = deepMerge(bv ?? {}, v)
    } else if (v !== undefined) {
      result[k] = v
    }
  }
  return result
}

export function getConfigPath() {
  return configPath
}

export function getDefaultConfig() {
  return defaultConfig
}

export function readConfig() {
  try {
    if (!fs.existsSync(configPath)) {
      return structuredClone(defaultConfig)
    }
    const raw = fs.readFileSync(configPath, 'utf8')
    const parsed = JSON.parse(raw || '{}')
    return deepMerge(structuredClone(defaultConfig), parsed)
  } catch {
    return structuredClone(defaultConfig)
  }
}

export function writeConfig(nextConfig) {
  const merged = deepMerge(structuredClone(defaultConfig), nextConfig ?? {})
  ensureDirForFile(configPath)
  fs.writeFileSync(configPath, JSON.stringify(merged, null, 2), 'utf8')
  return merged
}

export function normalizeTargets(value) {
  const list = Array.isArray(value) ? value : []
  return list
    .map((v) => String(v ?? '').trim())
    .filter(Boolean)
    .filter((v, i, arr) => arr.indexOf(v) === i)
}

export function normalizeConfig(input) {
  const cfg = deepMerge(structuredClone(defaultConfig), input ?? {})

  cfg.enable = Boolean(cfg.enable)
  cfg.listenHost = String(cfg.listenHost ?? '0.0.0.0').trim() || '0.0.0.0'

  const port = Number(cfg.listenPort)
  cfg.listenPort = Number.isFinite(port) ? Math.max(1, Math.min(65535, Math.trunc(port))) : defaultConfig.listenPort

  let p = String(cfg.path ?? defaultConfig.path).trim() || defaultConfig.path
  if (!p.startsWith('/')) p = `/${p}`
  cfg.path = p

  cfg.secret = String(cfg.secret ?? '').trim()

  cfg.komari ??= {}
  cfg.komari.url = String(cfg.komari.url ?? '').trim()
  cfg.komari.method = String(cfg.komari.method ?? defaultConfig.komari.method).trim().toUpperCase() || defaultConfig.komari.method
  cfg.komari.content_type = String(cfg.komari.content_type ?? defaultConfig.komari.content_type).trim() || defaultConfig.komari.content_type
  cfg.komari.headers = String(cfg.komari.headers ?? defaultConfig.komari.headers).trim() || defaultConfig.komari.headers
  cfg.komari.body = String(cfg.komari.body ?? defaultConfig.komari.body)
  cfg.komari.username = String(cfg.komari.username ?? '').trim()
  cfg.komari.password = String(cfg.komari.password ?? '').trim()

  cfg.targets ??= {}
  cfg.targets.groups = normalizeTargets(cfg.targets.groups)
  cfg.targets.users = normalizeTargets(cfg.targets.users)

  cfg.message ??= {}
  cfg.message.prefix = String(cfg.message.prefix ?? defaultConfig.message.prefix)
  cfg.message.template = String(cfg.message.template ?? defaultConfig.message.template)

  cfg.security ??= {}
  const maxBodyBytes = Number(cfg.security.maxBodyBytes)
  cfg.security.maxBodyBytes = Number.isFinite(maxBodyBytes)
    ? Math.max(1024, Math.min(10 * 1024 * 1024, Math.trunc(maxBodyBytes)))
    : defaultConfig.security.maxBodyBytes

  if (!cfg.komari.url) {
    const host = cfg.listenHost === '0.0.0.0' ? '你的服务器IP' : cfg.listenHost
    cfg.komari.url = `http://${host}:${cfg.listenPort}${cfg.path}`
  }

  return cfg
}

export function updateConfig(partial) {
  const current = readConfig()
  const merged = normalizeConfig(deepMerge(current, partial ?? {}))
  return writeConfig(merged)
}
