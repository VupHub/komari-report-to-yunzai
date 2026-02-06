import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
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
  routes: [],
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

function randomUrlSafeString(bytes = 18) {
  return crypto
    .randomBytes(bytes)
    .toString('base64')
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '')
}

function shouldRegenerateSecret(value) {
  const s = String(value ?? '').trim()
  return !s || s === 'tok' || s === 'token'
}

function shouldRegenerateUser(value) {
  const s = String(value ?? '').trim()
  return !s || s === 'u' || s === 'user'
}

function shouldRegeneratePass(value) {
  const s = String(value ?? '').trim()
  return !s || s === 'p' || s === 'pass' || s === 'password'
}

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

export function ensureConfig() {
  const current = readConfig()
  const normalized = normalizeConfig(current)
  if (JSON.stringify(current) !== JSON.stringify(normalized)) {
    return writeConfig(normalized)
  }
  return normalized
}

export function normalizeTargets(value) {
  const list = Array.isArray(value) ? value : []
  return list
    .map((v) => String(v ?? '').trim())
    .filter(Boolean)
    .filter((v, i, arr) => arr.indexOf(v) === i)
}

function normalizePathname(value, fallback) {
  let p = String(value ?? fallback ?? '').trim() || String(fallback ?? '').trim() || '/'
  if (!p.startsWith('/')) p = `/${p}`
  return p
}

function normalizeRoute(route, index, cfg) {
  const r = deepMerge(
    {
      id: '',
      name: '',
      enable: true,
      path: defaultConfig.path,
      secret: '',
      komari: structuredClone(defaultConfig.komari),
      targets: structuredClone(defaultConfig.targets),
      message: structuredClone(defaultConfig.message)
    },
    route ?? {}
  )

  r.enable = Boolean(r.enable)
  r.id = String(r.id ?? '').trim() || `route${index + 1}`
  r.name = String(r.name ?? '').trim() || r.id
  r.path = normalizePathname(r.path, defaultConfig.path)
  r.secret = String(r.secret ?? '').trim()

  r.komari ??= {}
  r.komari.url = String(r.komari.url ?? '').trim()
  r.komari.method = String(r.komari.method ?? defaultConfig.komari.method).trim().toUpperCase() || defaultConfig.komari.method
  r.komari.content_type = String(r.komari.content_type ?? defaultConfig.komari.content_type).trim() || defaultConfig.komari.content_type
  r.komari.headers = String(r.komari.headers ?? defaultConfig.komari.headers).trim() || defaultConfig.komari.headers
  r.komari.body = String(r.komari.body ?? defaultConfig.komari.body)
  r.komari.username = String(r.komari.username ?? '').trim()
  r.komari.password = String(r.komari.password ?? '').trim()

  r.targets ??= {}
  r.targets.groups = normalizeTargets(r.targets.groups)
  r.targets.users = normalizeTargets(r.targets.users)

  r.message ??= {}
  r.message.prefix = String(r.message.prefix ?? defaultConfig.message.prefix)
  r.message.template = String(r.message.template ?? defaultConfig.message.template)

  if (!r.komari.url) {
    const host = cfg.listenHost === '0.0.0.0' ? '你的服务器IP' : cfg.listenHost
    r.komari.url = `http://${host}:${cfg.listenPort}${r.path}`
  }

  if (shouldRegenerateSecret(r.secret)) {
    r.secret = randomUrlSafeString(18)
  }
  if (shouldRegenerateUser(r.komari.username)) {
    r.komari.username = `komari_${randomUrlSafeString(6)}`
  }
  if (shouldRegeneratePass(r.komari.password)) {
    r.komari.password = randomUrlSafeString(18)
  }

  return r
}

export function normalizeConfig(input) {
  const cfg = deepMerge(structuredClone(defaultConfig), input ?? {})

  cfg.enable = Boolean(cfg.enable)
  cfg.listenHost = String(cfg.listenHost ?? '0.0.0.0').trim() || '0.0.0.0'

  const port = Number(cfg.listenPort)
  cfg.listenPort = Number.isFinite(port) ? Math.max(1, Math.min(65535, Math.trunc(port))) : defaultConfig.listenPort

  cfg.path = normalizePathname(cfg.path, defaultConfig.path)
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

  const legacyRoute = {
    id: 'default',
    name: '默认',
    enable: true,
    path: cfg.path,
    secret: cfg.secret,
    komari: cfg.komari,
    targets: cfg.targets,
    message: cfg.message
  }

  const routesInput = Array.isArray(cfg.routes) ? cfg.routes : []
  const routesSource = routesInput.length ? routesInput : [legacyRoute]
  cfg.routes = routesSource.map((r, i) => {
    const base = i === 0 ? legacyRoute : undefined
    return normalizeRoute(deepMerge(base ?? {}, r ?? {}), i, cfg)
  })

  const firstRoute = cfg.routes[0]
  cfg.path = firstRoute.path
  cfg.secret = firstRoute.secret
  cfg.komari = firstRoute.komari
  cfg.targets = firstRoute.targets
  cfg.message = firstRoute.message

  return cfg
}

export function updateConfig(partial) {
  const current = readConfig()
  const merged = normalizeConfig(deepMerge(current, partial ?? {}))
  const written = writeConfig(merged)
  const normalized = normalizeConfig(written)
  if (JSON.stringify(written) !== JSON.stringify(normalized)) {
    return writeConfig(normalized)
  }
  return written
}
