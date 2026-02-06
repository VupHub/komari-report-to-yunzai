import { ensureConfig, normalizeConfig, normalizeTargets, updateConfig } from './utils/config.js'
import { ensureKomariWebhookServer } from './utils/server.js'

const server = ensureKomariWebhookServer()
const MAX_ROUTES = 3

function normalizeTargetsFromGuobaInput(input) {
  if (Array.isArray(input)) return normalizeTargets(input)
  return normalizeTargets(
    String(input ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  )
}

function resolveBots() {
  const b = globalThis.Bot
  if (!b) return []
  if (typeof b.pickGroup === 'function') return [b]
  if (Array.isArray(b)) return b.filter((x) => x && typeof x.pickGroup === 'function')
  if (b instanceof Map) return Array.from(b.values()).filter((x) => x && typeof x.pickGroup === 'function')
  if (typeof b === 'object') return Object.values(b).filter((x) => x && typeof x.pickGroup === 'function')
  return []
}

function uniqOptions(options) {
  const seen = new Set()
  const result = []
  for (const o of Array.isArray(options) ? options : []) {
    const value = String(o?.value ?? '')
    if (!value || seen.has(value)) continue
    seen.add(value)
    result.push({ label: String(o?.label ?? value), value })
  }
  return result
}

function ensureOptionValues(options, values) {
  const base = uniqOptions(options)
  const set = new Set(base.map((o) => o.value))
  for (const v of Array.isArray(values) ? values : []) {
    const value = String(v ?? '').trim()
    if (!value || set.has(value)) continue
    set.add(value)
    base.push({ label: value, value })
  }
  return base
}

function getGroupOptionsFromBots(bots) {
  const options = []
  for (const bot of bots) {
    const gl = bot?.gl
    if (gl && typeof gl.forEach === 'function') {
      gl.forEach((info, id) => {
        const gid = String(id ?? '').trim()
        if (!gid) return
        const name = info?.group_name ?? info?.groupName ?? info?.name ?? ''
        options.push({ label: name ? `${name} (${gid})` : gid, value: gid })
      })
      continue
    }
    if (gl && typeof gl === 'object') {
      for (const [id, info] of Object.entries(gl)) {
        const gid = String(id ?? '').trim()
        if (!gid) continue
        const name = info?.group_name ?? info?.groupName ?? info?.name ?? ''
        options.push({ label: name ? `${name} (${gid})` : gid, value: gid })
      }
    }
  }
  return uniqOptions(options).sort((a, b) => a.label.localeCompare(b.label, 'zh-Hans-CN'))
}

function getFriendOptionsFromBots(bots) {
  const options = []
  for (const bot of bots) {
    const fl = bot?.fl
    if (fl && typeof fl.forEach === 'function') {
      fl.forEach((info, id) => {
        const uid = String(id ?? '').trim()
        if (!uid) return
        const name = info?.remark ?? info?.nickname ?? info?.nick ?? info?.name ?? ''
        options.push({ label: name ? `${name} (${uid})` : uid, value: uid })
      })
      continue
    }
    if (fl && typeof fl === 'object') {
      for (const [id, info] of Object.entries(fl)) {
        const uid = String(id ?? '').trim()
        if (!uid) continue
        const name = info?.remark ?? info?.nickname ?? info?.nick ?? info?.name ?? ''
        options.push({ label: name ? `${name} (${uid})` : uid, value: uid })
      }
    }
  }
  return uniqOptions(options).sort((a, b) => a.label.localeCompare(b.label, 'zh-Hans-CN'))
}

export function supportGuoba() {
  const getCfg = () => normalizeConfig(ensureConfig())
  const cfg = getCfg()
  const bots = resolveBots()
  const groupOptions = ensureOptionValues(getGroupOptionsFromBots(bots), cfg.routes.flatMap((r) => r?.targets?.groups ?? []))
  const userOptions = ensureOptionValues(getFriendOptionsFromBots(bots), cfg.routes.flatMap((r) => r?.targets?.users ?? []))
  const selectFilterable = { filterable: true, clearable: true }
  const selectMultiCreatable = { ...selectFilterable, multiple: true, allowCreate: true, defaultFirstOption: true }

  const methodOptions = [
    { label: 'POST', value: 'POST' },
    { label: 'GET', value: 'GET' },
    { label: 'PUT', value: 'PUT' },
    { label: 'PATCH', value: 'PATCH' },
    { label: 'DELETE', value: 'DELETE' }
  ]
  const contentTypeOptions = [
    { label: 'application/json', value: 'application/json' },
    { label: 'application/x-www-form-urlencoded', value: 'application/x-www-form-urlencoded' },
    { label: 'text/plain', value: 'text/plain' }
  ]
  const listenHostOptions = [
    { label: '0.0.0.0（所有网卡）', value: '0.0.0.0' },
    { label: '127.0.0.1（仅本机）', value: '127.0.0.1' }
  ]

  const routeSchemas = []
  for (let i = 0; i < MAX_ROUTES; i += 1) {
    const n = i + 1
    routeSchemas.push(
      {
        field: `route${n}_enable`,
        label: `路由${n} 启用`,
        component: 'Switch'
      },
      {
        field: `route${n}_name`,
        label: `路由${n} 名称`,
        component: 'Input',
        placeholder: `route${n}`
      },
      {
        field: `route${n}_path`,
        label: `路由${n} Path`,
        component: 'Select',
        options: [{ label: `/komari/webhook${n === 1 ? '' : n}`, value: `/komari/webhook${n === 1 ? '' : n}` }],
        componentProps: {
          ...selectFilterable,
          allowCreate: true,
          defaultFirstOption: true,
          placeholder: '请选择或输入',
          options: [{ label: `/komari/webhook${n === 1 ? '' : n}`, value: `/komari/webhook${n === 1 ? '' : n}` }]
        }
      },
      {
        field: `route${n}_secret`,
        label: `路由${n} Token`,
        component: 'Input',
        placeholder: '留空则自动生成'
      },
      {
        field: `route${n}_komari_url`,
        label: `路由${n} url*`,
        component: 'Input',
        placeholder: `http://你的服务器IP:25888/komari/webhook${n === 1 ? '' : n}`
      },
      {
        field: `route${n}_komari_method`,
        label: `路由${n} method`,
        component: 'Select',
        options: methodOptions,
        componentProps: { ...selectFilterable, placeholder: '请选择', options: methodOptions }
      },
      {
        field: `route${n}_komari_content_type`,
        label: `路由${n} content_type`,
        component: 'Select',
        options: contentTypeOptions,
        componentProps: { ...selectFilterable, allowCreate: true, defaultFirstOption: true, placeholder: '请选择或输入', options: contentTypeOptions }
      },
      {
        field: `route${n}_komari_headers`,
        label: `路由${n} headers(JSON)`,
        component: 'Input',
        componentProps: { type: 'textarea', autosize: { minRows: 2, maxRows: 6 } },
        placeholder: '{"x-komari-token":"xxx"}'
      },
      {
        field: `route${n}_komari_body`,
        label: `路由${n} body`,
        component: 'Input',
        componentProps: { type: 'textarea', autosize: { minRows: 2, maxRows: 8 } },
        placeholder: '{"title":"{{title}}","message":"{{message}}"}'
      },
      {
        field: `route${n}_komari_username`,
        label: `路由${n} username`,
        component: 'Input',
        placeholder: '留空则自动生成 / 不校验'
      },
      {
        field: `route${n}_komari_password`,
        label: `路由${n} password`,
        component: 'Input',
        placeholder: '留空则自动生成 / 不校验'
      },
      {
        field: `route${n}_targets_groups`,
        label: `路由${n} 通知群`,
        component: 'Select',
        options: groupOptions,
        componentProps: { ...selectMultiCreatable, placeholder: '请选择群（可输入群号回车添加）', options: groupOptions }
      },
      {
        field: `route${n}_targets_users`,
        label: `路由${n} 私聊用户`,
        component: 'Select',
        options: userOptions,
        componentProps: { ...selectMultiCreatable, placeholder: '请选择好友（可输入QQ号回车添加）', options: userOptions }
      },
      {
        field: `route${n}_message_prefix`,
        label: `路由${n} 前缀`,
        component: 'Input',
        placeholder: '[Komari]'
      },
      {
        field: `route${n}_message_template`,
        label: `路由${n} 模板`,
        component: 'Input',
        componentProps: { type: 'textarea', autosize: { minRows: 2, maxRows: 6 } },
        placeholder: '{prefix} {title}\\n{message}'
      }
    )
  }

  return {
    pluginInfo: {
      name: 'komari-report-to-yunzai',
      title: 'Komari Webhook 转发',
      author: 'Trae',
      authorLink: '',
      link: '',
      isV3: true,
      isV2: false,
      description: '接收 Komari Webhook 并转发到QQ群/私聊'
    },
    configInfo: {
      schemas: [
        {
          field: 'enable',
          label: '启用插件',
          component: 'Switch'
        },
        {
          field: 'listenHost',
          label: '监听地址',
          component: 'Select',
          options: listenHostOptions,
          componentProps: { ...selectFilterable, allowCreate: true, defaultFirstOption: true, placeholder: '请选择或输入', options: listenHostOptions }
        },
        {
          field: 'listenPort',
          label: '监听端口',
          component: 'InputNumber',
          placeholder: 25888
        },
        ...routeSchemas
      ],
      getConfigData() {
        const c = getCfg()
        const routes = Array.isArray(c.routes) ? c.routes : []
        const data = {
          enable: c.enable,
          listenHost: c.listenHost,
          listenPort: c.listenPort
        }
        for (let i = 0; i < MAX_ROUTES; i += 1) {
          const n = i + 1
          const r = routes[i] || {}
          data[`route${n}_enable`] = Boolean(r.enable)
          data[`route${n}_name`] = r.name || r.id || `route${n}`
          data[`route${n}_path`] = r.path || `/komari/webhook${n === 1 ? '' : n}`
          data[`route${n}_secret`] = r.secret || ''
          data[`route${n}_komari_url`] = r.komari?.url || ''
          data[`route${n}_komari_method`] = r.komari?.method || 'POST'
          data[`route${n}_komari_content_type`] = r.komari?.content_type || 'application/json'
          data[`route${n}_komari_headers`] = r.komari?.headers || '{}'
          data[`route${n}_komari_body`] = r.komari?.body || '{"title":"{{title}}","message":"{{message}}"}'
          data[`route${n}_komari_username`] = r.komari?.username || ''
          data[`route${n}_komari_password`] = r.komari?.password || ''
          data[`route${n}_targets_groups`] = r.targets?.groups || []
          data[`route${n}_targets_users`] = r.targets?.users || []
          data[`route${n}_message_prefix`] = r.message?.prefix || '[Komari]'
          data[`route${n}_message_template`] = r.message?.template || '{prefix} {title}\n{message}'
        }
        return data
      },
      async setConfigData(data) {
        const routes = []
        for (let i = 0; i < MAX_ROUTES; i += 1) {
          const n = i + 1
          const pathValue = String(data?.[`route${n}_path`] ?? '').trim()
          const groups = normalizeTargetsFromGuobaInput(data?.[`route${n}_targets_groups`])
          const users = normalizeTargetsFromGuobaInput(data?.[`route${n}_targets_users`])
          const url = String(data?.[`route${n}_komari_url`] ?? '').trim()
          const enabled = Boolean(data?.[`route${n}_enable`])
          const hasAny = pathValue || url || groups.length || users.length
          if (!hasAny && n !== 1) continue
          routes.push({
            id: `route${n}`,
            name: data?.[`route${n}_name`],
            enable: enabled,
            path: pathValue || `/komari/webhook${n === 1 ? '' : n}`,
            secret: data?.[`route${n}_secret`],
            komari: {
              url,
              method: data?.[`route${n}_komari_method`],
              content_type: data?.[`route${n}_komari_content_type`],
              headers: data?.[`route${n}_komari_headers`],
              body: data?.[`route${n}_komari_body`],
              username: data?.[`route${n}_komari_username`],
              password: data?.[`route${n}_komari_password`]
            },
            targets: {
              groups,
              users
            },
            message: {
              prefix: data?.[`route${n}_message_prefix`],
              template: data?.[`route${n}_message_template`]
            }
          })
        }

        const next = {
          enable: Boolean(data.enable),
          listenHost: data.listenHost,
          listenPort: data.listenPort,
          routes
        }
        updateConfig(next)
        await server.refresh()
        return true
      }
    }
  }
}

export default supportGuoba

