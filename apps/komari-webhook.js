import plugin from '../../../lib/plugins/plugin.js'

import { ensureKomariWebhookServer } from '../utils/server.js'

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
          reg: '^#?komari(通知)?(状态|配置)$',
          fnc: 'status'
        },
        {
          reg: '^#?komari(通知)?重载$',
          fnc: 'reload'
        }
      ]
    })
  }

  async status(e) {
    if (!e?.isMaster) return false
    const { running, cfg } = server.getState()
    const url = cfg.komari?.url || `http://${cfg.listenHost === '0.0.0.0' ? '你的服务器IP' : cfg.listenHost}:${cfg.listenPort}${cfg.path}`
    const lines = [
      `运行状态：${running ? '运行中' : '未运行'}`,
      `Webhook：${url}`,
      `目标群：${cfg.targets.groups.length ? cfg.targets.groups.join(', ') : '无'}`,
      `目标私聊：${cfg.targets.users.length ? cfg.targets.users.join(', ') : '无'}`,
      `Token：${cfg.secret ? '开启' : '关闭'}`,
      `BasicAuth：${cfg.komari?.username || cfg.komari?.password ? '开启' : '关闭'}`,
      `Method：${cfg.komari?.method || 'POST'}`,
      `Content-Type：${cfg.komari?.content_type || 'application/json'}`
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

