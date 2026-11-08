import { Link, useRouterState } from "@tanstack/react-router";
import { AegisLogo, AegisMark } from "@/components/AegisLogo";
import {
  Inbox,
  LayoutDashboard,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Scale,
  ScrollText,
  TrendingUp,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { useStore } from "@/store";
import { canOpen, ROLE_LABEL } from "@/lib/roles";
import { cn } from "@/lib/utils";
import { PolicyStamp } from "./status";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";

const NAV = [
  { to: "/", label: "Dashboard", short: "Home", icon: LayoutDashboard },
  { to: "/claims", label: "Claims", short: "Claims", icon: Inbox },
  { to: "/policy", label: "Policy change", short: "Policy", icon: Scale },
  { to: "/business", label: "Cost impact", short: "Business", icon: TrendingUp },
  { to: "/log", label: "Decision log", short: "Log", icon: ScrollText },
] as const;

const initials = (name: string) =>
  name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "?";

function NavList({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const { derived, state } = useStore();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const redOpen = derived.filter((c) => c.flow === "red" && c.case_status === "open").length;
  const items = NAV.filter((n) => canOpen(state.user?.role, n.to));
  return (
    <nav aria-label="Main" className="flex flex-col gap-1">
      {items.map((n) => {
        const active = n.to === "/" ? path === "/" : path.startsWith(n.to);
        const Icon = n.icon;
        const link = (
          <Link
            to={n.to}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "group relative flex rounded-md text-sm transition-colors duration-150",
              collapsed ? "flex-col items-center gap-1 px-1 py-2" : "items-center gap-3 px-3 py-2",
              active
                ? "bg-background font-medium text-foreground shadow-card"
                : "text-text-2 hover:bg-surface-2 hover:text-foreground",
            )}
          >
            <Icon className="size-4 shrink-0" aria-hidden />
            <span className={cn(collapsed && "text-xs leading-3")}>
              {collapsed ? n.short : n.label}
            </span>
            {n.to === "/claims" && redOpen > 0 && (
              <span
                className={cn(
                  "tnum text-xs font-bold text-foreground",
                  collapsed ? "absolute right-1 top-1" : "ml-auto",
                )}
                aria-label={`${redOpen} open claims need human review`}
              >
                {redOpen}
              </span>
            )}
            {n.to === "/log" && state.log.length > 0 && (
              <span
                className={cn("tnum text-xs text-text-2", collapsed ? "absolute right-1 top-1" : "ml-auto")}
                aria-label={`${state.log.length} decisions recorded`}
              >
                {state.log.length}
              </span>
            )}
          </Link>
        );
        return collapsed ? (
          <Tooltip key={n.to}>
            <TooltipTrigger asChild>{link}</TooltipTrigger>
            <TooltipContent side="right">{n.label}</TooltipContent>
          </Tooltip>
        ) : (
          <div key={n.to}>{link}</div>
        );
      })}
    </nav>
  );
}

