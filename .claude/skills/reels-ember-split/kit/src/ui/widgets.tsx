// Card contents — one widget per technique of the reference (see references/scenes.md).
// Each widget fills a GlowCard (900×700) and animates from `at` (frame).
import React from 'react';
import {interpolate, useCurrentFrame} from 'remotion';
import {T} from '../tokens';
import {clamp, ease} from './core';

const abs = (s: React.CSSProperties): React.CSSProperties => ({position: 'absolute', ...s});
const pop = (f: number, at: number, d = 6) => {
  const p = ease(f, at, d);
  return {opacity: p, transform: `scale(${0.6 + 0.4 * p})`, filter: `blur(${(1 - p) * 6}px)`};
};
const rise = (f: number, at: number, d = 6) => {
  const p = ease(f, at, d);
  return {opacity: p, transform: `translateY(${(1 - p) * 18}px)`, filter: `blur(${(1 - p) * 10}px)`};
};
const typed = (f: number, at: number, text: string, cps = 26) => text.slice(0, Math.max(0, Math.floor(((f - at) / T.fps) * cps)));

// Orange block cursor of the typewriter.
const Cursor: React.FC<{h: number}> = ({h}) => {
  const f = useCurrentFrame();
  return <span style={{display: 'inline-block', width: h * 0.5, height: h, marginLeft: 4, verticalAlign: 'bottom', background: T.orange, opacity: Math.floor(f / 8) % 2 ? 0.25 : 1}} />;
};

// App tile: Claude spark (orange) or Instagram gradient.
export const AppTile: React.FC<{kind: 'claude' | 'ig'; size?: number}> = ({kind, size = 132}) => (
  <div
    style={{
      width: size,
      height: size,
      borderRadius: size * 0.24,
      display: 'grid',
      placeItems: 'center',
      background:
        kind === 'claude'
          ? 'linear-gradient(160deg, #F08A5A, #D9622F)'
          : 'radial-gradient(circle at 30% 107%, #FDF497 0%, #FD5949 45%, #D6249F 60%, #285AEB 90%)',
      boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
    }}
  >
    {kind === 'claude' ? (
      <svg width={size * 0.56} height={size * 0.56} viewBox="-50 -50 100 100">
        {Array.from({length: 12}).map((_, i) => (
          <rect key={i} x={-4} y={-46} width={8} height={36} rx={4} fill="#FFF4EA" transform={`rotate(${i * 30})`} />
        ))}
      </svg>
    ) : (
      <svg width={size * 0.6} height={size * 0.6} viewBox="0 0 100 100" fill="none" stroke="#fff" strokeWidth={9}>
        <rect x={10} y={10} width={80} height={80} rx={24} />
        <circle cx={50} cy={50} r={19} />
        <circle cx={74} cy={26} r={3} fill="#fff" />
      </svg>
    )}
  </div>
);

// 02 · Two app tiles, a line draws between them, a white "подключено" pill pops on the line; headline under.
export const Connect: React.FC<{at: number; title: string; accent: string; accentAt: number}> = ({at, title, accent, accentAt}) => {
  const f = useCurrentFrame();
  const line = ease(f, at + 10, 10);
  return (
    <>
      <div style={abs({left: 70, top: 160, ...pop(f, at)})}><AppTile kind="claude" /></div>
      <div style={abs({right: 70, top: 160, ...pop(f, at + 5)})}><AppTile kind="ig" /></div>
      <div style={abs({left: 202, top: 225, height: 4, width: 496 * line, background: T.orange, boxShadow: `0 0 12px ${T.orange}`})} />
      <div style={abs({left: 300, top: 196, height: 60, padding: '0 22px 0 10px', borderRadius: 30, background: T.text, display: 'flex', alignItems: 'center', gap: 10, font: `700 26px ${T.font}`, color: '#2A2A2A', ...pop(f, at + 22)})}>
        <span style={{width: 38, height: 38, borderRadius: 19, background: T.green, color: '#fff', display: 'grid', placeItems: 'center', fontSize: 24}}>✓</span>
        подключено
      </div>
      <div style={abs({top: 400, width: '100%', textAlign: 'center', font: `800 80px ${T.font}`, color: T.text, lineHeight: 1.05, letterSpacing: -1})}>
        <div style={rise(f, at + 4)}>{title}</div>
        <div style={{color: T.orangeText, ...rise(f, accentAt)}}>{accent}</div>
      </div>
    </>
  );
};

