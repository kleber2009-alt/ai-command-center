// Single source of truth for the Luxury Editorial sidebar navigation.
// Stay in sync with src/components/nav.tsx (legacy mobile menu re-uses these
// routes via NAV_GROUPS). Adding a new product surface = adding a row here.

export type SidebarItem = {
  href: string;
  label: string;
  key: string;
  hint?: string;
  /** marks items that are pure UI right now (no backing API yet) */
  comingSoon?: boolean;
};

export type SidebarSection = {
  label: string;
  key: string;
  items: SidebarItem[];
};

export const SIDEBAR_SECTIONS: SidebarSection[] = [
  {
    label: 'Home',
    key: 'home',
    items: [
      { href: '/dashboard', label: 'Home', key: 'home' },
    ],
  },
  {
    label: 'Create',
    key: 'create',
    items: [
      { href: '/generate', label: 'Avatar', key: 'create-avatar', hint: '1 photo → 10 avatars' },
      { href: '/voice', label: 'Voice', key: 'create-voice', hint: 'clone & train' },
      { href: '/videos/new', label: 'Video', key: 'create-video', hint: 'talking-photo' },
      { href: '/carousels', label: 'Carousel', key: 'create-carousel', hint: 'editorial slides' },
      { href: '/edits/new', label: 'Montage', key: 'create-montage', hint: 'Submagic edit' },
    ],
  },
  {
    label: 'Pipelines',
    key: 'pipelines',
    items: [
      { href: '/dashboard#pipeline', label: 'Content Factory', key: 'pipe-factory' },
      { href: '/dashboard#pipeline', label: 'Reels Engine', key: 'pipe-reels' },
      { href: '/dashboard#pipeline', label: 'AI Clone', key: 'pipe-clone' },
    ],
  },
  {
    label: 'Library',
    key: 'library',
    items: [
      { href: '/avatars', label: 'Avatars', key: 'lib-avatars' },
      { href: '/covers', label: 'Covers', key: 'lib-covers' },
      { href: '/videos', label: 'Videos', key: 'lib-videos' },
      { href: '/edits', label: 'Assets', key: 'lib-assets' },
    ],
  },
  {
    label: 'Discover',
    key: 'discover',
    items: [
      { href: '/research/bloggers', label: 'Bloggers', key: 'disc-bloggers', hint: 'spy & account analysis' },
      { href: '/research', label: 'Research', key: 'disc-research', hint: 'niche-based viral hunt' },
      { href: '/research/hooks', label: 'Hook Gallery', key: 'disc-hooks', hint: 'millions-of-views hooks' },
      { href: '/research/radars', label: 'Radars', key: 'disc-radars', hint: 'saved niche trackers' },
      { href: '/research/folders', label: 'Folders', key: 'disc-folders', hint: 'bloggers · videos · ideas' },
      { href: '/parser', label: 'Viral Posts (legacy)', key: 'disc-viral' },
    ],
  },
  {
    label: 'Automation',
    key: 'automation',
    items: [
      { href: '/schedule', label: 'Scheduled', key: 'auto-scheduled', hint: 'plan & autopost' },
      { href: '/schedule/new', label: 'New Post', key: 'auto-new', hint: 'schedule a publish' },
      { href: '/dashboard#agents', label: 'AI Agents', key: 'auto-agents' },
    ],
  },
  {
    label: 'Settings',
    key: 'settings',
    items: [
      { href: '/billing', label: 'Subscription', key: 'set-subscription' },
      { href: '/settings/keys', label: 'Integrations', key: 'set-integrations' },
      { href: '/help', label: 'Help & Docs', key: 'set-help' },
    ],
  },
];

export type QuickCreateAction = {
  label: string;
  href: string;
  hint: string;
  accent: 'gold' | 'lime' | 'cyan' | 'pink';
};

export const QUICK_CREATE_ACTIONS: QuickCreateAction[] = [
  { label: 'Create Reel', href: '/videos/new', hint: 'talking-head video', accent: 'gold' },
  { label: 'Create Carousel', href: '/carousels', hint: 'editorial slides', accent: 'lime' },
  { label: 'Talking Video', href: '/videos/new', hint: 'avatar + script', accent: 'cyan' },
  { label: 'AI Clone', href: '/voice', hint: 'voice + avatar', accent: 'pink' },
  { label: 'Generate Avatar', href: '/generate', hint: '10 styles batch', accent: 'gold' },
  { label: 'Train Voice', href: '/voice', hint: 'persona train', accent: 'lime' },
];