function UserPanel({ collapsed }: { collapsed: boolean }) {
  const { state, dispatch, v1Hash } = useStore();
  const user = state.user;
  if (!user) return null;
  const signOut = () => dispatch({ type: "signOut" });

  if (collapsed)
    return (
      <div className="flex flex-col items-center gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              tabIndex={0}
              className="grid size-8 place-items-center rounded-none bg-foreground text-xs font-semibold text-background"
              aria-label={`${user.name}, ${ROLE_LABEL[user.role]}`}
            >
              {initials(user.name)}
            </span>
          </TooltipTrigger>
          <TooltipContent side="right">
            {user.name}, {ROLE_LABEL[user.role]}
          </TooltipContent>
        </Tooltip>
        <button
          onClick={signOut}
          className="flex flex-col items-center gap-1 rounded-md px-1 py-2 text-xs text-muted-foreground hover:bg-surface-2 hover:text-foreground"
        >
          <LogOut className="size-4" aria-hidden />
          Sign out
        </button>
      </div>
    );

  return (
    <div className="space-y-3">
      <div className="text-xs text-muted-foreground">
        <span className="mb-1 block">Live policy</span>
        <PolicyStamp version="v1" hash={v1Hash} />
      </div>
      <div className="flex items-center gap-3 rounded-lg border border-border bg-background p-3">
        <span
          className="grid size-8 shrink-0 place-items-center rounded-none bg-foreground text-xs font-semibold text-background"
          aria-hidden
        >
          {initials(user.name)}
        </span>
        <div className="min-w-0 flex-1 leading-tight">
          <div className="truncate text-sm font-medium">{user.name}</div>
          <div className="truncate text-xs text-muted-foreground">{ROLE_LABEL[user.role]}</div>
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="size-8" onClick={signOut}>
              <LogOut aria-hidden />
              <span className="sr-only">Sign out</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>Sign out</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}

function Brand({ collapsed }: { collapsed: boolean }) {
  return collapsed ? (
    <AegisMark className="h-8 w-auto text-foreground" />
  ) : (
    <div className="leading-tight">
      <AegisLogo className="h-10 w-auto text-foreground" />
      <div className="mt-2 text-sm text-muted-foreground">Truth in triage</div>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  // The Claims table uses the whole width next to the sidebar; other pages keep a readable line length.
  const fullWidth = useRouterState({ select: (st) => st.location.pathname }) === "/claims";
  const { state } = useStore();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  return (
    <div className="flex min-h-dvh bg-background">
      <aside
        className={cn(
          "sticky top-0 hidden h-dvh shrink-0 flex-col justify-between border-r border-border bg-sidebar transition-[width] duration-200 ease-out md:flex",
          collapsed ? "w-16 px-2 py-4" : "w-60 px-3 py-5",
        )}
      >
        <div className="space-y-7">
          <div className={cn(collapsed ? "flex justify-center" : "px-1")}>
            <Brand collapsed={collapsed} />
          </div>
          <NavList collapsed={collapsed} />
        </div>
        <div className="space-y-3">
          <UserPanel collapsed={collapsed} />
          <button
            onClick={() => setCollapsed((c) => !c)}
            className={cn(
              "flex w-full rounded-md text-xs text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground",
              collapsed ? "flex-col items-center gap-1 py-2" : "items-center gap-2 px-3 py-2",
            )}
          >
            {collapsed ? (
              <PanelLeftOpen className="size-4" aria-hidden />
            ) : (
              <PanelLeftClose className="size-4" aria-hidden />
            )}
            {collapsed ? "Expand" : "Collapse sidebar"}
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="sticky top-0 z-30 flex items-center justify-between border-b border-border bg-background px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] md:hidden">
          <AegisLogo className="h-6 w-auto text-foreground" />
          <Button variant="outline" size="sm" onClick={() => setMobileOpen(true)}>
            <Menu aria-hidden /> Menu
          </Button>
        </div>
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetContent side="left" className="flex w-72 flex-col justify-between bg-sidebar">
            <div className="space-y-6">
              <SheetTitle className="sr-only">Navigation</SheetTitle>
              <Brand collapsed={false} />
              <NavList collapsed={false} onNavigate={() => setMobileOpen(false)} />
            </div>
            <UserPanel collapsed={false} />
          </SheetContent>
        </Sheet>
        {state.source !== "live" && (
          <div
            role="status"
            className="border-b border-border bg-surface px-4 py-2 text-sm md:px-8"
          >
            <strong className="font-medium">Demo data.</strong>{" "}
            {state.source === "connecting"
              ? "Connecting to the triage service…"
              : "The triage service is not reachable, so decisions shown here are not from the engine and are not recorded."}
          </div>
        )}
        <main
          className={cn(
            "mx-auto w-full flex-1 px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-6 md:px-8 md:py-8",
            !fullWidth && "max-w-[1440px]",
          )}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
