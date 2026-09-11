'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTheme } from 'next-themes';
import { useProfile } from '@/hooks/use-profile';
import { toast } from 'sonner';
import { Menu, X, Sun, Moon } from 'lucide-react';

const links = [
  ['/dashboard', 'Dashboard'], ['/dashboard/tracker', 'Tracker'], ['/dashboard/benefits', 'Benefits'],
  ['/dashboard/scenarios', 'Scenarios'], ['/dashboard/tax-prep', 'Tax Prep'],
  ['/dashboard/history', 'Reports'], ['/dashboard/scanner', 'Scanner History'], ['/settings', 'Settings'],
];

export function Header() {
  const pathname = usePathname();
  const { profile, update } = useProfile();
  const { resolvedTheme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  useEffect(() => { if (profile?.theme_preference) setTheme(profile.theme_preference); }, [profile?.theme_preference, setTheme]);
  return (
    <header className="bg-[#0f172a] text-white print:hidden">
      <nav className="max-w-7xl mx-auto px-4 py-3" aria-label="Main navigation">
        <div className="flex items-center justify-between gap-3">
          <Link href="/dashboard" className="text-lg shrink-0">Multi<strong>W2</strong><span className="ml-2 text-xs text-slate-400">Local</span></Link>
          <div className="flex items-center gap-2">
            <button className="p-2" aria-label="Toggle light or dark theme" onClick={async () => { const next = resolvedTheme === 'dark' ? 'light' : 'dark'; try { await update.mutateAsync({ theme_preference: next }); setTheme(next); } catch { toast.error('Failed to save theme'); } }}>
              {resolvedTheme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
            </button>
            <button className="p-2 md:hidden" aria-expanded={open} aria-label={open ? 'Close navigation' : 'Open navigation'} onClick={() => setOpen(!open)}>
              {open ? <X className="size-5" /> : <Menu className="size-5" />}
            </button>
          </div>
        </div>
        <div className={`${open ? 'flex' : 'hidden'} md:flex flex-wrap gap-1 mt-2`}>
          {links.map(([href, label]) => <Link key={href} href={href} onClick={() => setOpen(false)} aria-current={pathname === href ? 'page' : undefined} className={`px-3 py-2 rounded text-sm ${pathname === href ? 'bg-slate-700 text-white' : 'text-slate-300 hover:bg-slate-800'}`}>{label}</Link>)}
        </div>
      </nav>
    </header>
  );
}
