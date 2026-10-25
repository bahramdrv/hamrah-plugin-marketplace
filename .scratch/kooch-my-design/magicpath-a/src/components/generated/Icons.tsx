export type IconName = 'compass' | 'form' | 'report' | 'account' | 'help' | 'arrow' | 'map' | 'check';
export function AppIcon({ name, className }: { name: IconName; className?: string }) {
  const paths: Record<IconName, React.ReactNode> = {
    compass: <><circle cx="12" cy="12" r="9"/><path d="m16 8-2.5 5.5L8 16l2.5-5.5L16 8Z"/></>,
    form: <><path d="M8 6h12M8 12h12M8 18h12"/><circle cx="3" cy="6" r=".5"/><circle cx="3" cy="12" r=".5"/><circle cx="3" cy="18" r=".5"/></>,
    report: <><path d="M5 20V10m7 10V4m7 16v-7"/></>,
    account: <><circle cx="12" cy="7" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/></>,
    help: <><circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 4.2 1.8c-1.2.7-1.7 1.2-1.7 2.7m0 3h.01"/></>,
    arrow: <path d="M20 12H4m6-6-6 6 6 6"/>,
    map: <><path d="m3 5 6-2 6 3 6-2v15l-6 2-6-3-6 2V5Zm6-2v15m6-12v15"/></>,
    check: <><rect x="4" y="3" width="16" height="18" rx="2"/><path d="m8 12 3 3 5-6"/></>,
  };
  return <svg className={className ?? 'app-icon'} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}
