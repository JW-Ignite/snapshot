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
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <header className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-lg">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/dashboard" className="text-white/80 hover:text-white text-sm">
                ← Dashboard
              </Link>
              <div className="h-6 w-px bg-white/30" />
              <h1 className="text-xl font-bold flex items-center gap-2">
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
                      px-4 py-2 rounded-lg text-sm font-medium transition-colors
                      flex items-center gap-2
                      ${isActive
                        ? 'bg-white/20 text-white'
                        : 'text-white/70 hover:text-white hover:bg-white/10'
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
      <main className="max-w-7xl mx-auto px-4 py-6">
        {children}
      </main>
    </div>
  );
}
