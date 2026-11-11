import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

export function Md({ children, className }: { children: string; className?: string }) {
  return <div className={className ?? 'prose-chat'}><ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown></div>
}
