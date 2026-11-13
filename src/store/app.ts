import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { DEMO_USER, seedLibraries, DEFAULT_MODEL, MODEL_PROFILES, type User, type Agent, type Council, type Run, type Workflow, type Library, type Doc, type AuditEvent, type CustomTool, type Notification, type SpendEntry, type Role, type Thread } from '@/lib/data'
import { usingProxy, PROXY_KEY, type ORModel } from '@/lib/openrouter'
import { hashPassword, verifyPassword, isHashed, SESSION_HOURS } from '@/lib/auth'

export type Theme = 'light' | 'dark'
export type ChatMsg = { id: string; role: 'user' | 'assistant'; content: string; tools?: { id?: string; name: string; args: string; result?: string; runId?: string }[]; error?: boolean; at: number; /** what to show instead of content (content carries attached file text) */ display?: string; files?: string[] }

const now = () => new Date().toISOString().slice(0, 16).replace('T', ' ')
const today = () => new Date().toISOString().slice(0, 10)
const uid = () => Math.random().toString(36).slice(2, 8)
const ENV_KEY = usingProxy ? PROXY_KEY : (((import.meta as any).env?.VITE_OPENROUTER_API_KEY as string | undefined) ?? '')

type State = {
  currentUserId: string | null
  users: User[]
  theme: Theme
  dir: 'ltr' | 'rtl'
  apiKey: string
  defaultModel: string
  profiles: { id: string; model: string }[]
  models: ORModel[]
  agents: Agent[]
  councils: Council[]
  workflows: Workflow[]
  runs: Run[]
  libraries: Library[]
  customTools: CustomTool[]
  notifications: Notification[]
  spend: SpendEntry[]
  audit: AuditEvent[]
  chats: Record<string, ChatMsg[]>
  threads: Thread[]
  schedulesPaused: boolean
  caps: { user: number; org: number }
  /** Seasonal touches (holiday badge and greetings), the themed cursor, and a holiday to preview */
  seasonal: boolean
  themedCursor: boolean
  holidayPreview: string | null
  flash: { id: number; text: string; tone?: 'ok' | 'danger' } | null

  login: (email: string, password: string) => Promise<string | null>
  logout: () => void
  addUser: (u: { name: string; email: string; password: string; role: Role; title: string }) => Promise<string | null>
  setPassword: (id: string, password: string) => Promise<void>
  /** Last activity time of the signed-in session; sessions expire after SESSION_HOURS. */
  sessionAt: number
  touchSession: () => void
  updateUser: (id: string, p: Partial<User>) => void
  removeUser: (id: string) => void
  setTheme: (t: Theme) => void
  toggleTheme: () => void
  setDir: (d: 'ltr' | 'rtl') => void
  setApiKey: (k: string) => void
  setDefaultModel: (m: string) => void
  setProfileModel: (id: string, model: string) => void
  setModels: (m: ORModel[]) => void
  upsertAgent: (a: Agent, note?: string) => void
  rollbackAgent: (id: string, version: number) => void
  touchAgentTested: (id: string) => void
  /** Store test cases and results without a new version. */
  setAgentTests: (id: string, tests: Agent['tests']) => void
  deleteAgent: (id: string) => void
  upsertCouncil: (c: Council) => void
  deleteCouncil: (id: string) => void
  upsertWorkflow: (w: Workflow) => void
  deleteWorkflow: (id: string) => void
  markWorkflowRan: (id: string) => void
  /** Update a workflow without a version bump or audit entry (trigger bookkeeping). */
  patchWorkflow: (id: string, p: Partial<Workflow>) => void
  upsertThread: (t: Thread) => void
  removeThread: (id: string) => void
  addRun: (r: Run) => string
  updateRun: (id: string, p: Partial<Run>) => void
  decideRun: (id: string, decision: 'approved' | 'rejected') => void
  addDoc: (libraryId: string, d: Omit<Doc, 'id' | 'updatedAt' | 'addedBy'>) => void
  removeDoc: (libraryId: string, docId: string) => void
  addLibrary: (name: string, desc: string) => void
  removeLibrary: (id: string) => void
  upsertCustomTool: (t: CustomTool) => void
  removeCustomTool: (id: string) => void
  notify: (n: Omit<Notification, 'id' | 'at' | 'read'>) => void
  markRead: (id?: string) => void
  recordSpend: (cost: number) => void
  canSpend: () => boolean
  spentToday: (userId?: string) => number
  logAudit: (action: string, target: string, detail?: string) => void
  setChat: (key: string, msgs: ChatMsg[]) => void
  clearChat: (key: string) => void
  setSchedulesPaused: (v: boolean) => void
  setCap: (k: 'user' | 'org', v: number) => void
  importWorkspace: (json: string) => string | null
  setSeasonal: (v: boolean) => void
  setThemedCursor: (v: boolean) => void
  setHolidayPreview: (id: string | null) => void
  /** A short message at the bottom of the screen, instead of a browser alert. */
  flashMsg: (text: string, tone?: 'ok' | 'danger') => void
}

