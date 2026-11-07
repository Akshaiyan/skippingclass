import { Link, useRouterState } from "@tanstack/react-router";
import aegisLogo from "@/assets/aegis-logo.png.asset.json";
import aegisMark from "@/assets/aegis-mark.png.asset.json";
import { Inbox, LayoutDashboard, Menu, PanelLeftClose, PanelLeftOpen, Scale, ScrollText } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useStore } from "@/store";
import { cn } from "@/lib/utils";
import { PolicyStamp } from "./status";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";

const NAV = [
  { to: "/", label: "Dashboard", short: "Home", icon: LayoutDashboard },
  { to: "/claims", label: "Claims", short: "Claims", icon: Inbox },
  { to: "/policy", label: "Policy change", short: "Policy", icon: Scale },
  { to: "/log", label: "Decision log", short: "Log", icon: ScrollText },
] as const;

function NavList({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const { derived } = useStore();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const redOpen = derived.filter((c) => c.flow === "red" && c.case_status === "open").length;
  return (
    <nav aria-label="Main" className="flex flex-col gap-1">
      {NAV.map((n) => {
        const active = n.to === "/" ? path === "/" : path.startsWith(n.to);
        const Icon = n.icon;
        const link = (
          <Link
            to={n.to}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "group relative flex rounded-md text-sm transition-colors duration-150",
              collapsed ? "flex-col items-center gap-1 px-1 py-2" : "items-center gap-2.5 px-2.5 py-2",
              active ? "bg-background font-medium text-foreground shadow-card" : "text-text-2 hover:bg-surface-2 hover:text-foreground",
            )}
          >
            <Icon className="size-4 shrink-0" aria-hidden />
            <span className={cn(collapsed && "text-[10px] leading-3")}>{collapsed ? n.short : n.label}</span>
            {n.to === "/claims" && redOpen > 0 && (
              <span
                className={cn(
                  "tnum inline-flex items-center gap-1 rounded-full bg-flow-red-tint px-1.5 text-[11px] font-medium text-foreground",
                  collapsed ? "absolute right-1 top-1" : "ml-auto",
                )}
                aria-label={`${redOpen} open human review claims`}
              >
                <span className="size-1.5 rounded-full bg-flow-red" aria-hidden />
                {redOpen}
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

function SidebarFooter({ collapsed }: { collapsed: boolean }) {
  const { state, dispatch, v1Hash } = useStore();
  if (collapsed)
    return (
      <div className="flex flex-col items-center gap-1 text-center">
        <span className="grid size-8 place-items-center rounded-full bg-surface-2 text-xs font-semibold">
          {state.reviewer.split(" ").map((p) => p[0]).join("").slice(0, 2) || "?"}
        </span>
        <span className="font-mono text-[10px] text-muted-foreground">v1</span>
      </div>
    );
  return (
    <div className="space-y-2">
      <label htmlFor="reviewer" className="eyebrow block">
        Signed in as
      </label>
      <input
        id="reviewer"
        value={state.reviewer}
        onChange={(e) => dispatch({ type: "setReviewer", name: e.target.value })}
        className="h-8 w-full rounded-md border border-border bg-background px-2 text-sm hover:border-border-strong"
      />
      <div>
        <span className="eyebrow mb-1 block">Live policy</span>
        <PolicyStamp version="v1" hash={v1Hash} />
      </div>
    </div>
  );
}

function Brand({ collapsed }: { collapsed: boolean }) {
  return (
    <div className={cn("flex items-center gap-2", collapsed && "flex-col gap-1")}>
      {collapsed ? (
        <img src={aegisMark.url} alt="Aegis" className="h-6 w-auto dark:invert" />
      ) : (
        <div className="leading-tight">
          <img src={aegisLogo.url} alt="Aegis" className="h-7 w-auto dark:invert" />
          <div className="mt-2 text-xs text-muted-foreground">truth in triage</div>
        </div>
      )}
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { state } = useStore();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  return (
    <div className="flex min-h-screen bg-background">
      <aside
        className={cn(
          "sticky top-0 hidden h-screen shrink-0 flex-col justify-between border-r border-border bg-sidebar transition-[width] duration-200 ease-out md:flex",
          collapsed ? "w-16 px-1.5 py-4" : "w-60 px-3 py-4",
        )}
      >
        <div className="space-y-6">
          <div className={cn(collapsed ? "flex justify-center" : "px-1")}>
            <Brand collapsed={collapsed} />
          </div>
          <NavList collapsed={collapsed} />
        </div>
        <div className="space-y-4">
          <SidebarFooter collapsed={collapsed} />
          <button
            onClick={() => setCollapsed((c) => !c)}
            className={cn(
              "flex w-full rounded-md text-xs text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground",
              collapsed ? "flex-col items-center gap-1 py-2" : "items-center gap-2 px-2.5 py-2",
            )}
          >
            {collapsed ? <PanelLeftOpen className="size-4" aria-hidden /> : <PanelLeftClose className="size-4" aria-hidden />}
            {collapsed ? "Expand" : "Collapse"}
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="sticky top-0 z-30 flex items-center justify-between border-b border-border bg-background px-4 py-3 md:hidden">
          <Brand collapsed={false} />
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
            <SidebarFooter collapsed={false} />
          </SheetContent>
        </Sheet>
        {state.source !== "live" && (
          <div role="status" className="border-b border-border bg-surface px-4 py-2 text-sm md:px-8">
            <strong className="font-medium">Demo data.</strong>{" "}
            {state.source === "connecting" ? "Connecting to the triage service…" : "The triage service is not reachable, so decisions shown here are not from the engine and are not recorded."}
          </div>
        )}
        <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-6 md:px-8 md:py-8">{children}</main>
      </div>
    </div>
  );
}
