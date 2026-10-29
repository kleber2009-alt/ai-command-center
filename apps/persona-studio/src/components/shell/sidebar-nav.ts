// Single source of truth for the sidebar navigation. Adding a new product
// surface = adding a row here. Labels/hints are i18n keys (src/lib/i18n.ts).
import type { Icon3DName } from '@/components/ui/icon3d';

export type SidebarItem = {
  href: string;
  label: string;
  key: string;
  icon: Icon3DName;
  hint?: string;
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
    items: [{ href: '/dashboard', label: 'Home', key: 'home', icon: 'home' }],
  },
  {
    // The main path: own blog → uniquify → reel / carousel → publish.
    label: 'Pipeline',
    key: 'pipeline',
    items: [
      { href: '/blog', label: 'My Blog', key: 'pipe-blog', icon: 'research', hint: 'best reels & carousels' },
      { href: '/pipeline', label: 'My Pipelines', key: 'pipe-list', icon: 'workspace', hint: 'idea → video → post' },
    ],
  },
  {
    label: 'Create',
    key: 'create',
    items: [
      { href: '/personas', label: 'Personas', key: 'create-personas', icon: 'personas', hint: 'avatar · voice · brand' },
      { href: '/briefs', label: 'Workspace', key: 'create-workspace', icon: 'workspace', hint: 'brief → script → video' },
      { href: '/generate', label: 'Avatar', key: 'create-avatar', icon: 'avatar', hint: '1 photo → 10 avatars' },
      { href: '/voice', label: 'Voice', key: 'create-voice', icon: 'voice', hint: 'clone & train' },
      { href: '/videos/new', label: 'Video', key: 'create-video', icon: 'video', hint: 'talking-photo' },
      { href: '/carousels', label: 'Carousel', key: 'create-carousel', icon: 'carousel', hint: '25 styles · skills' },
      { href: '/montage', label: 'Skill Montage', key: 'create-skill-montage', icon: 'skills', hint: 'Kadrik studio styles' },
      { href: '/edits/new', label: 'Montage', key: 'create-montage', icon: 'montage', hint: 'Submagic edit' },
    ],
  },
  {
    label: 'Library',
    key: 'library',
    items: [
      { href: '/avatars', label: 'Avatars', key: 'lib-avatars', icon: 'avatar' },
      { href: '/covers', label: 'Covers', key: 'lib-covers', icon: 'covers' },
      { href: '/videos', label: 'Videos', key: 'lib-videos', icon: 'videos' },
      { href: '/edits', label: 'Assets', key: 'lib-assets', icon: 'assets' },
    ],
  },
  {
    label: 'Discover',
    key: 'discover',
    items: [
      { href: '/research/bloggers', label: 'Bloggers', key: 'disc-bloggers', icon: 'bloggers', hint: 'spy & account analysis' },
      { href: '/research/media', label: 'Media', key: 'disc-media', icon: 'media', hint: 'post-level content search' },
      { href: '/research', label: 'Research', key: 'disc-research', icon: 'research', hint: 'niche-based viral hunt' },
      { href: '/research/trends', label: 'Trends', key: 'disc-trends', icon: 'trends', hint: 'audio · hooks · formats' },
      { href: '/research/hooks', label: 'Hook Gallery', key: 'disc-hooks', icon: 'hooks', hint: 'millions-of-views hooks' },
      { href: '/research/radars', label: 'Radars', key: 'disc-radars', icon: 'radars', hint: 'saved niche trackers' },
      { href: '/research/folders', label: 'Folders', key: 'disc-folders', icon: 'folders', hint: 'bloggers · videos · ideas' },
      { href: '/measure', label: 'Analytics', key: 'disc-measure', icon: 'analytics', hint: 'your Xn + attribution' },
      { href: '/parser', label: 'Viral Posts (legacy)', key: 'disc-viral', icon: 'viral' },
    ],
  },
  {
    label: 'Automation',
    key: 'automation',
    items: [
      { href: '/schedule', label: 'Scheduled', key: 'auto-scheduled', icon: 'schedule', hint: 'plan & autopost' },
      { href: '/schedule/new', label: 'New Post', key: 'auto-new', icon: 'newpost', hint: 'schedule a publish' },
    ],
  },
  {
    label: 'Settings',
    key: 'settings',
    items: [
      { href: '/billing', label: 'Subscription', key: 'set-subscription', icon: 'billing' },
      { href: '/settings/keys', label: 'Integrations', key: 'set-integrations', icon: 'keys' },
      { href: '/help', label: 'Help & Docs', key: 'set-help', icon: 'help' },
    ],
  },
];

export type QuickCreateAction = {
  label: string;
  href: string;
  hint: string;
  icon: Icon3DName;
};

/** «Создать контент» popover — each entry opens a real, working flow. */
export const QUICK_CREATE_ACTIONS: QuickCreateAction[] = [
  { label: 'Create Reel', href: '/briefs', hint: 'brief → script → video', icon: 'workspace' },
  { label: 'Create Carousel', href: '/carousels', hint: '25 styles · skills', icon: 'carousel' },
  { label: 'Talking Video', href: '/videos/new', hint: 'avatar + script', icon: 'video' },
  { label: 'Skill Montage', href: '/montage', hint: 'reels styles · ffmpeg', icon: 'skills' },
  { label: 'Generate Avatar', href: '/generate', hint: '1 photo → 10 avatars', icon: 'avatar' },
  { label: 'Train Voice', href: '/voice', hint: 'clone & train', icon: 'voice' },
];
