import { ensureConfig, normalizeConfig, normalizeTargets, updateConfig } from './utils/config.js'
import { ensureKomariWebhookServer } from './utils/server.js'

const server = ensureKomariWebhookServer()

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

function isNumericId(value) {
  return /^\d+$/.test(String(value ?? '').trim())
}

function isMeaningfulName(value) {
  const s = String(value ?? '').trim()
  if (!s) return false
  return !/stdin|标准输入/i.test(s)
}

function getGroupOptionsFromBots(bots) {
  const options = []
  for (const bot of bots) {
    const gl = bot?.gl
    if (gl && typeof gl.forEach === 'function') {
      gl.forEach((info, id) => {
        const gid = String(id ?? '').trim()
        if (!isNumericId(gid)) return
        const name = info?.group_name ?? info?.groupName ?? info?.name ?? ''
        options.push({ label: isMeaningfulName(name) ? `${name} (${gid})` : gid, value: gid })
      })
      continue
    }
    if (gl && typeof gl === 'object') {
      for (const [id, info] of Object.entries(gl)) {
        const gid = String(id ?? '').trim()
        if (!isNumericId(gid)) continue
        const name = info?.group_name ?? info?.groupName ?? info?.name ?? ''
        options.push({ label: isMeaningfulName(name) ? `${name} (${gid})` : gid, value: gid })
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
        if (!isNumericId(uid)) return
        const name = info?.remark ?? info?.nickname ?? info?.nick ?? info?.name ?? ''
        options.push({ label: isMeaningfulName(name) ? `${name} (${uid})` : uid, value: uid })
      })
      continue
    }
    if (fl && typeof fl === 'object') {
      for (const [id, info] of Object.entries(fl)) {
        const uid = String(id ?? '').trim()
        if (!isNumericId(uid)) continue
        const name = info?.remark ?? info?.nickname ?? info?.nick ?? info?.name ?? ''
        options.push({ label: isMeaningfulName(name) ? `${name} (${uid})` : uid, value: uid })
      }
    }
  }
  return uniqOptions(options).sort((a, b) => a.label.localeCompare(b.label, 'zh-Hans-CN'))
}

function parseRoutesJson(input) {
  const raw = String(input ?? '').trim()
  if (!raw) return null
  const parsed = JSON.parse(raw)
  if (!Array.isArray(parsed)) throw new Error('routes_json_not_array')
  return parsed
}

