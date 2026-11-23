# Settings Layout (#300)

The settings page is split into navigable sections. `SettingsSectionNav` (`src/components/settings/SettingsSectionNav.tsx`) links to each one by anchor:

| Section | Contents |
| --- | --- |
| Profile (`#settings-profile`) | Avatar, name, email, wallet address |
| Appearance & language (`#settings-appearance`) | Theme, UI language, translation language |
| Wallet (`#settings-wallet`) | Stellar trustlines |
| Notifications (`#settings-notifications`) | Browser permission (#302), saved notification preferences (#301) |
| Security (`#settings-security`) | MFA, change password, delete account, recent sign-in activity |

**Every visible control persists or is clearly unavailable:**
- The Light/Dark theme buttons dispatch `setTheme`, which is persisted. Previously they had no handler.
- Name, email and wallet address are read-only, with a note that they are managed by the account.
- Notification preferences show an "unavailable" message when the backend has no preferences endpoint.

**Mobile:** the section nav is a sticky, horizontally scrollable bar on small screens. App navigation (the Settings link in `ChatLayout`'s mobile menu) is unchanged.
