import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const configPath = path.resolve(__dirname, '..', 'config', 'config.json')

const DEFAULT_ROUTE_PATH = '/komari/webhook'

const defaultConfig = Object.freeze({
  enable: false,
  listenHost: '0.0.0.0',
  listenPort: 25888,
  routes: [],
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
      path: DEFAULT_ROUTE_PATH,
      komari: {
        url: '',
        method: 'POST',
        content_type: '',
        headers: '',
        body: '',
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
      }
    },
    route ?? {}
  )

  r.enable = Boolean(r.enable)
  r.id = String(r.id ?? '').trim() || `route${index + 1}`
  r.name = String(r.name ?? '').trim() || r.id
  r.path = normalizePathname(r.path, DEFAULT_ROUTE_PATH)
  delete r.secret

  r.komari ??= {}
  r.komari.url = String(r.komari.url ?? '').trim()
  r.komari.method = String(r.komari.method ?? 'POST').trim().toUpperCase() || 'POST'
  r.komari.content_type = String(r.komari.content_type ?? '').trim()
  r.komari.headers = String(r.komari.headers ?? '').trim()
  r.komari.body = String(r.komari.body ?? '')
  r.komari.username = String(r.komari.username ?? '').trim()
  r.komari.password = String(r.komari.password ?? '').trim()

  r.targets ??= {}
  r.targets.groups = normalizeTargets(r.targets.groups)
  r.targets.users = normalizeTargets(r.targets.users)

  r.message ??= {}
  r.message.prefix = String(r.message.prefix ?? '[Komari]')
  r.message.template = String(r.message.template ?? '{prefix} {title}\n{message}')

  if (r.enable && shouldRegenerateUser(r.komari.username)) {
    r.komari.username = `komari_${randomUrlSafeString(6)}`
  }
  if (r.enable && shouldRegeneratePass(r.komari.password)) {
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
  delete cfg.path
  delete cfg.secret
  delete cfg.komari
  delete cfg.targets
  delete cfg.message

  cfg.security ??= {}
  const maxBodyBytes = Number(cfg.security.maxBodyBytes)
  cfg.security.maxBodyBytes = Number.isFinite(maxBodyBytes)
    ? Math.max(1024, Math.min(10 * 1024 * 1024, Math.trunc(maxBodyBytes)))
    : defaultConfig.security.maxBodyBytes

  const routesInput = Array.isArray(cfg.routes) ? cfg.routes : []
  let routesSource = routesInput
  if (!routesSource.length) {
    const legacy = input ?? {}
    const hasLegacy =
      legacy && typeof legacy === 'object' && (legacy.path || legacy.komari || legacy.targets || legacy.message || legacy.secret)
    if (hasLegacy) {
      routesSource = [
        {
          id: 'default',
          name: '默认',
          enable: true,
          path: legacy.path ?? DEFAULT_ROUTE_PATH,
          komari: legacy.komari ?? {},
          targets: legacy.targets ?? {},
          message: legacy.message ?? {}
        }
      ]
    }
  }

  cfg.routes = routesSource.map((r, i) => normalizeRoute(r, i, cfg))

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
