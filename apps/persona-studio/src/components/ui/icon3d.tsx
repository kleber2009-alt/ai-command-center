// Glossy 3D icons on candy tiles (reels-ui-motion IconTile). Assets are
// Microsoft Fluent Emoji 3D (MIT), 128×128 WebP in public/icons3d.

export const ICON3D_NAMES = [
  'home', 'personas', 'workspace', 'avatar', 'voice', 'video', 'carousel', 'skills', 'montage',
  'covers', 'videos', 'assets', 'bloggers', 'media', 'research', 'trends', 'hooks', 'radars',
  'folders', 'analytics', 'viral', 'schedule', 'newpost', 'agents', 'billing', 'keys', 'help',
  'coin', 'sparkles', 'done', 'processing', 'warning', 'brain', 'magic', 'bell', 'gear',
  'package', 'bolt',
] as const;

export type Icon3DName = (typeof ICON3D_NAMES)[number];

export type TileTint = 'blue' | 'pink' | 'lime' | 'yellow' | 'purple' | 'mint';

const TINTS: Record<TileTint, string> = {
  blue: 'rgba(31,123,255,0.18)',
  pink: 'rgba(255,61,139,0.18)',
  lime: 'rgba(184,240,74,0.16)',
  yellow: 'rgba(245,165,36,0.20)',
  purple: 'rgba(155,93,229,0.22)',
  mint: 'rgba(52,211,153,0.18)',
};

/** Default tile colour per icon so tiles read as one candy palette. */
const ICON_TINT: Partial<Record<Icon3DName, TileTint>> = {
  home: 'blue', personas: 'pink', workspace: 'purple', avatar: 'blue', voice: 'pink', video: 'purple',
  carousel: 'yellow', skills: 'lime', montage: 'mint', covers: 'yellow', videos: 'purple', assets: 'blue',
  bloggers: 'pink', media: 'blue', research: 'mint', trends: 'lime', hooks: 'yellow', radars: 'purple',
  folders: 'yellow', analytics: 'blue', viral: 'pink', schedule: 'mint', newpost: 'blue', agents: 'purple',
  billing: 'pink', keys: 'yellow', help: 'yellow', coin: 'yellow', sparkles: 'purple', done: 'mint',
  processing: 'blue', warning: 'yellow', brain: 'pink', magic: 'purple', bell: 'yellow', gear: 'blue',
  package: 'yellow', bolt: 'yellow',
};

type Props = {
  name: Icon3DName;
  /** icon size in px (the tile is ~1.6× larger) */
  size?: number;
  /** put the icon on a candy tile; pass a tint to override the default colour */
  tile?: boolean | TileTint;
  /** gentle idle sway (±2°), like the skill's always-moving icons */
  sway?: boolean;
  className?: string;
};

export function Icon3D({ name, size = 24, tile = false, sway = false, className = '' }: Props) {
  const img = (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/icons3d/${name}.webp`}
      width={size}
      height={size}
      alt=""
      aria-hidden="true"
      draggable={false}
      className={`icon-3d${sway ? ' sway' : ''}${tile ? '' : ` ${className}`}`}
      style={{ width: size, height: size }}
    />
  );
  if (!tile) return img;
  const tint = TINTS[typeof tile === 'string' ? tile : (ICON_TINT[name] ?? 'blue')];
  const box = Math.round(size * 1.6);
  return (
    <span
      className={`icon-tile ${className}`}
      style={{ width: box, height: box, ['--tile' as string]: tint } as React.CSSProperties}
    >
      {img}
    </span>
  );
}
