import { ensureKomariWebhookServer } from '../utils/server.js'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

async function loadPluginBase() {
  const relCandidates = ['../../../lib/plugins/plugin.js', '../../lib/plugins/plugin.js', '../lib/plugins/plugin.js']
  for (const rel of relCandidates) {
    try {
      const mod = await import(new URL(rel, import.meta.url).href)
      if (mod?.default) return mod.default
    } catch {}
  }

  const absCandidates = [
    path.resolve(process.cwd(), 'lib', 'plugins', 'plugin.js'),
    path.resolve(process.cwd(), '..', 'lib', 'plugins', 'plugin.js')
  ]
  for (const absPath of absCandidates) {
    try {
      const mod = await import(pathToFileURL(absPath).href)
      if (mod?.default) return mod.default
    } catch {}
  }

  return class PluginFallback {
    constructor() {}
  }
}

const plugin = await loadPluginBase()

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

