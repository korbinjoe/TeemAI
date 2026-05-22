import { lazy, Suspense } from 'react'
import { Routes, Route } from 'react-router-dom'
import MainLayout from './layouts/MainLayout'
import { ElectronNavigator } from './components/ElectronNavigator'

const WorkspaceLayout = lazy(() => import('./layouts/WorkspaceLayout'))

const ChatPage = lazy(() => import('./pages/ChatPage'))
const SettingsPage = lazy(() => import('./pages/SettingsPage'))
const ChatTabContainer = lazy(() => import('./components/chat/ChatTabContainer'))
const AgentsHubPage = lazy(() => import('./pages/AgentsHubPage'))
const AgentEditorPage = lazy(() => import('./pages/AgentEditorPage'))
const WorkspacesPage = lazy(() => import('./pages/WorkspacesPage'))
const SkillsPage = lazy(() => import('./pages/SkillsPage'))
const WorkspaceDetailPage = lazy(() => import('./pages/WorkspaceDetailPage'))
const ChatHistoryPage = lazy(() => import('./pages/ChatHistoryPage'))
const CronJobsPage = lazy(() => import('./pages/CronJobsPage'))
const AdminPage = lazy(() => import('./pages/AdminPage'))
const UpdateManagerPage = lazy(() => import('./pages/UpdateManagerPage'))
const MentionInputDemo = lazy(() => import('./pages/MentionInputDemo'))
const QueuedMessagesBarDemo = lazy(() => import('./pages/QueuedMessagesBarDemo'))
const AuthCallbackPage = lazy(() => import('./pages/AuthCallbackPage'))

const RouteFallback = () => (
  <div style={{
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'rgb(var(--text-muted))',
    fontSize: 13,
  }}
  >
    Loading...
  </div>
)

const App = () => (
  <Suspense fallback={<RouteFallback />}>
    <ElectronNavigator />
    <Routes>
      <Route path="/auth/callback" element={<AuthCallbackPage />} />
      <Route path="/demo/mention" element={<MentionInputDemo />} />
      <Route path="/demo/queue" element={<QueuedMessagesBarDemo />} />
      <Route path="/v2" element={<WorkspaceLayout />} />
      <Route path="/" element={<MainLayout />}>
        <Route index element={<ChatTabContainer />} />
        {/* Chats */}
        <Route path="chats" element={<ChatHistoryPage />} />
        {/* Workspaces */}
        <Route path="workspaces" element={<WorkspacesPage />} />
        <Route path="workspace/:workspaceId" element={<WorkspaceDetailPage />} />
        <Route path="workspace/:workspaceId/chat/:chatId?" element={<ChatPage />} />
        {/* Agent management */}
        <Route path="agents" element={<AgentsHubPage />} />
        <Route path="agents/:id/edit" element={<AgentEditorPage />} />
        <Route path="skills" element={<SkillsPage />} />
        <Route path="cron-jobs" element={<CronJobsPage />} />
        {/* Teams — single-team model, no separate builder */}
        {/* Other */}
        <Route path="admin" element={<AdminPage />} />
        <Route path="updates" element={<UpdateManagerPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
    </Routes>
  </Suspense>
)

export default App
