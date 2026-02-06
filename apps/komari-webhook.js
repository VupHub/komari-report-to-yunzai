import { ensureKomariWebhookServer } from '../utils/server.js'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

async function loadPluginBase() {
  const tryImport = async (p) => {
    try {
      if (!p) return null
      const mod = await import(pathToFileURL(p).href)
      return mod?.default || null
    } catch {
      return null
    }
  }

  const fromRel = ['../../../lib/plugins/plugin.js', '../../lib/plugins/plugin.js', '../lib/plugins/plugin.js']
  for (const rel of fromRel) {
    const absPath = fileURLToPath(new URL(rel, import.meta.url))
    if (fs.existsSync(absPath)) {
      const base = await tryImport(absPath)
      if (base) return base
    }
  }

  const here = path.dirname(fileURLToPath(import.meta.url))
  let dir = here
  for (let i = 0; i < 12; i += 1) {
    const candidate = path.resolve(dir, 'lib', 'plugins', 'plugin.js')
    if (fs.existsSync(candidate)) {
      const base = await tryImport(candidate)
      if (base) return base
    }
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }

  const cwd = process.cwd()
  dir = cwd
  for (let i = 0; i < 12; i += 1) {
    const candidate = path.resolve(dir, 'lib', 'plugins', 'plugin.js')
    if (fs.existsSync(candidate)) {
      const base = await tryImport(candidate)
      if (base) return base
    }
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }

  return null
}

const plugin = (await loadPluginBase()) ?? (class PluginFallback {})

const server = ensureKomariWebhookServer()
server.start().catch(() => {})

export class KomariWebhook extends plugin {
  constructor() {
    super({
      name: 'KomariWebhook',
      dsc: 'Komari Webhook 通知转发',
      event: 'message',
      priority: 5000,
      rule: [
        {
          reg: '^\\s*#?komari(通知)?(状态|配置)\\s*$',
          fnc: 'status'
        },
        {
          reg: '^\\s*#?komari(通知)?重载\\s*$',
          fnc: 'reload'
        }
      ]
    })
  }

  async status(e) {
    const isMaster = !!e?.isMaster
    const { running, cfg } = server.getState()
    const firstRoute = Array.isArray(cfg.routes) && cfg.routes.length ? cfg.routes[0] : null
    const path = firstRoute?.path || cfg.path
    const url = firstRoute?.komari?.url || cfg.komari?.url || `http://${cfg.listenHost === '0.0.0.0' ? '你的服务器IP' : cfg.listenHost}:${cfg.listenPort}${path}`
    const token = firstRoute?.secret ?? cfg.secret
    const username = firstRoute?.komari?.username ?? cfg.komari?.username
    const password = firstRoute?.komari?.password ?? cfg.komari?.password
    const method = firstRoute?.komari?.method ?? cfg.komari?.method
    const contentType = firstRoute?.komari?.content_type ?? cfg.komari?.content_type
    const groups = firstRoute?.targets?.groups ?? cfg.targets?.groups ?? []
    const users = firstRoute?.targets?.users ?? cfg.targets?.users ?? []
    const safeValue = (value) => {
      if (!value) return ''
      if (isMaster) return String(value)
      const s = String(value)
      if (s.length <= 4) return `${s.slice(0, 1)}***`
      return `${s.slice(0, 2)}***${s.slice(-2)}`
    }
    const lines = [
      `运行状态：${running ? '运行中' : '未运行'}`,
      `Webhook：${url}`,
      `目标群：${groups.length ? groups.join(', ') : '无'}`,
      `目标私聊：${users.length ? users.join(', ') : '无'}`,
      `Token：${token ? (isMaster ? safeValue(token) : '开启') : '关闭'}`,
      `BasicAuth：${username || password ? (isMaster ? `${safeValue(username)} / ${safeValue(password)}` : '开启') : '关闭'}`,
      `Method：${method || 'POST'}`,
      `Content-Type：${contentType || 'application/json'}`
    ]
    await e.reply(lines.join('\n'), true)
    return true
  }

  async reload(e) {
    if (!e?.isMaster) return false
    try {
      await server.refresh()
      const { running } = server.getState()
      await e.reply(`已重载，当前：${running ? '运行中' : '未运行'}`, true)
    } catch (err) {
      await e.reply(`重载失败：${String(err?.message || err)}`, true)
    }
    return true
  }
}