export const useApp = create<State>()(
  persist(
    (set, get) => {
      const actor = () => get().users.find((u) => u.id === get().currentUserId)?.name ?? 'System'
      const log = (action: string, target: string, detail?: string) => set({ audit: [{ id: `a${Date.now()}${uid()}`, at: now(), actor: actor(), action, target, detail }, ...get().audit].slice(0, 500) })
      return {
        currentUserId: null,
        sessionAt: 0,
        users: [DEMO_USER],
        theme: 'light',
        dir: 'ltr',
        apiKey: ENV_KEY,
        defaultModel: DEFAULT_MODEL,
        profiles: MODEL_PROFILES.map((p) => ({ id: p.id, model: p.model })),
        models: [],
        agents: [],
        councils: [],
        workflows: [],
        runs: [],
        libraries: seedLibraries,
        customTools: [],
        notifications: [],
        spend: [],
        audit: [],
        chats: {},
        threads: [],
        schedulesPaused: false,
        caps: { user: 5, org: 100 },
        seasonal: true,
        themedCursor: true,
        holidayPreview: null,
        flash: null,

        login: async (email, password) => {
          const u = get().users.find((x) => x.email.toLowerCase() === email.trim().toLowerCase())
          if (!u) return 'No account with that email.'
          if (u.status === 'disabled') return 'This account is disabled.'
          if (!(await verifyPassword(password, u.password))) return 'Incorrect password.'
          const stored = isHashed(u.password) ? u.password : await hashPassword(password)
          set({ currentUserId: u.id, sessionAt: Date.now(), users: get().users.map((x) => (x.id === u.id ? { ...x, password: stored, lastActive: now() } : x)) }); log('Signed in', u.email); return null
        },
        setPassword: async (id, password) => { const h = await hashPassword(password); set({ users: get().users.map((u) => (u.id === id ? { ...u, password: h } : u)) }); log('Updated user', get().users.find((u) => u.id === id)?.email ?? id, 'password') },
        touchSession: () => { const t = Date.now(); if (get().currentUserId && t - get().sessionAt > 60_000) set({ sessionAt: t }) },
        logout: () => { log('Signed out', actor()); set({ currentUserId: null }) },
        addUser: async (u) => {
          if (get().users.some((x) => x.email.toLowerCase() === u.email.toLowerCase())) return 'A user with that email already exists.'
          const id = `u-${uid()}`
          const password = await hashPassword(u.password)
          set({ users: [...get().users, { ...u, password, id, initials: u.name.split(' ').map((s) => s[0]).join('').slice(0, 2).toUpperCase(), status: 'active', lastActive: 'Never', createdAt: today() }] }); log('Added user', u.email); return null
        },
        updateUser: (id, p) => { set({ users: get().users.map((u) => (u.id === id ? { ...u, ...p } : u)) }); log('Updated user', get().users.find((u) => u.id === id)?.email ?? id, Object.keys(p).filter((k) => k !== 'password').join(', ') || 'password') },
        removeUser: (id) => { log('Removed user', get().users.find((u) => u.id === id)?.email ?? id); set({ users: get().users.filter((u) => u.id !== id) }) },

        setTheme: (theme) => set({ theme }),
        toggleTheme: () => set({ theme: get().theme === 'light' ? 'dark' : 'light' }),
        setDir: (dir) => set({ dir }),
        setApiKey: (apiKey) => { set({ apiKey }); log(apiKey ? 'Updated model access key' : 'Removed model access key', 'Model access') },
        setDefaultModel: (defaultModel) => { set({ defaultModel }); log('Changed default model', defaultModel) },
        setProfileModel: (id, model) => { set({ profiles: get().profiles.map((p) => (p.id === id ? { ...p, model } : p)) }); log('Changed model profile', id, model) },
        setModels: (models) => set({ models: [...models].sort((a, b) => a.name.localeCompare(b.name)) }),

        upsertAgent: (a, note) => {
          const prev = get().agents.find((x) => x.id === a.id)
          const history = prev && prev.version !== a.version ? [{ version: prev.version, at: now(), by: actor(), data: (({ history, ...rest }) => rest)(prev) }, ...(prev.history ?? [])].slice(0, 20) : prev?.history
          const next = { ...a, history }
          set({ agents: prev ? get().agents.map((x) => (x.id === a.id ? next : x)) : [next, ...get().agents] }); log(prev ? (note ?? 'Saved agent') : 'Created agent', `${a.name} v${a.version}`)
        },
        touchAgentTested: (id) => set({ agents: get().agents.map((a) => (a.id === id && !a.testedAt ? { ...a, testedAt: now() } : a)) }),
        setAgentTests: (id, tests) => set({ agents: get().agents.map((a) => (a.id === id ? { ...a, tests } : a)) }),
        rollbackAgent: (id, version) => {
          const a = get().agents.find((x) => x.id === id); const snap = a?.history?.find((h) => h.version === version); if (!a || !snap) return
          get().upsertAgent({ ...snap.data, id, version: a.version + 1, updatedAt: today(), history: a.history }, `Rolled back agent to v${version}`)
        },
        deleteAgent: (id) => { log('Deleted agent', get().agents.find((a) => a.id === id)?.name ?? id); set({ agents: get().agents.filter((a) => a.id !== id), councils: get().councils.map((c) => (c.members.includes(id) ? { ...c, members: c.members.filter((m) => m !== id) } : c)) }) },
        upsertCouncil: (c) => { const exists = get().councils.some((x) => x.id === c.id); set({ councils: exists ? get().councils.map((x) => (x.id === c.id ? c : x)) : [c, ...get().councils] }); log(exists ? 'Saved council' : 'Created council', c.name) },
        deleteCouncil: (id) => { log('Deleted council', get().councils.find((c) => c.id === id)?.name ?? id); set({ councils: get().councils.filter((c) => c.id !== id) }) },
        upsertWorkflow: (w) => { const exists = get().workflows.some((x) => x.id === w.id); set({ workflows: exists ? get().workflows.map((x) => (x.id === w.id ? w : x)) : [w, ...get().workflows] }); log(exists ? 'Saved workflow' : 'Created workflow', `${w.name} v${w.version}`) },
        deleteWorkflow: (id) => { log('Deleted workflow', get().workflows.find((w) => w.id === id)?.name ?? id); set({ workflows: get().workflows.filter((w) => w.id !== id) }) },
        markWorkflowRan: (id) => set({ workflows: get().workflows.map((w) => (w.id === id ? { ...w, lastRunAt: Date.now() } : w)) }),
        patchWorkflow: (id, p) => set({ workflows: get().workflows.map((w) => (w.id === id ? { ...w, ...p } : w)) }),
        upsertThread: (t) => set({ threads: [t, ...get().threads.filter((x) => x.id !== t.id)] }),
        removeThread: (id) => { const c = { ...get().chats }; delete c[`thread:${id}`]; set({ threads: get().threads.filter((t) => t.id !== id), chats: c }) },
        addRun: (r) => { const max = get().runs.reduce((m, x) => Math.max(m, parseInt(x.id.replace(/\D/g, ''), 10) || 0), 1000); const id = `R-${max + 1}`; set({ runs: [{ ...r, id }, ...get().runs].slice(0, 300) }); return id },
        updateRun: (id, p) => set({ runs: get().runs.map((r) => (r.id === id ? { ...r, ...p } : r)) }),
        decideRun: (id, decision) => {
          set({ runs: get().runs.map((r) => (r.id === id ? { ...r, status: decision, decidedBy: actor(), duration: r.duration === '—' ? '0s' : r.duration, steps: r.steps.map((s) => (s.status === 'waiting' ? { ...s, status: decision === 'approved' ? 'ok' : 'skipped', output: `${decision === 'approved' ? 'Approved' : 'Rejected'} by ${actor()}` } : s)), ...(decision === 'rejected' || !r.cursor ? { cursor: null, finished: now() } : {}) } : r)) })
          log(decision === 'approved' ? 'Approved' : 'Rejected', id)
        },
        addDoc: (libraryId, d) => { set({ libraries: get().libraries.map((l) => (l.id === libraryId ? { ...l, docs: [{ ...d, id: `d${Date.now()}${uid()}`, updatedAt: today(), addedBy: actor() }, ...l.docs] } : l)) }); log('Added document', d.title) },
        removeDoc: (libraryId, docId) => set({ libraries: get().libraries.map((l) => (l.id === libraryId ? { ...l, docs: l.docs.filter((d) => d.id !== docId) } : l)) }),
        addLibrary: (name, desc) => { set({ libraries: [...get().libraries, { id: `lib-${uid()}`, name, desc, docs: [] }] }); log('Created library', name) },
        removeLibrary: (id) => { log('Deleted library', get().libraries.find((l) => l.id === id)?.name ?? id); set({ libraries: get().libraries.filter((l) => l.id !== id) }) },
        upsertCustomTool: (t) => {
          const prev = get().customTools.find((x) => x.id === t.id)
          const oldName = prev && prev.name !== t.name ? prev.name : undefined
          set({
            customTools: prev ? get().customTools.map((x) => (x.id === t.id ? t : x)) : [...get().customTools, t],
            ...(oldName ? {
              agents: get().agents.map((a) => (a.tools.includes(oldName) ? { ...a, tools: a.tools.map((n) => (n === oldName ? t.name : n)) } : a)),
              workflows: get().workflows.map((w) => (w.nodes.some((n) => n.data.brick === 'tool' && n.data.tool === oldName) ? { ...w, nodes: w.nodes.map((n) => (n.data.brick === 'tool' && n.data.tool === oldName ? { ...n, data: { ...n.data, tool: t.name } } : n)) } : w)),
            } : {}),
          })
          log(prev ? 'Saved tool' : 'Created tool', t.name)
        },
        removeCustomTool: (id) => { const name = get().customTools.find((t) => t.id === id)?.name; log('Deleted tool', name ?? id); set({ customTools: get().customTools.filter((t) => t.id !== id), agents: get().agents.map((a) => ({ ...a, tools: a.tools.filter((n) => n !== name) })) }) },
        notify: (n) => set({ notifications: [{ ...n, id: `n${Date.now()}${uid()}`, at: now(), read: false }, ...get().notifications].slice(0, 100) }),
        markRead: (id) => set({ notifications: get().notifications.map((n) => (!id || n.id === id ? { ...n, read: true } : n)) }),
        recordSpend: (cost) => { if (!cost) return; const userId = get().currentUserId ?? 'system'; const day = today(); const e = get().spend.find((s) => s.userId === userId && s.day === day); set({ spend: e ? get().spend.map((s) => (s === e ? { ...s, cost: s.cost + cost } : s)) : [...get().spend, { userId, day, cost }].slice(-500) }) },
        spentToday: (userId) => get().spend.filter((s) => s.day === today() && (userId ? s.userId === userId : true)).reduce((a, s) => a + s.cost, 0),
        canSpend: () => { const s = get(); return s.spentToday(s.currentUserId ?? 'system') < s.caps.user && s.spentToday() < s.caps.org },
        logAudit: (action, target, detail) => log(action, target, detail),
        setChat: (key, msgs) => set({ chats: { ...get().chats, [key]: msgs } }),
        clearChat: (key) => { const c = { ...get().chats }; delete c[key]; set({ chats: c }) },
        setSchedulesPaused: (v) => { set({ schedulesPaused: v }); log(v ? 'Paused all schedules' : 'Resumed schedules', 'Workflows') },
        setCap: (k, v) => { set({ caps: { ...get().caps, [k]: v } }); log('Changed spend cap', k, `$${v}`) },
        setSeasonal: (seasonal) => set({ seasonal }),
        setThemedCursor: (themedCursor) => set({ themedCursor }),
        setHolidayPreview: (holidayPreview) => set({ holidayPreview }),
        flashMsg: (text, tone) => { const id = Date.now(); set({ flash: { id, text, tone } }); setTimeout(() => { if (get().flash?.id === id) set({ flash: null }) }, 3200) },
        importWorkspace: (json) => {
          try {
            const d = JSON.parse(json)
            if (!d || typeof d !== 'object') return 'Not a workspace file.'
            const pick = (k: string) => (Array.isArray(d[k]) ? d[k] : undefined)
            const importedLibs = pick('libraries') as Library[] | undefined
            const libraries = importedLibs
              ? [...importedLibs, ...seedLibraries.filter((sl) => !importedLibs.some((il) => il.id === sl.id))]
              : get().libraries
            set({ agents: pick('agents') ?? get().agents, councils: pick('councils') ?? get().councils, workflows: pick('workflows') ?? get().workflows, libraries, customTools: pick('customTools') ?? get().customTools })
            log('Imported workspace', `${(pick('agents') ?? []).length} agents, ${(pick('workflows') ?? []).length} workflows`); return null
          } catch { return 'Could not parse the file.' }
        },
      }
    },
    {
      name: 'cocreate-v3', version: 3,
      merge: (persisted, current) => { const m = { ...current, ...(persisted as object) } as State; if ((!m.apiKey || usingProxy) && ENV_KEY) m.apiKey = ENV_KEY; if (m.currentUserId && m.sessionAt && Date.now() - m.sessionAt > SESSION_HOURS * 3600_000) m.currentUserId = null; if (!m.users?.length) m.users = [DEMO_USER]; m.users = m.users.map((u) => (u.id === 'demo' && (u.name === 'Demo User' || u.name === 'Vision') ? { ...u, name: DEMO_USER.name, initials: DEMO_USER.initials } : u)); m.flash = null; return m },
      partialize: (s) => Object.fromEntries(Object.entries(s).filter(([k, v]) => !['models', 'flash'].includes(k) && typeof v !== 'function')) as any,
    },
  ),
)

export const useUser = (): User | undefined => { const id = useApp((s) => s.currentUserId); return useApp((s) => s.users.find((u) => u.id === id)) }
export const can = (u: User | undefined, action: 'approve' | 'security' | 'admin' | 'build') => {
  if (!u) return false
  if (u.role === 'admin') return true
  if (action === 'approve') return u.role === 'approver' || u.role === 'security'
  if (action === 'security') return u.role === 'security'
  if (action === 'admin') return false
  return u.role === 'builder' || u.role === 'approver' || u.role === 'security'
}
export const profileModels = (s: { profiles: { id: string; model: string }[]; defaultModel: string }) => ({
  fast: s.profiles.find((p) => p.id === 'fast')?.model ?? 'anthropic/claude-haiku-5.5',
  balanced: s.defaultModel,
  reasoning: s.profiles.find((p) => p.id === 'reasoning')?.model ?? s.defaultModel,
})