// 04 · Typewriter title: app icon + white first line, orange second line, orange block cursor.
export const TitleType: React.FC<{at: number; line1: string; line2: string; sub?: string}> = ({at, line1, line2, sub}) => {
  const f = useCurrentFrame();
  const l1 = typed(f, at, line1, 14);
  const t2 = at + (line1.length / 14) * T.fps + 6;
  const l2 = typed(f, t2, line2, 14);
  const done = l2.length === line2.length;
  return (
    <div style={abs({left: 60, top: 150, font: `800 92px ${T.font}`, letterSpacing: -2, lineHeight: 1.08})}>
      <div style={{display: 'flex', alignItems: 'center', gap: 22, color: T.text}}>
        <div style={pop(f, at - 4)}><AppTile kind="ig" size={84} /></div>
        <span>{l1}{l2.length === 0 ? <Cursor h={78} /> : null}</span>
      </div>
      <div style={{color: T.orangeText, marginTop: 6}}>{l2}{l2.length > 0 && !done ? <Cursor h={78} /> : null}</div>
      {sub && done ? <div style={{font: `500 24px ${T.font}`, color: T.sub, marginTop: 26, letterSpacing: 0, ...rise(f, t2 + (line2.length / 14) * T.fps)}}>{sub}</div> : null}
    </div>
  );
};

