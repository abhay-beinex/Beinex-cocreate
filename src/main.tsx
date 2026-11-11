import React from 'react'
import ReactDOM from 'react-dom/client'
import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom'
import { MotionConfig } from 'framer-motion'
import './index.css'
import Shell from './components/Shell'
import Login from './pages/Login'
import Home from './pages/Home'
import Chat from './pages/Chat'
import Agents from './pages/Agents'
import AgentEditor from './pages/AgentEditor'
import AgentStudio from './pages/AgentStudio'
import Workflows from './pages/Workflows'
import WorkflowEditor from './pages/WorkflowEditor'
import Tools from './pages/Tools'
import Knowledge from './pages/Knowledge'
import Runs from './pages/Runs'
import Models from './pages/Models'
import Settings from './pages/Settings'
import RunLink from './pages/RunLink'

const router = createBrowserRouter([
  { path: '/login', element: <Login /> },
  {
    path: '/',
    element: <Shell />,
    children: [
      { index: true, element: <Home /> },
      { path: 'chat', element: <Chat /> },
      { path: 'chat/:agentId', element: <Chat /> },
      { path: 'agents', element: <Agents /> },
      { path: 'agents/new', element: <AgentStudio /> },
      { path: 'agents/:agentId', element: <AgentEditor /> },
      { path: 'workflows', element: <Workflows /> },
      { path: 'workflows/:workflowId', element: <WorkflowEditor /> },
      { path: 'tools', element: <Tools /> },
      { path: 'knowledge', element: <Knowledge /> },
      { path: 'runs', element: <Runs /> },
      { path: 'models', element: <Models /> },
      { path: 'settings', element: <Settings /> },
      { path: 'run/:workflowId', element: <RunLink /> },
      { path: 'automations/*', element: <Navigate to="/workflows" replace /> },
      { path: 'admin', element: <Navigate to="/settings" replace /> },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
])

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <MotionConfig reducedMotion="user"><RouterProvider router={router} /></MotionConfig>
  </React.StrictMode>,
)
