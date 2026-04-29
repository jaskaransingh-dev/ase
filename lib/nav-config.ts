export interface NavItem {
  href: string
  label: string
  icon: string
  exact?: boolean
  iconOnly?: boolean
  badge?: string
  badgeColor?: string
  disabled?: boolean
}

export interface NavSection {
  section: string
  items: NavItem[]
}

export const NAV_CONFIG: NavSection[] = [
  {
    section: 'MAIN',
    items: [
      { href: '/dashboard', label: 'Overview', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6', exact: true },
    ],
  },
  {
    section: 'TRADING',
    items: [
      { href: '/dashboard/marketplace', label: 'Exchange', icon: 'M3 3h2l.4 2M7 13h10l4-8H5.4M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z' },
    ],
  },
  {
    section: 'BUILD',
    items: [
      // Single entry point — Lab hub renders subnav for build / studio / backtest
      { href: '/dashboard/lab', label: 'Lab', icon: 'M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z', badge: 'AI', badgeColor: '#4F8CFF' },
    ],
  },
  {
    section: 'NEWS',
    items: [
      { href: '/dashboard/geo', label: 'SYNE Terminal', icon: 'M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5' },
    ],
  },
  {
    section: 'ACCOUNT',
    items: [
      { href: '/dashboard/connect/kraken', label: 'Kraken Keys', icon: 'M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z' },
      { href: '/dashboard/settings', label: 'Settings', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c-.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-.543-.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z' },
    ],
  },
]

export function getNavSections(): NavSection[] {
  return NAV_CONFIG
}

export function findNavSection(href: string): NavSection | undefined {
  return NAV_CONFIG.find(s => s.items.some(i => i.href === href))
}

export function findNavItem(href: string): NavItem | undefined {
  for (const s of NAV_CONFIG) {
    const item = s.items.find(i => i.href === href)
    if (item) return item
  }
  return undefined
}