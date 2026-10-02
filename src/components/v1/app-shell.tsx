import { Link, useLocation } from '@tanstack/react-router';
import { useState, type ReactNode } from 'react';
import {
  Menu,
  MoreHorizontal,
  LayoutTemplate,
  Settings2,
  Sparkles,
  X,
} from 'lucide-react';

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3" data-testid="brand-v1-agent">
      <div className="relative flex h-9 w-9 items-center justify-center rounded-[13px] bg-[hsl(var(--accent))] text-[hsl(var(--accent-foreground))] shadow-[0_3px_0_hsl(42_35%_47%/0.35)]">
        <span className="absolute h-[3px] w-4 -rotate-45 rounded-full bg-current" />
        <span className="absolute h-[3px] w-4 rotate-45 rounded-full bg-current" />
        <span className="absolute h-2 w-2 rounded-full bg-[hsl(var(--sidebar))]" />
      </div>
      {!compact ? (
        <span className="text-[17px] font-semibold tracking-[-0.04em]">
          V1 Agent<span className="text-[hsl(var(--accent))]">.</span>
        </span>
      ) : null}
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const location = useLocation();
  const [mobileNav, setMobileNav] = useState(false);
  const onChat = location.pathname === '/';

  return (
    <div className="shojol-noise min-h-[100dvh] bg-background text-foreground">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[248px] flex-col border-r border-[hsl(var(--sidebar-border))] bg-[hsl(var(--sidebar))] text-[hsl(var(--sidebar-foreground))] md:flex">
        <div className="px-7 pb-8 pt-7">
          <Logo />
        </div>
        <div className="px-4">
          <p className="mb-3 px-3 text-[10px] font-bold uppercase tracking-[0.18em] text-[hsl(var(--sidebar-foreground)/.42)]">
            Workspace
          </p>
          <nav className="space-y-1" aria-label="Main navigation">
            <Link
              to="/"
              className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors ${onChat ? 'bg-[hsl(var(--sidebar-accent))] text-[hsl(var(--sidebar-foreground))]' : 'text-[hsl(var(--sidebar-foreground)/.62)] hover:bg-[hsl(var(--sidebar-accent))] hover:text-[hsl(var(--sidebar-foreground))]'}`}
              data-testid="link-chat"
            >
              <LayoutTemplate className="h-[17px] w-[17px]" strokeWidth={1.8} />
              <span>Workspace</span>
              {onChat ? (
                <span className="ml-auto h-1.5 w-1.5 rounded-full bg-[hsl(var(--accent))]" />
              ) : null}
            </Link>
            <Link
              to="/settings"
              className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors ${location.pathname === '/settings' ? 'bg-[hsl(var(--sidebar-accent))] text-[hsl(var(--sidebar-foreground))]' : 'text-[hsl(var(--sidebar-foreground)/.62)] hover:bg-[hsl(var(--sidebar-accent))] hover:text-[hsl(var(--sidebar-foreground))]'}`}
              data-testid="link-settings"
            >
              <Settings2 className="h-[17px] w-[17px]" strokeWidth={1.8} />
              <span>Settings</span>
            </Link>
          </nav>
        </div>
        <div className="mt-auto px-5 pb-6">
          <div className="mb-5 rounded-2xl border border-[hsl(var(--sidebar-border))] bg-[hsl(var(--sidebar-accent)/.62)] p-4">
            <div className="mb-3 flex items-center gap-2 text-[11px] font-semibold text-[hsl(var(--sidebar-foreground)/.72)]">
              <Sparkles className="h-3.5 w-3.5 text-[hsl(var(--accent))]" /> A
              little space to think
            </div>
            <p className="text-[12px] leading-[1.55] text-[hsl(var(--sidebar-foreground)/.48)]">
              Your conversations stay right here on this device.
            </p>
          </div>
          <div className="flex items-center gap-3 border-t border-[hsl(var(--sidebar-border))] pt-5">
            <div
              className="flex h-8 w-8 items-center justify-center rounded-full bg-[hsl(var(--accent)/.22)] text-xs font-semibold text-[hsl(var(--accent))]"
              data-testid="avatar-user"
            >
              YU
            </div>
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold">Your V1 Agent</p>
              <p className="mt-0.5 text-[10px] text-[hsl(var(--sidebar-foreground)/.42)]">
                Personal space
              </p>
            </div>
            <button
              type="button"
              className="ml-auto text-[hsl(var(--sidebar-foreground)/.4)] hover:text-[hsl(var(--sidebar-foreground))]"
              aria-label="Open account menu"
              data-testid="button-account-menu"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      <div className="flex min-h-[100dvh] flex-col md:pl-[248px]">
        <header className="flex h-[68px] items-center border-b border-border/80 px-5 md:hidden">
          <button
            type="button"
            className="mr-3 rounded-lg p-2 text-muted-foreground hover:bg-secondary"
            onClick={() => setMobileNav(true)}
            aria-label="Open navigation"
            data-testid="button-open-navigation"
          >
            <Menu className="h-5 w-5" />
          </button>
          <Logo compact />
          <Link
            to="/settings"
            className="ml-auto rounded-lg p-2 text-muted-foreground hover:bg-secondary"
            aria-label="Open settings"
            data-testid="link-settings-mobile"
          >
            <Settings2 className="h-5 w-5" />
          </Link>
        </header>
        {mobileNav ? (
          <div
            className="fixed inset-0 z-50 bg-[hsl(var(--foreground)/.32)] md:hidden"
            onClick={() => setMobileNav(false)}
          >
            <div
              className="h-full w-[274px] bg-[hsl(var(--sidebar))] p-6 text-[hsl(var(--sidebar-foreground))]"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="mb-10 flex items-center justify-between">
                <Logo />
                <button
                  type="button"
                  onClick={() => setMobileNav(false)}
                  aria-label="Close navigation"
                  data-testid="button-close-navigation"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <nav className="space-y-1" aria-label="Mobile navigation">
                <Link
                  to="/"
                  onClick={() => setMobileNav(false)}
                  className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm ${onChat ? 'bg-[hsl(var(--sidebar-accent))]' : 'text-[hsl(var(--sidebar-foreground)/.62)]'}`}
                  data-testid="link-mobile-chat"
                >
                  <LayoutTemplate className="h-4 w-4" /> Workspace
                </Link>
                <Link
                  to="/settings"
                  onClick={() => setMobileNav(false)}
                  className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm ${location.pathname === '/settings' ? 'bg-[hsl(var(--sidebar-accent))]' : 'text-[hsl(var(--sidebar-foreground)/.62)]'}`}
                  data-testid="link-mobile-settings"
                >
                  <Settings2 className="h-4 w-4" /> Settings
                </Link>
              </nav>
            </div>
          </div>
        ) : null}
        {children}
      </div>
    </div>
  );
}
