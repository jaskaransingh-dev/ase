'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { HomeIcon, CompassIcon, UserIcon } from './icons'

const TABS = [
  { href: '/m/portfolio', label: 'Portfolio', Icon: HomeIcon },
  { href: '/m/discover', label: 'Discover', Icon: CompassIcon },
  { href: '/m/account', label: 'Account', Icon: UserIcon },
]

export default function TabBar() {
  const pathname = usePathname() || ''
  return (
    <nav className="m-tabbar" role="navigation" aria-label="Primary">
      {TABS.map(({ href, label, Icon }) => {
        const active = pathname === href || pathname.startsWith(href + '/')
        return (
          <Link key={href} href={href} className="m-tab" aria-current={active ? 'page' : undefined}>
            <Icon />
            <span>{label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