// 06 · Grid of /command chips, pop-stagger row by row (2 frames apart).
export const Chips: React.FC<{at: number; items: string[]; cols?: number}> = ({at, items, cols = 3}) => {
  const f = useCurrentFrame();
  return (
    <div style={abs({left: 50, right: 50, top: 110, display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 22})}>
      {items.map((s, i) => (
        <div key={s} style={{height: 76, borderRadius: 14, background: '#151112', border: `1px solid ${T.rowBorder}`, display: 'grid', placeItems: 'center', font: `500 30px ${T.mono}`, color: T.text, ...pop(f, at + i * 2)}}>
          <span><span style={{color: T.chipText}}>/</span>{s.replace(/^\//, '')}</span>
        </div>
      ))}
    </div>
  );
};

// 07 · Rows "/command → description", cascade with blur (4 frames apart).
export const Tasks: React.FC<{at: number; rows: [string, string][]}> = ({at, rows}) => {
  const f = useCurrentFrame();
  return (
    <div style={abs({left: 32, right: 32, top: 100})}>
      {rows.map(([cmd, desc], i) => (
        <div key={cmd} style={{height: 92, marginBottom: 14, borderRadius: 14, background: T.row, border: `1px solid ${T.rowBorder}`, display: 'flex', alignItems: 'center', padding: '0 26px', ...rise(f, at + i * 4)}}>
          <span style={{width: 230, font: `700 26px ${T.mono}`, color: T.chipText}}>{cmd}</span>
          <span style={{width: 60, color: T.sub, font: `500 30px ${T.font}`}}>→</span>
          <span style={{font: `700 30px ${T.font}`, color: T.text}}>{desc}</span>
        </div>
      ))}
    </div>
  );
};

// 08 · Typed post + orange label + bars that grow while the score counts up.
export const PostBars: React.FC<{at: number; cmd: string; label: string; post: string; tag: string; bars: [string, number][]}> = ({at, cmd, label, post, tag, bars}) => {
  const f = useCurrentFrame();
  const barsAt = at + (post.length / 30) * T.fps + 8;
  return (
    <div style={abs({left: 32, right: 32, top: 28})}>
      <div style={{borderRadius: 18, background: T.row, border: `1px solid ${T.rowBorder}`, padding: '24px 28px', minHeight: 200}}>
        <span style={{font: `700 22px ${T.mono}`, color: T.chipText, background: T.chipBg, padding: '4px 12px', borderRadius: 8}}>{cmd}</span>
        <span style={{font: `600 24px ${T.font}`, color: T.sub, marginLeft: 14}}>{label}</span>
        <div style={{font: `700 40px ${T.font}`, color: T.text, marginTop: 22, lineHeight: 1.25}}>{typed(f, at, post, 30)}</div>
      </div>
      <div style={{display: 'inline-block', margin: '22px 0 16px', padding: '6px 18px', borderRadius: 20, background: '#E46A2C', font: `700 22px ${T.font}`, color: T.text, ...pop(f, barsAt - 4)}}>{tag}</div>
      {bars.map(([name, v], i) => {
        const p = ease(f, barsAt + i * 5, 14);
        return (
          <div key={name} style={{height: 84, marginBottom: 12, borderRadius: 14, background: T.row, border: `1px solid ${T.rowBorder}`, display: 'flex', alignItems: 'center', padding: '0 26px', ...rise(f, barsAt + i * 5)}}>
            <span style={{width: 90, font: `500 20px ${T.font}`, color: T.sub}}>хук {i + 1}</span>
            <span style={{flex: 1, font: `700 30px ${T.font}`, color: T.text}}>«{name}»</span>
            <span style={{width: 220, height: 8, borderRadius: 4, background: '#1C1514', marginRight: 30}}>
              <span style={{display: 'block', height: 8, borderRadius: 4, width: `${v * p}%`, background: T.orangeBar}} />
            </span>
            <span style={{width: 50, textAlign: 'right', font: `800 32px ${T.font}`, color: T.text}}>{Math.round(v * p)}</span>
          </div>
        );
      })}
    </div>
  );
};

// 09 · Week calendar: day columns, orange/purple posts drop in, white time badges appear later.
export const Week: React.FC<{at: number; posts: {day: number; row: number; kind: 'reels' | 'carousel'; time: string}[]}> = ({at, posts}) => {
  const f = useCurrentFrame();
  const days = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
  const colW = 116;
  return (
    <div style={abs({left: 40, top: 110})}>
      {days.map((d, i) => (
        <div key={d} style={abs({left: i * colW, top: 0, width: colW - 10, height: 520, borderRadius: 12, background: 'rgba(255,255,255,0.025)'})}>
          <div style={{textAlign: 'center', marginTop: 14, font: `700 24px ${T.font}`, color: i < 5 ? T.text : T.sub}}>{d}</div>
        </div>
      ))}
      {posts.map((p, i) => {
        const t = at + i * 4;
        return (
          <div key={i} style={abs({left: p.day * colW + 10, top: 70 + p.row * 150, ...rise(f, t)})}>
            <div style={{width: colW - 30, height: 96, borderRadius: 12, background: p.kind === 'reels' ? '#D2652A' : T.purple, padding: 10, font: `700 16px ${T.font}`, color: T.text}}>
              {p.kind === 'reels' ? 'Reels' : 'Карусель'}
            </div>
            <div style={{marginTop: 8, display: 'inline-block', padding: '4px 10px', borderRadius: 14, background: T.text, color: '#222', font: `700 16px ${T.font}`, ...pop(f, t + 30)}}>◷ {p.time}</div>
          </div>
        );
      })}
    </div>
  );
};

// 10 · Comments: avatar + nick + question; reply from the author with an orange badge is typed under each.
export const Comments: React.FC<{at: number; items: {nick: string; color: string; q: string; a: string}[]; author: string}> = ({at, items, author}) => {
  const f = useCurrentFrame();
  return (
    <div style={abs({left: 40, right: 40, top: 90})}>
      {items.map((c, i) => {
        const t = at + i * 20;
        return (
          <div key={c.nick} style={{marginBottom: 26, ...rise(f, at + i * 3)}}>
            <div style={{display: 'flex', gap: 18}}>
              <div style={{width: 46, height: 46, borderRadius: 23, background: c.color, display: 'grid', placeItems: 'center', font: `800 22px ${T.font}`, color: '#fff'}}>{c.nick[0].toUpperCase()}</div>
              <div>
                <div style={{font: `500 18px ${T.font}`, color: T.sub}}>{c.nick}</div>
                <div style={{font: `700 28px ${T.font}`, color: T.text}}>{c.q}</div>
              </div>
            </div>
            {f >= t ? (
              <div style={{marginLeft: 64, marginTop: 10, display: 'flex', gap: 14}}>
                <AppTile kind="claude" size={36} />
                <div>
                  <span style={{font: `500 16px ${T.font}`, color: T.sub}}>{author}</span>
                  <span style={{marginLeft: 10, padding: '2px 10px', borderRadius: 10, background: T.orange, font: `700 14px ${T.font}`, color: '#fff'}}>автор Claude</span>
                  <div style={{font: `600 24px ${T.font}`, color: T.text}}>{typed(f, t, c.a, 40)}</div>
                </div>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
};

// 12 · Humanizer: marked characters get a red box, then disappear; a green-check status pill pops.
export const Humanize: React.FC<{at: number; parts: (string | {mark: string; to: string})[]; status: string}> = ({at, parts, status}) => {
  const f = useCurrentFrame();
  const fix = at + 24;
  return (
    <div style={abs({left: 32, right: 32, top: 100})}>
      <div style={{borderRadius: 18, background: T.row, border: `1px solid ${T.rowBorder}`, padding: '30px 34px', font: `700 42px ${T.font}`, lineHeight: 1.32, color: T.text, minHeight: 260}}>
        {parts.map((p, i) =>
          typeof p === 'string' ? (
            <span key={i}>{p}</span>
          ) : f < fix ? (
            <span key={i} style={{padding: '0 6px', borderRadius: 6, background: interpolate(f, [at + 6, at + 10], [0, 1], clamp) > 0.5 ? '#7A1E10' : 'transparent', outline: f > at + 6 ? `2px solid ${T.red}` : 'none'}}>{p.mark}</span>
          ) : (
            <span key={i}>{p.to}</span>
          ),
        )}
      </div>
      <div style={{display: 'inline-flex', alignItems: 'center', gap: 10, marginTop: 24, padding: '8px 20px 8px 8px', borderRadius: 26, background: T.text, font: `700 22px ${T.font}`, color: '#222', ...pop(f, fix + 4)}}>
        <span style={{width: 32, height: 32, borderRadius: 16, background: T.green, color: '#fff', display: 'grid', placeItems: 'center'}}>✓</span>
        {status}
      </div>
    </div>
  );
};

// 13 · Agent checks: numbered rows, bars fill at different speeds, a green check lands when full.
export const Checks: React.FC<{at: number; rows: [string, string][]}> = ({at, rows}) => {
  const f = useCurrentFrame();
  return (
    <div style={abs({left: 32, right: 32, top: 90})}>
      {rows.map(([title, sub], i) => {
        const p = ease(f, at + i * 3, 22 + ((i * 7) % 13));
        return (
          <div key={title} style={{height: 98, marginBottom: 12, borderRadius: 14, background: T.row, border: `1px solid ${T.rowBorder}`, display: 'flex', alignItems: 'center', padding: '0 24px', ...rise(f, at + i * 3)}}>
            <span style={{width: 40, height: 40, borderRadius: 10, background: T.orange, display: 'grid', placeItems: 'center', font: `800 22px ${T.font}`, color: '#fff', marginRight: 20}}>{i + 1}</span>
            <span style={{width: 250}}>
              <div style={{font: `700 28px ${T.font}`, color: T.text}}>{title}</div>
              <div style={{font: `500 16px ${T.mono}`, color: T.dim}}>{sub}</div>
            </span>
            <span style={{flex: 1, height: 8, borderRadius: 4, background: '#1C1514', marginRight: 24}}>
              <span style={{display: 'block', height: 8, borderRadius: 4, width: `${p * 100}%`, background: T.orangeBar}} />
            </span>
            <span style={{width: 40, height: 40, borderRadius: 20, display: 'grid', placeItems: 'center', background: p >= 1 ? T.green : 'transparent', border: p >= 1 ? 'none' : `2px solid ${T.dim}`, color: '#fff', fontSize: 24, ...(p >= 1 ? pop(f, at + i * 3 + 22 + ((i * 7) % 13), 5) : {})}}>{p >= 1 ? '✓' : ''}</span>
          </div>
        );
      })}
    </div>
  );
};

// 14 · Slider ИИ → человек: gradient track, white knob slides right, then headline (white + orange line).
export const Slider: React.FC<{at: number; title: string; accent: string}> = ({at, title, accent}) => {
  const f = useCurrentFrame();
  const p = ease(f, at + 6, 30);
  return (
    <>
      <div style={abs({left: 70, right: 70, top: 150, height: 16, borderRadius: 8, background: `linear-gradient(90deg, ${T.slider.join(', ')})`})} />
      <div style={abs({left: 70 + p * (760 - 44), top: 136, width: 44, height: 44, borderRadius: 22, background: T.text, boxShadow: '0 0 18px rgba(255,255,255,0.7)'})} />
      <div style={abs({left: 70, top: 190, font: `800 22px ${T.font}`, color: T.red})}>ИИ</div>
      <div style={abs({right: 70, top: 190, font: `800 22px ${T.font}`, color: T.green})}>человек</div>
      <div style={abs({top: 320, width: '100%', textAlign: 'center', font: `800 84px ${T.font}`, lineHeight: 1.1, letterSpacing: -1})}>
        <div style={{color: T.text, ...rise(f, at + 26)}}>{title}</div>
        <div style={{color: T.orangeText, ...rise(f, at + 40)}}>{accent}</div>
      </div>
    </>
  );
};

// 15 · Claude chat window: greeting typed next to the spark, link pasted into the input, reply "готово".
export const ChatWindow: React.FC<{at: number; greet: string; link: string; ask: string; done: string}> = ({at, greet, link, ask, done}) => {
  const f = useCurrentFrame();
  const sendAt = at + 50;
  return (
    <>
      <div style={abs({left: 40, top: 32, display: 'flex', alignItems: 'center', gap: 12, font: `700 24px ${T.font}`, color: T.text})}><AppTile kind="claude" size={34} />Claude</div>
      {f < sendAt ? (
        <div style={abs({top: 220, width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 18, font: `700 44px ${T.font}`, color: T.text})}>
          <AppTile kind="claude" size={52} />
          {typed(f, at, greet, 30)}
        </div>
      ) : (
        <>
          <div style={abs({right: 40, top: 110, maxWidth: 560, padding: '18px 24px', borderRadius: 20, background: '#1D1A1A', font: `600 24px ${T.font}`, color: T.text, ...rise(f, sendAt)})}>
            <div style={{color: '#9DB4FF'}}>{link}</div>{ask}
          </div>
          <div style={abs({left: 40, top: 280, display: 'flex', gap: 14, alignItems: 'center', font: `700 30px ${T.font}`, color: T.text, ...rise(f, sendAt + 14)})}>
            <AppTile kind="claude" size={40} />{done} <span style={{width: 34, height: 34, borderRadius: 17, background: T.green, display: 'grid', placeItems: 'center', fontSize: 20}}>✓</span>
          </div>
        </>
      )}
      <div style={abs({left: 30, right: 30, bottom: 30, height: 86, borderRadius: 18, background: T.row, border: `1px solid ${T.rowBorder}`, display: 'flex', alignItems: 'center', padding: '0 26px', font: `500 24px ${T.font}`, color: f > at + 24 && f < sendAt ? '#9DB4FF' : T.dim})}>
        {f > at + 24 && f < sendAt ? typed(f, at + 24, link, 60) : 'Напишите сообщение…'}
        <span style={{marginLeft: 'auto', width: 44, height: 44, borderRadius: 10, background: T.orange}} />
      </div>
    </>
  );
};
