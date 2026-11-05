import { motion, type HTMLMotionProps } from 'framer-motion'
import type { ReactNode } from 'react'

export const ease = [0.2, 0.8, 0.2, 1] as const

export function Page({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease }} className={className}>
      {children}
    </motion.div>
  )
}

export function Stagger({ children, className, delay = 0.05 }: { children: ReactNode; className?: string; delay?: number }) {
  return (
    <motion.div initial="hidden" animate="show" variants={{ hidden: {}, show: { transition: { staggerChildren: delay } } }} className={className}>
      {children}
    </motion.div>
  )
}

export const item = { hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0, transition: { duration: 0.4, ease } } }

export function Item({ children, className, ...rest }: HTMLMotionProps<'div'> & { children: ReactNode }) {
  return <motion.div variants={item} className={className} {...rest}>{children}</motion.div>
}

export function Rise({ children, className, delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  return <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease, delay }} className={className}>{children}</motion.div>
}

export function Hover({ children, className, lift = 3, onClick }: { children: ReactNode; className?: string; lift?: number; onClick?: () => void }) {
  return <motion.div whileHover={{ y: -lift }} whileTap={{ scale: 0.985 }} transition={{ type: 'spring', stiffness: 400, damping: 28 }} className={className} onClick={onClick}>{children}</motion.div>
}
