"use client";

import { useState, useEffect, useRef } from "react";

type Status = 'idle' | 'sending' | 'sent' | 'error';

export function Feedback() {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Focus textarea when panel opens
  useEffect(() => {
    if (open && status !== 'sent') {
      setTimeout(() => textareaRef.current?.focus(), 80);
    }
  }, [open, status]);

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || status === 'sending') return;
    setStatus('sending');
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      });
      setStatus(res.ok ? 'sent' : 'error');
      if (res.ok) setMessage('');
    } catch {
      setStatus('error');
    }
  };

  return (
    <>
      {/* Floating trigger button */}
      <button
        onClick={() => setOpen(v => !v)}
        className="cursor-target fixed bottom-6 right-6 z-[130] flex items-center gap-2 px-4 py-2.5 rounded-full border border-zinc-300 bg-white text-zinc-600 text-[11px] font-bold tracking-[0.15em] uppercase hover:border-zinc-500 hover:text-zinc-900 transition-all duration-150 select-none"
      >
        <svg width="13" height="13" viewBox="0 0 14 14" fill="none" className="shrink-0">
          <path d="M7 1C3.686 1 1 3.358 1 6.25c0 1.624.8 3.074 2.06 4.044L2.5 13l2.94-1.47A6.43 6.43 0 0 0 7 11.5c3.314 0 6-2.358 6-5.25S10.314 1 7 1Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
        </svg>
        Feedback
      </button>

      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-[131] bg-black/10"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Slide-up panel */}
      <div
        className={`fixed bottom-20 right-6 z-[132] w-[min(360px,calc(100vw-3rem))] rounded-2xl border border-zinc-200 bg-white shadow-lg transition-all duration-200 origin-bottom-right ${
          open ? 'opacity-100 scale-100 pointer-events-auto' : 'opacity-0 scale-95 pointer-events-none'
        }`}
      >
        <div className="px-5 pt-5 pb-4">
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-xs font-bold tracking-[0.18em] uppercase text-zinc-800">
              Feedback
            </h3>
            <button
              onClick={() => setOpen(false)}
              className="text-zinc-400 hover:text-zinc-700 transition-colors text-lg leading-none"
              aria-label="Close"
            >
              ×
            </button>
          </div>
          <p className="text-[11px] text-zinc-400 mb-4 tracking-wide">
            Suggestions for the games, or anything else.
          </p>

          {status === 'sent' ? (
            <div className="py-6 flex flex-col items-center gap-3 text-center">
              <p className="text-zinc-800 font-semibold text-sm">Sent - thanks.</p>
              <button
                onClick={() => setStatus('idle')}
                className="cursor-target text-[11px] text-zinc-400 hover:text-zinc-700 tracking-widest uppercase transition-colors"
              >
                Send another
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-3">
              <textarea
                ref={textareaRef}
                value={message}
                onChange={e => setMessage(e.target.value)}
                placeholder="What would you change or add?"
                rows={4}
                maxLength={2000}
                className="w-full resize-none rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-800 placeholder:text-zinc-400 outline-none focus:border-zinc-400 transition-colors leading-relaxed"
              />
              <div className="flex items-center justify-between gap-3">
                <span className="text-[10px] text-zinc-400 tabular-nums">
                  {message.length > 0 ? `${message.length} / 2000` : ''}
                </span>
                <button
                  type="submit"
                  disabled={!message.trim() || status === 'sending'}
                  className="cursor-target px-5 py-2 rounded-lg border border-zinc-300 bg-transparent text-zinc-700 text-[11px] font-bold tracking-[0.12em] uppercase hover:border-zinc-600 hover:text-zinc-900 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-150"
                >
                  {status === 'sending' ? 'Sending…' : 'Send'}
                </button>
              </div>
              {status === 'error' && (
                <p className="text-[11px] text-red-500">Something went wrong - try again.</p>
              )}
            </form>
          )}
        </div>
      </div>
    </>
  );
}
