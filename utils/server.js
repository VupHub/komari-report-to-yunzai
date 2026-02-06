import http from 'node:http'
import { URL } from 'node:url'

import { ensureConfig, normalizeConfig, readConfig } from './config.js'

function decodeBasicAuth(authHeader) {
  const h = String(authHeader ?? '').trim()
  if (!h.toLowerCase().startsWith('basic ')) return null
  const b64 = h.slice(6).trim()
  try {
    const decoded = Buffer.from(b64, 'base64').toString('utf8')
    const i = decoded.indexOf(':')
    if (i === -1) return { username: decoded, password: '' }
    return { username: decoded.slice(0, i), password: decoded.slice(i + 1) }
  } catch {
    return null
  }
}

function getBots() {
  const b = globalThis.Bot
  if (!b) return []
  if (typeof b.pickGroup === 'function') return [b]
  if (Array.isArray(b)) return b.filter((x) => x && typeof x.pickGroup === 'function')
  if (b instanceof Map) return Array.from(b.values()).filter((x) => x && typeof x.pickGroup === 'function')
  if (typeof b === 'object') {
    return Object.values(b).filter((x) => x && typeof x.pickGroup === 'function')
  }
  return []
}

async function trySendToGroup(groupId, msg) {
  const bots = getBots()
  for (const bot of bots) {
    try {
      const group = bot.pickGroup?.(Number(groupId))
      if (!group?.sendMsg) continue
      await group.sendMsg(msg)
      return true
    } catch {}
  }
  return false
}

async function trySendToUser(userId, msg) {
  const bots = getBots()
  for (const bot of bots) {
    try {
      const user = bot.pickUser?.(Number(userId))
      if (!user?.sendMsg) continue
      await user.sendMsg(msg)
      return true
    } catch {}
  }
  return false
}

function pickFirstNonEmpty(...values) {
  for (const v of values) {
    const s = typeof v === 'string' ? v : v == null ? '' : String(v)
    if (s && s.trim()) return s.trim()
  }
  return ''
}

function toShanghaiTimeString(iso) {
  const d = new Date(iso)
  if (!Number.isFinite(d.getTime())) return ''
  try {
    const parts = new Intl.DateTimeFormat('zh-CN', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    }).formatToParts(d)
    const map = Object.fromEntries(parts.map((p) => [p.type, p.value]))
    const y = map.year
    const m = map.month
    const day = map.day
    const h = map.hour
    const min = map.minute
    const s = map.second
    if (y && m && day && h && min && s) return `${y}-${m}-${day} ${h}:${min}:${s}`
  } catch {}
  return ''
}

function normalizeIsoZTimeText(text) {
  const t = String(text ?? '')
  if (!t) return t
  const isoZ = /\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z\b/g
  return t.replace(isoZ, (m) => toShanghaiTimeString(m) || m)
}

function formatMessage(payload, route) {
  const title = pickFirstNonEmpty(payload?.title, payload?.event, payload?.type, '通知')
  const msg = pickFirstNonEmpty(payload?.message, payload?.text, payload?.content)
  const message = normalizeIsoZTimeText(msg || JSON.stringify(payload ?? {}, null, 2))

  const template = String(route.message?.template ?? '{prefix} {title}\n{message}')
  const prefix = String(route.message?.prefix ?? '')
  const rendered = template
    .replaceAll('{prefix}', prefix)
    .replaceAll('{title}', title)
    .replaceAll('{message}', message)
    .trim()
  if (rendered) return rendered
  return `${prefix ? `${prefix} ` : ''}${title}\n${message}`.trim()
}

function readRequestBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    let total = 0
    const chunks = []
    req.on('data', (chunk) => {
      total += chunk.length
      if (total > maxBytes) {
        reject(new Error('body_too_large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

function parseBody(buffer, contentType) {
  const raw = buffer.toString('utf8')
  if (!raw) return {}
  if (String(contentType ?? '').toLowerCase().includes('application/json')) {
    return JSON.parse(raw)
  }
  try {
    return JSON.parse(raw)
  } catch {
    return { text: raw }
  }
}

function parseHeadersJson(input) {
  const raw = String(input ?? '').trim()
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed
    return null
  } catch {
    return null
  }
}

function checkBasicAuth(req, route) {
  const username = String(route.komari?.username ?? '').trim()
  const password = String(route.komari?.password ?? '').trim()
  if (!username && !password) return true
  const parsed = decodeBasicAuth(req.headers.authorization)
  if (!parsed) return false
  return parsed.username === username && parsed.password === password
}

function checkRequiredHeaders(req, route) {
  const required = parseHeadersJson(route.komari?.headers)
  if (!required) return true
  for (const [k, v] of Object.entries(required)) {
    const key = String(k).toLowerCase()
    const expected = String(v)
    const actual = req.headers[key]
    if (Array.isArray(actual)) {
      if (!actual.some((x) => String(x) === expected)) return false
      continue
    }
    if (String(actual ?? '') !== expected) return false
  }
  return true
}

function checkContentType(req, route) {
  const expected = String(route.komari?.content_type ?? '').trim().toLowerCase()
  if (!expected) return true
  const actual = String(req.headers['content-type'] ?? '').toLowerCase()
  return actual.includes(expected)
}

function createServer(getCfg, onWebhook) {
  return http.createServer(async (req, res) => {
    const cfg = getCfg()

    const urlObj = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)
    const route =
      (Array.isArray(cfg.routes) ? cfg.routes : []).find((r) => r && r.enable && String(r.path || '') === urlObj.pathname) || null

    if (!route) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
      res.end('Not Found')
      return
    }

    if (req.method === 'GET') {
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify({ ok: true, route: route.id }))
      return
    }

    const expectedMethod = String(route.komari?.method ?? 'POST').toUpperCase()
    if (req.method !== expectedMethod) {
      res.writeHead(405, { 'content-type': 'text/plain; charset=utf-8' })
      res.end('Method Not Allowed')
      return
    }

    if (!checkBasicAuth(req, route)) {
      res.writeHead(401, { 'content-type': 'text/plain; charset=utf-8' })
      res.end('Unauthorized')
      return
    }

    if (!checkRequiredHeaders(req, route)) {
      res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' })
      res.end('Forbidden')
      return
    }

    if (!checkContentType(req, route)) {
      res.writeHead(415, { 'content-type': 'text/plain; charset=utf-8' })
      res.end('Unsupported Media Type')
      return
    }

    let bodyBuf
    try {
      bodyBuf = await readRequestBody(req, cfg.security.maxBodyBytes)
    } catch (err) {
      res.writeHead(413, { 'content-type': 'text/plain; charset=utf-8' })
      res.end(String(err?.message || 'Payload Too Large'))
      return
    }

    let payload
    try {
      payload = parseBody(bodyBuf, req.headers['content-type'])
    } catch (err) {
      res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' })
      res.end(String(err?.message || 'Bad Request'))
      return
    }

    const text = formatMessage(payload, route)
    const targets = {
      groups: route.targets.groups,
      users: route.targets.users
    }

    try {
      await onWebhook({ payload, text, targets, cfg, route })
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify({ ok: true }))
    } catch (err) {
      res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify({ ok: false, error: String(err?.message || err) }))
    }
  })
}

function needRestart(prevCfg, nextCfg) {
  return (
    prevCfg.enable !== nextCfg.enable ||
    prevCfg.listenHost !== nextCfg.listenHost ||
    prevCfg.listenPort !== nextCfg.listenPort
  )
}

export function ensureKomariWebhookServer() {
  globalThis.__komariWebhookServer ??= {
    server: null,
    cfgSnapshot: null,
    starting: null
  }

  const state = globalThis.__komariWebhookServer

  const start = async () => {
    const cfg = normalizeConfig(ensureConfig())
    state.cfgSnapshot = cfg

    if (!cfg.enable) return
    if (state.server) return

    const srv = createServer(
      () => state.cfgSnapshot ?? normalizeConfig(ensureConfig()),
      async ({ text, targets }) => {
        const sendTasks = []
        for (const gid of targets.groups) {
          sendTasks.push(trySendToGroup(gid, text))
        }
        for (const uid of targets.users) {
          sendTasks.push(trySendToUser(uid, text))
        }
        await Promise.allSettled(sendTasks)
      }
    )

    await new Promise((resolve, reject) => {
      srv.once('error', reject)
      srv.listen(cfg.listenPort, cfg.listenHost, resolve)
    })

    state.server = srv
  }

  const stop = async () => {
    if (!state.server) return
    const srv = state.server
    state.server = null
    await new Promise((resolve) => srv.close(() => resolve()))
  }

  const refresh = async () => {
    const nextCfg = normalizeConfig(ensureConfig())
    const prevCfg = state.cfgSnapshot ?? nextCfg
    const restart = needRestart(prevCfg, nextCfg)
    state.cfgSnapshot = nextCfg

    if (restart) {
      await stop()
      await start()
      return
    }

    if (!nextCfg.enable) {
      await stop()
      return
    }

    if (!state.server) {
      await start()
    }
  }

  const ensureStarted = async () => {
    if (state.starting) return state.starting
    state.starting = (async () => {
      try {
        await refresh()
      } finally {
        state.starting = null
      }
    })()
    return state.starting
  }

  return {
    start: ensureStarted,
    stop,
    refresh,
    getState: () => ({
      running: Boolean(state.server),
      cfg: state.cfgSnapshot ?? normalizeConfig(readConfig())
    })
  }
}

