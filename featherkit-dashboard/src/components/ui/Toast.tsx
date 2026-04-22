import { X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { motion } from 'framer-motion';
import { slideInRight } from '@/lib/motion';

export function Toast({ title, desc, tone = 'accent', onClose }: { title: string; desc?: string; tone?: 'accent' | 'ok' | 'warn' | 'err'; onClose?: () => void }) {
  const toneCls = {
    accent: 'border-accent/30 bg-accent-dim',
    ok: 'border-ok/30 bg-ok/5',
    warn: 'border-warn/30 bg-warn/5',
    err: 'border-err/30 bg-err/5',
  }[tone];
  return (
    <motion.div
      variants={slideInRight}
      initial="initial"
      animate="animate"
      exit={{ opacity: 0, x: 20, transition: { duration: 0.2 } }}
      className={cn('flex items-start gap-3 p-4 pr-3 rounded-lg border bg-elevated shadow-xl min-w-[300px] max-w-[400px]', toneCls)}
    >
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-ink">{title}</div>
        {desc && <div className="text-xs text-ink-3 mt-1">{desc}</div>}
      </div>
      {onClose && (
        <button onClick={onClose} className="text-ink-5 hover:text-ink transition-colors duration-200 p-0.5">
          <X size={14} />
        </button>
      )}
    </motion.div>
  );
}
