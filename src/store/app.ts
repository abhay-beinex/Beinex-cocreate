import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  seedUsers, seedAgents, seedCouncils, seedSuggestions, seedWatchers, seedRuns, seedWorkflows, seedLibraries, seedAudit, DEFAULT_MODEL, MODEL_PROFILES,
  type User, type Agent, type Council, type Suggestion, type Watcher, type Run, type Workflow, type Library, type Doc, type AuditEvent,
} from '@/lib/data'
import type { ORModel } from '@/lib/openrouter'

export type Theme = 'light' | 'dark'
export type ChatMsg = { id: string; role: 'user' | 'assistant'; content: string; tools?: { name: string; args: string; result?: string }[]; error?: boolean; at: number }

const now = () => new Date().toISOString().slice(0, 16).replace('T', ' ')
const uid = () => Math.random().toString(36).slice(2, 8)

type State = {
  // auth & users
  currentUserId: string | null
  users: User[]
  // workspace
  theme: Theme
  dir: 'ltr' | 'rtl'
  apiKey: string
  defaultModel: string
  profiles: { id: string; model: string }[]
  models: ORModel[]
  modelsFetchedAt: number
  // content
  agents: Agent[]
  councils: Council[]
  workflows: Workflow[]
  runs: Run[]
  libraries: Library[]
  suggestions: Suggestion[]
  watchers: Watcher[]
  audit: AuditEvent[]
  chats: Record<string, ChatMsg[]>
  // governance
  emergencyPause: boolean
  dailyCap: 3 | 5 | 10 | 0
  quietHours: boolean
  channels: { teams: boolean; outlook: boolean; digest: boolean }
  spend: { user: number; group: number; org: number }

  login: (userId: string) => void
  logout: () => void
  addUser: (u: Omit<User, 'id' | 'initials' | 'lastActive' | 'status'>) => void
  updateUser: (id: string, p: Partial<User>) => void
  removeUser: (id: string) => void

  setTheme: (t: Theme) => void
  toggleTheme: () => void
  setDir: (d: 'ltr' | 'rtl') => void
  setApiKey: (k: string) => void
  setDefaultModel: (m: string) => void
  setProfileModel: (id: string, model: string) => void
  setModels: (m: ORModel[]) => void

  upsertAgent: (a: Agent) => void
  deleteAgent: (id: string) => void
  upsertCouncil: (c: Council) => void
  deleteCouncil: (id: string) => void
  upsertWorkflow: (w: Workflow) => void
  deleteWorkflow: (id: string) => void
  addRun: (r: Run) => void
  updateRun: (id: string, p: Partial<Run>) => void
  decideRun: (id: string, decision: 'approved' | 'rejected') => void
  addDoc: (libraryId: string, d: Omit<Doc, 'id' | 'updatedAt' | 'addedBy'>) => void
  removeDoc: (libraryId: string, docId: string) => void
  addLibrary: (name: string, desc: string) => void
  setSuggestionStatus: (id: string, s: Suggestion['status']) => void
  toggleWatcher: (id: string) => void
  logAudit: (action: string, target: string, detail?: string) => void
  setChat: (key: string, msgs: ChatMsg[]) => void
  clearChat: (key: string) => void

  setEmergencyPause: (v: boolean) => void
  setDailyCap: (v: 3 | 5 | 10 | 0) => void
  setQuietHours: (v: boolean) => void
  setChannel: (k: 'teams' | 'outlook' | 'digest', v: boolean) => void
  setSpend: (k: 'user' | 'group' | 'org', v: number) => void
}