export function supportGuoba() {
  const getCfg = () => normalizeConfig(ensureConfig())
  const cfg = getCfg()
  const bots = resolveBots()
  const routes = Array.isArray(cfg.routes) ? cfg.routes : []
  const groupOptions = ensureOptionValues(getGroupOptionsFromBots(bots), routes.flatMap((r) => r?.targets?.groups ?? []))
  const userOptions = ensureOptionValues(getFriendOptionsFromBots(bots), routes.flatMap((r) => r?.targets?.users ?? []))
  const selectFilterable = { filterable: true, clearable: true, showSearch: true }
  const selectCreatable = { ...selectFilterable, allowCreate: true, defaultFirstOption: true, tag: true, mode: 'tags' }
  const selectMultiCreatable = { ...selectCreatable, multiple: true }

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

  return {
    pluginInfo: {
      name: 'komari-report-to-yunzai',
      title: 'Komari Webhook 转发',
      author: '@VupHub',
      authorLink: 'https://github.com/VupHub/',
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
        {
          field: 'routes_json',
          label: '路由列表（JSON）',
          component: 'Input',
          componentProps: { type: 'textarea', autosize: { minRows: 10, maxRows: 30 } },
          placeholder: '[]'
        },
        {
          field: 'route_action',
          label: '路由操作',
          component: 'Select',
          options: [
            { label: '无', value: 'none' },
            { label: '新增', value: 'add' },
            { label: '删除', value: 'remove' }
          ],
          componentProps: { ...selectFilterable, placeholder: '请选择', options: [{ label: '无', value: 'none' }, { label: '新增', value: 'add' }, { label: '删除', value: 'remove' }] }
        },
        {
          field: 'route_remove_id',
          label: '删除路由 id',
          component: 'Input',
          placeholder: '例如：route1'
        },
        {
          field: 'route_add_id',
          label: '新增路由 id',
          component: 'Input',
          placeholder: '留空则自动生成'
        },
        {
          field: 'route_add_name',
          label: '新增路由 名称',
          component: 'Input',
          placeholder: '例如：告警路由'
        },
        {
          field: 'route_add_enable',
          label: '新增路由 启用',
          component: 'Switch'
        },
        {
          field: 'route_add_path',
          label: '新增路由 Path',
          component: 'Select',
          options: [{ label: '/komari/webhook', value: '/komari/webhook' }],
          componentProps: { ...selectCreatable, placeholder: '请选择或输入', options: [{ label: '/komari/webhook', value: '/komari/webhook' }] }
        },
        {
          field: 'route_add_komari_url',
          label: '新增路由 url',
          component: 'Input',
          placeholder: '选填：仅用于展示/记录，不参与转发'
        },
        {
          field: 'route_add_komari_method',
          label: '新增路由 method',
          component: 'Select',
          options: methodOptions,
          componentProps: { ...selectFilterable, placeholder: '请选择', options: methodOptions }
        },
        {
          field: 'route_add_komari_content_type',
          label: '新增路由 content_type',
          component: 'Select',
          options: contentTypeOptions,
          componentProps: { ...selectCreatable, placeholder: '请选择或输入', options: contentTypeOptions }
        },
        {
          field: 'route_add_komari_headers',
          label: '新增路由 headers(JSON)',
          component: 'Input',
          componentProps: { type: 'textarea', autosize: { minRows: 2, maxRows: 6 } },
          placeholder: ''
        },
        {
          field: 'route_add_komari_body',
          label: '新增路由 body',
          component: 'Input',
          componentProps: { type: 'textarea', autosize: { minRows: 2, maxRows: 8 } },
          placeholder: ''
        },
        {
          field: 'route_add_komari_username',
          label: '新增路由 username',
          component: 'Input',
          placeholder: '留空则自动生成 / 不校验'
        },
        {
          field: 'route_add_komari_password',
          label: '新增路由 password',
          component: 'Input',
          placeholder: '留空则自动生成 / 不校验'
        },
        {
          field: 'route_add_targets_groups',
          label: '新增路由 通知群',
          component: 'Select',
          options: groupOptions,
          componentProps: { ...selectMultiCreatable, placeholder: '请选择群（可输入群号回车添加）', options: groupOptions }
        },
        {
          field: 'route_add_targets_users',
          label: '新增路由 私聊用户',
          component: 'Select',
          options: userOptions,
          componentProps: { ...selectMultiCreatable, placeholder: '请选择好友（可输入QQ号回车添加）', options: userOptions }
        },
        {
          field: 'route_add_message_prefix',
          label: '新增路由 前缀',
          component: 'Input',
          placeholder: ''
        },
        {
          field: 'route_add_message_template',
          label: '新增路由 模板',
          component: 'Input',
          componentProps: { type: 'textarea', autosize: { minRows: 2, maxRows: 6 } },
          placeholder: ''
        }
      ],
      getConfigData() {
        const c = getCfg()
        return {
          enable: c.enable,
          listenHost: c.listenHost,
          listenPort: c.listenPort,
          routes_json: JSON.stringify(Array.isArray(c.routes) ? c.routes : [], null, 2),
          route_action: 'none',
          route_remove_id: '',
          route_add_id: '',
          route_add_name: '',
          route_add_enable: true,
          route_add_path: '',
          route_add_komari_url: '',
          route_add_komari_method: '',
          route_add_komari_content_type: '',
          route_add_komari_headers: '',
          route_add_komari_body: '',
          route_add_komari_username: '',
          route_add_komari_password: '',
          route_add_targets_groups: [],
          route_add_targets_users: [],
          route_add_message_prefix: '',
          route_add_message_template: ''
        }
      },
      async setConfigData(data) {
        const current = getCfg()
        let routes = Array.isArray(current.routes) ? current.routes : []
        try {
          const parsed = parseRoutesJson(data?.routes_json)
          if (parsed) routes = parsed
        } catch {
          return false
        }

        const action = String(data?.route_action ?? 'none')
        if (action === 'remove') {
          const removeId = String(data?.route_remove_id ?? '').trim()
          if (removeId) {
            routes = routes.filter((r) => String(r?.id ?? '').trim() !== removeId)
          }
        } else if (action === 'add') {
          const id = String(data?.route_add_id ?? '').trim() || `route_${Date.now()}`
          const name = String(data?.route_add_name ?? '').trim()
          const pathValue = String(data?.route_add_path ?? '').trim()
          const groups = normalizeTargetsFromGuobaInput(data?.route_add_targets_groups)
          const users = normalizeTargetsFromGuobaInput(data?.route_add_targets_users)
          const url = String(data?.route_add_komari_url ?? '').trim()
          routes = routes.concat([
            {
              id,
              name: name || id,
              enable: Boolean(data?.route_add_enable ?? true),
              path: pathValue || '/komari/webhook',
              komari: {
                url,
                method: data?.route_add_komari_method,
                content_type: data?.route_add_komari_content_type,
                headers: data?.route_add_komari_headers,
                body: data?.route_add_komari_body,
                username: data?.route_add_komari_username,
                password: data?.route_add_komari_password
              },
              targets: {
                groups,
                users
              },
              message: {
                prefix: data?.route_add_message_prefix,
                template: data?.route_add_message_template
              }
            }
          ])
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

