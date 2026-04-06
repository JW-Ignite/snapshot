'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface NavItem {
  href: string;
  label: string;
  icon: string;
}

const navItems: NavItem[] = [
  { href: '/dashboard/engineer', label: 'Overview', icon: '📊' },
  { href: '/dashboard/compare', label: 'Compare', icon: '⚖️' },
];

export default function EngineerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="app-shell min-h-screen">
      {/* Header */}
      <header className="app-header text-white">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-0 py-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/dashboard" className="text-sm text-zinc-400 hover:text-zinc-100">
                ← Dashboard
              </Link>
              <div className="h-6 w-px bg-[var(--border)]" />
              <h1 className="flex items-center gap-2 text-xl font-bold">
                <span>⚙️</span>
                Engineer Panel
              </h1>
            </div>

            {/* Tab Navigation */}
            <nav className="flex gap-1">
              {navItems.map(item => {
                const isActive = pathname === item.href ||
                  (item.href === '/dashboard/engineer' && pathname.startsWith('/dashboard/machines'));

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`
                      flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors
                      ${isActive
                        ? 'bg-white text-black'
                        : 'text-zinc-400 hover:bg-white/5 hover:text-zinc-100'
                      }
                    `}
                  >
                    <span>{item.icon}</span>
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="app-page">
        {children}
      </main>
    </div>
  );
}
