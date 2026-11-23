'use client';

import React from 'react';

/** Navigable settings sections (#300). Ids match the <section> elements on the settings page. */
export const SETTINGS_SECTIONS = [
  { id: 'settings-profile', label: 'Profile' },
  { id: 'settings-appearance', label: 'Appearance & language' },
  { id: 'settings-wallet', label: 'Wallet' },
  { id: 'settings-notifications', label: 'Notifications' },
  { id: 'settings-security', label: 'Security' },
] as const;

/**
 * In-page navigation for the settings screen (#300). On small screens it is a sticky,
 * horizontally scrollable bar, so it works alongside the app's mobile menu.
 */
export function SettingsSectionNav() {
  return (
    <nav
      aria-label="Settings sections"
      className="sticky top-0 z-20 -mx-4 mb-6 overflow-x-auto border-b border-gray-800 bg-black/90 px-4 py-2 backdrop-blur sm:mx-0 sm:rounded-lg sm:border"
    >
      <ul className="flex gap-2 whitespace-nowrap">
        {SETTINGS_SECTIONS.map((section) => (
          <li key={section.id}>
            <a
              href={`#${section.id}`}
              className="inline-block rounded-md px-3 py-1.5 text-sm text-gray-300 hover:bg-gray-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400"
            >
              {section.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export default SettingsSectionNav;