export const useApp = create<State>()(
  persist(
    (set, get) => {
      const actor = () => get().users.find((u) => u.id === get().currentUserId)?.name ?? 'System'
      const log = (action: string, target: string, detail?: string) => set({ audit: [{ id: `a${Date.now()}${uid()}`, at: now(), actor: actor(), action, target, detail }, ...get().audit] })
      return {
        currentUserId: null,
        users: seedUsers,
        theme: 'light',
        dir: 'ltr',
        apiKey: '',
        defaultModel: DEFAULT_MODEL,
        profiles: MODEL_PROFILES.map((p) => ({ id: p.id, model: p.model })),
        models: [],
        modelsFetchedAt: 0,
        agents: seedAgents,
        councils: seedCouncils,
        workflows: seedWorkflows,
        runs: seedRuns,
        libraries: seedLibraries,
        suggestions: seedSuggestions,
        watchers: seedWatchers,
        audit: seedAudit,
        chats: {},
        emergencyPause: false,
        dailyCap: 5,
        quietHours: true,
        channels: { teams: true, outlook: true, digest: false },
        spend: { user: 2, group: 40, org: 1500 },

        login: (currentUserId) => { set({ currentUserId, users: get().users.map((u) => (u.id === currentUserId ? { ...u, lastActive: 'Now' } : u)) }); log('Signed in', get().users.find((u) => u.id === currentUserId)?.email ?? currentUserId) },
        logout: () => { log('Signed out', actor()); set({ currentUserId: null }) },
        addUser: (u) => { const id = u.email.split('@')[0].replace(/\W+/g, '-'); set({ users: [...get().users, { ...u, id, initials: u.name.split(' ').map((s) => s[0]).join('').slice(0, 2).toUpperCase(), status: 'invited', lastActive: 'Never' }] }); log('Invited user', u.email) },
        updateUser: (id, p) => { set({ users: get().users.map((u) => (u.id === id ? { ...u, ...p } : u)) }); log('Updated user', get().users.find((u) => u.id === id)?.email ?? id, Object.keys(p).join(', ')) },
        removeUser: (id) => { log('Removed user', get().users.find((u) => u.id === id)?.email ?? id); set({ users: get().users.filter((u) => u.id !== id) }) },

        setTheme: (theme) => set({ theme }),
        toggleTheme: () => set({ theme: get().theme === 'light' ? 'dark' : 'light' }),
        setDir: (dir) => set({ dir }),
        setApiKey: (apiKey) => { set({ apiKey }); log(apiKey ? 'Connected OpenRouter key' : 'Removed OpenRouter key', 'OpenRouter') },
        setDefaultModel: (defaultModel) => { set({ defaultModel }); log('Changed default model', defaultModel) },
        setProfileModel: (id, model) => { set({ profiles: get().profiles.map((p) => (p.id === id ? { ...p, model } : p)) }); log('Changed model profile', id, model) },
        setModels: (models) => set({ models, modelsFetchedAt: Date.now() }),

        upsertAgent: (a) => { const exists = get().agents.some((x) => x.id === a.id); set({ agents: exists ? get().agents.map((x) => (x.id === a.id ? a : x)) : [a, ...get().agents] }); log(exists ? 'Saved agent' : 'Created agent', `${a.name} v${a.version}`) },
        deleteAgent: (id) => { log('Deleted agent', get().agents.find((a) => a.id === id)?.name ?? id); set({ agents: get().agents.filter((a) => a.id !== id) }) },
        upsertCouncil: (c) => { const exists = get().councils.some((x) => x.id === c.id); set({ councils: exists ? get().councils.map((x) => (x.id === c.id ? c : x)) : [c, ...get().councils] }); log(exists ? 'Saved council' : 'Created council', c.name) },
        deleteCouncil: (id) => { log('Deleted council', get().councils.find((c) => c.id === id)?.name ?? id); set({ councils: get().councils.filter((c) => c.id !== id) }) },
        upsertWorkflow: (w) => { const exists = get().workflows.some((x) => x.id === w.id); set({ workflows: exists ? get().workflows.map((x) => (x.id === w.id ? w : x)) : [w, ...get().workflows] }); log(exists ? 'Saved workflow' : 'Created workflow', `${w.name} v${w.version}`) },
        deleteWorkflow: (id) => { log('Deleted workflow', get().workflows.find((w) => w.id === id)?.name ?? id); set({ workflows: get().workflows.filter((w) => w.id !== id) }) },
        addRun: (r) => set({ runs: [r, ...get().runs] }),
        updateRun: (id, p) => set({ runs: get().runs.map((r) => (r.id === id ? { ...r, ...p } : r)) }),
        decideRun: (id, decision) => {
          set({ runs: get().runs.map((r) => (r.id === id ? { ...r, status: decision, decidedBy: actor(), steps: r.steps.map((s) => (s.status === 'waiting' ? { ...s, status: decision === 'approved' ? 'ok' : 'skipped', ms: s.ms || 1200 } : s)) } : r)), suggestions: get().suggestions.map((s) => (s.link?.includes(id) ? { ...s, status: 'history' } : s)) })
          log(decision === 'approved' ? 'Approved' : 'Rejected', id, decision === 'approved' ? 'Signed · sealed' : undefined)
        },
        addDoc: (libraryId, d) => { set({ libraries: get().libraries.map((l) => (l.id === libraryId ? { ...l, docs: [{ ...d, id: `d${Date.now()}`, updatedAt: now().slice(0, 10), addedBy: get().currentUserId ?? 'system' }, ...l.docs] } : l)) }); log('Added document', d.title) },
        removeDoc: (libraryId, docId) => set({ libraries: get().libraries.map((l) => (l.id === libraryId ? { ...l, docs: l.docs.filter((d) => d.id !== docId) } : l)) }),
        addLibrary: (name, desc) => { set({ libraries: [...get().libraries, { id: `lib-${uid()}`, name, desc, docs: [] }] }); log('Created library', name) },
        setSuggestionStatus: (id, status) => set({ suggestions: get().suggestions.map((s) => (s.id === id ? { ...s, status } : s)) }),
        toggleWatcher: (id) => { const w = get().watchers.find((x) => x.id === id); set({ watchers: get().watchers.map((x) => (x.id === id ? { ...x, status: x.status === 'active' ? 'paused' : 'active' } : x)) }); if (w) log(w.status === 'active' ? 'Paused watcher' : 'Resumed watcher', w.name) },
        logAudit: (action, target, detail) => log(action, target, detail),
        setChat: (key, msgs) => set({ chats: { ...get().chats, [key]: msgs } }),
        clearChat: (key) => { const c = { ...get().chats }; delete c[key]; set({ chats: c }) },

        setEmergencyPause: (v) => { set({ emergencyPause: v }); log(v ? 'Emergency pause ON' : 'Emergency pause OFF', 'All watchers') },
        setDailyCap: (dailyCap) => set({ dailyCap }),
        setQuietHours: (quietHours) => set({ quietHours }),
        setChannel: (k, v) => set({ channels: { ...get().channels, [k]: v } }),
        setSpend: (k, v) => set({ spend: { ...get().spend, [k]: v } }),
      }
    },
    { name: 'cocreate-v1', version: 1, partialize: (s) => Object.fromEntries(Object.entries(s).filter(([k]) => !['models', 'modelsFetchedAt'].includes(k) && typeof (s as any)[k] !== 'function')) as any },
  ),
)

export const useUser = (): User | undefined => {
  const id = useApp((s) => s.currentUserId)
  return useApp((s) => s.users.find((u) => u.id === id))
}
export const can = (u: User | undefined, action: 'approve' | 'security' | 'admin' | 'build') => {
  if (!u) return false
  if (u.role === 'admin') return true
  if (action === 'approve') return u.role === 'approver' || u.role === 'security'
  if (action === 'security') return u.role === 'security'
  if (action === 'admin') return false
  return u.role === 'builder' || u.role === 'approver'
}
