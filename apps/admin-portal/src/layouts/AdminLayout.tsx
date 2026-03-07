import { useState, Fragment } from 'react';
import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { Menu, Transition } from '@headlessui/react';
import {
  HomeIcon,
  BuildingOffice2Icon,
  UsersIcon,
  ClipboardDocumentListIcon,
  ChartBarIcon,
  CpuChipIcon,
  BellIcon,
  MagnifyingGlassIcon,
  ArrowRightOnRectangleIcon,
  ChevronDownIcon,
} from '@heroicons/react/24/outline';
import { useAuth } from '../hooks/useAuth';
import type { AdminRole } from '../store/authStore';

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: HomeIcon },
  { to: '/centers', label: 'Health Centers', icon: BuildingOffice2Icon },
  { to: '/users', label: 'Users', icon: UsersIcon },
  { to: '/consultations', label: 'Consultations', icon: ClipboardDocumentListIcon },
  { to: '/analytics', label: 'Analytics', icon: ChartBarIcon },
  { to: '/system', label: 'System Health', icon: CpuChipIcon },
];

const ROUTE_TITLES: Record<string, string> = {
  '/': 'Dashboard',
  '/centers': 'Health Centers',
  '/users': 'Users',
  '/consultations': 'Consultations',
  '/analytics': 'Analytics',
  '/system': 'System Health',
};

const ROLE_LABELS: Record<AdminRole, string> = {
  super_admin: 'Super Admin',
  state_admin: 'State Admin',
  district_admin: 'District Admin',
  viewer: 'Viewer',
};

const ROLE_COLORS: Record<AdminRole, string> = {
  super_admin: 'bg-red-500/20 text-red-300',
  state_admin: 'bg-blue-500/20 text-blue-300',
  district_admin: 'bg-green-500/20 text-green-300',
  viewer: 'bg-gray-500/20 text-gray-300',
};

export default function AdminLayout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [searchQuery, setSearchQuery] = useState('');

  const pageTitle = ROUTE_TITLES[location.pathname] ?? 'Dashboard';
  const initials = user?.name
    ?.split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) ?? 'AD';

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      {/* Sidebar */}
      <aside className="flex w-[280px] flex-shrink-0 flex-col bg-sidebar text-sidebar-text">
        {/* Logo */}
        <div className="flex h-16 items-center gap-3 px-6 border-b border-white/10">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 font-bold text-white text-lg">
            V
          </div>
          <div>
            <h1 className="text-base font-bold text-white tracking-tight">Vaidyah</h1>
            <p className="text-[10px] uppercase tracking-widest text-sidebar-text/60">Admin Portal</p>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                isActive ? 'nav-item-active' : 'nav-item'
              }
            >
              <item.icon className="h-5 w-5 flex-shrink-0" />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        {/* User info */}
        <div className="border-t border-white/10 p-4">
          <div className="flex items-center gap-3">
            {user?.avatar ? (
              <img
                src={user.avatar}
                alt={user.name}
                className="h-9 w-9 rounded-full object-cover ring-2 ring-white/20"
              />
            ) : (
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-xs font-semibold text-white">
                {initials}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-white">{user?.name}</p>
              <span
                className={`inline-block mt-0.5 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                  user?.role ? ROLE_COLORS[user.role] : 'bg-gray-500/20 text-gray-300'
                }`}
              >
                {user?.role ? ROLE_LABELS[user.role] : 'Unknown'}
              </span>
            </div>
          </div>
          <button
            onClick={logout}
            className="mt-3 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-sidebar-text/70 transition-colors hover:bg-white/10 hover:text-white"
          >
            <ArrowRightOnRectangleIcon className="h-4 w-4" />
            Sign out
          </button>
        </div>
      </aside>

      {/* Main area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top header */}
        <header className="flex h-16 flex-shrink-0 items-center justify-between border-b border-gray-200 bg-white px-6">
          <h2 className="text-lg font-semibold text-gray-900">{pageTitle}</h2>

          <div className="flex items-center gap-4">
            {/* Search */}
            <div className="relative">
              <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-9 w-64 rounded-lg border border-gray-300 bg-gray-50 pl-9 pr-3 text-sm placeholder:text-gray-400 focus:border-primary-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-primary-500 transition-colors"
              />
            </div>

            {/* Notification bell */}
            <button className="relative rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors">
              <BellIcon className="h-5 w-5" />
              <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-red-500" />
            </button>

            {/* User avatar dropdown */}
            <Menu as="div" className="relative">
              <Menu.Button className="flex items-center gap-2 rounded-lg p-1.5 hover:bg-gray-100 transition-colors">
                {user?.avatar ? (
                  <img
                    src={user.avatar}
                    alt={user.name}
                    className="h-8 w-8 rounded-full object-cover"
                  />
                ) : (
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-100 text-xs font-semibold text-primary-700">
                    {initials}
                  </div>
                )}
                <ChevronDownIcon className="h-4 w-4 text-gray-500" />
              </Menu.Button>

              <Transition
                as={Fragment}
                enter="transition ease-out duration-100"
                enterFrom="transform opacity-0 scale-95"
                enterTo="transform opacity-100 scale-100"
                leave="transition ease-in duration-75"
                leaveFrom="transform opacity-100 scale-100"
                leaveTo="transform opacity-0 scale-95"
              >
                <Menu.Items className="absolute right-0 mt-2 w-56 origin-top-right rounded-xl bg-white shadow-lg ring-1 ring-black/5 focus:outline-none divide-y divide-gray-100">
                  <div className="px-4 py-3">
                    <p className="text-sm font-medium text-gray-900">{user?.name}</p>
                    <p className="truncate text-xs text-gray-500">{user?.email}</p>
                  </div>
                  <div className="py-1">
                    <Menu.Item>
                      {({ active }) => (
                        <button
                          onClick={logout}
                          className={`${
                            active ? 'bg-gray-50' : ''
                          } flex w-full items-center gap-2 px-4 py-2 text-sm text-gray-700`}
                        >
                          <ArrowRightOnRectangleIcon className="h-4 w-4" />
                          Sign out
                        </button>
                      )}
                    </Menu.Item>
                  </div>
                </Menu.Items>
              </Transition>
            </Menu>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
