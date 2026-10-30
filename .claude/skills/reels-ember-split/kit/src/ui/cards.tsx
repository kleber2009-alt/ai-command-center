// More cards (first used in the «Блог на автопилоте» reel). avatar.jpg in public/ is needed by Followers and Render.
import React from 'react';
import {Img, interpolate, staticFile, useCurrentFrame} from 'remotion';
import {T} from '../tokens';
import {clamp, ease} from './core';
import {AppTile, Cursor, abs, pop, rise, typed} from './widgets';

const fmt = (n: number) => Math.round(n).toLocaleString('ru-RU').replace(/ /g, ' ');
const Check: React.FC<{s?: number}> = ({s = 34}) => (
  <span style={{width: s, height: s, borderRadius: s / 2, background: T.green, color: '#fff', display: 'inline-grid', placeItems: 'center', fontSize: s * 0.6, flex: 'none'}}>✓</span>
);
const Row: React.FC<{style?: React.CSSProperties; children: React.ReactNode}> = ({style, children}) => (
  <div style={{borderRadius: 14, background: T.row, border: `1px solid ${T.rowBorder}`, display: 'flex', alignItems: 'center', ...style}}>{children}</div>
);

// 24/7 ring fills, the "Автопилот" toggle flips on.
export const Autopilot: React.FC<{at: number; onAt: number}> = ({at, onAt}) => {
  const f = useCurrentFrame();
  const p = ease(f, at, 40);
  const on = ease(f, onAt, 6);
  const R = 150;
  const C = 2 * Math.PI * R;
  return (
    <>
      <svg style={abs({left: 450 - 180, top: 90, ...pop(f, at)})} width={360} height={360} viewBox="-180 -180 360 360">
        <circle r={R} fill="none" stroke="#1C1514" strokeWidth={16} />
        <circle r={R} fill="none" stroke={T.orange} strokeWidth={16} strokeLinecap="round" strokeDasharray={`${C * p} ${C}`} transform="rotate(-90)" style={{filter: `drop-shadow(0 0 12px ${T.orange})`}} />
      </svg>
      <div style={abs({left: 0, width: 900, top: 215, textAlign: 'center', font: `800 110px ${T.font}`, color: T.text, letterSpacing: -3, ...rise(f, at + 4)})}>24/7</div>
      <div style={abs({left: 450 - 170, top: 500, width: 340, height: 88, borderRadius: 44, background: T.row, border: `1px solid ${T.rowBorder}`, display: 'flex', alignItems: 'center', padding: '0 14px 0 32px', font: `700 30px ${T.font}`, color: T.text, ...rise(f, at + 10)})}>
        Автопилот
        <span style={{marginLeft: 'auto', width: 104, height: 60, borderRadius: 30, background: on > 0.5 ? T.green : '#2A2424', position: 'relative'}}>
          <span style={{position: 'absolute', top: 6, left: 6 + on * 44, width: 48, height: 48, borderRadius: 24, background: T.text}} />
        </span>
      </div>
    </>
  );
};

// Profile counter: followers count up to `to`, then a "15 минут в день" row with clock.
export const Followers: React.FC<{at: number; to: number; minutesAt: number}> = ({at, to, minutesAt}) => {
  const f = useCurrentFrame();
  const p = ease(f, at, 36);
  return (
    <>
      <div style={abs({left: 60, top: 110, display: 'flex', alignItems: 'center', gap: 24, ...rise(f, at - 4)})}>
        <Img src={staticFile('avatar.jpg')} style={{width: 110, height: 110, borderRadius: 55, border: `4px solid ${T.orange}`}} />
        <div>
          <div style={{font: `800 38px ${T.font}`, color: T.text}}>ilia.paliy</div>
          <div style={{font: `600 24px ${T.font}`, color: T.sub}}>блог на автопилоте</div>
        </div>
        <div style={{marginLeft: 120}}><AppTile kind="ig" size={72} /></div>
      </div>
      <div style={abs({left: 0, width: 900, top: 270, textAlign: 'center'})}>
        <div style={{font: `800 132px ${T.font}`, color: T.orangeText, letterSpacing: -4, lineHeight: 1}}>{fmt(to * p)}</div>
        <div style={{font: `700 32px ${T.font}`, color: T.text, marginTop: 8}}>подписчиков</div>
      </div>
      <Row style={{position: 'absolute', left: 150, right: 150, top: 540, height: 90, padding: '0 28px', gap: 18, ...rise(f, minutesAt)}}>
        <span style={{font: `700 34px ${T.font}`, color: T.orangeText}}>◷</span>
        <span style={{font: `700 30px ${T.font}`, color: T.text}}>15 минут в день</span>
        <span style={{marginLeft: 'auto'}}><Check /></span>
      </Row>
    </>
  );
};

// The four modules of the system; `active` index gets the orange edge, `allOnAt` lights all of them.
export const MODULES = ['Задачи по расписанию', 'Скилл сценариста', 'HeyGen', 'ИИ-агент в Директе'];
export const Modules: React.FC<{at: number; active?: number; allOnAt?: number}> = ({at, active = -1, allOnAt}) => {
  const f = useCurrentFrame();
  const all = allOnAt !== undefined && f >= allOnAt;
  return (
    <div style={abs({left: 40, right: 40, top: 96})}>
      {MODULES.map((m, i) => {
        const lit = all ? f >= (allOnAt ?? 0) + i * 4 : i === active;
        return (
          <Row key={m} style={{height: 112, marginBottom: 20, padding: '0 28px', gap: 24, border: `2px solid ${lit ? T.orange : T.rowBorder}`, boxShadow: lit ? `0 0 22px rgba(246,90,10,0.45)` : 'none', ...rise(f, at + i * 4)}}>
            <span style={{width: 56, height: 56, borderRadius: 14, background: lit ? T.orange : '#2A2020', display: 'grid', placeItems: 'center', font: `800 28px ${T.font}`, color: T.text}}>{i + 1}</span>
            <span style={{font: `800 36px ${T.font}`, color: T.text}}>{m}</span>
            {lit ? <span style={{marginLeft: 'auto'}}><Check s={40} /></span> : null}
          </Row>
        );
      })}
    </div>
  );
};

// Scheduled task in Claude: 07:00 typed, "каждый день", then the status flips to "запущено".
export const Schedule: React.FC<{at: number; runAt: number}> = ({at, runAt}) => {
  const f = useCurrentFrame();
  const run = f >= runAt;
  return (
    <>
      <div style={abs({left: 40, top: 36, display: 'flex', alignItems: 'center', gap: 12, font: `700 26px ${T.font}`, color: T.text})}><AppTile kind="claude" size={38} />Claude · задачи по расписанию</div>
      <Row style={{position: 'absolute', left: 40, right: 40, top: 120, height: 330, padding: '0 40px', flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'center', ...rise(f, at)}}>
        <div style={{display: 'flex', width: '100%', alignItems: 'center'}}>
          <span style={{font: `600 26px ${T.font}`, color: T.sub}}>каждый день</span>
          <span style={{marginLeft: 'auto', padding: '6px 18px', borderRadius: 20, background: run ? T.green : '#2A2424', font: `700 22px ${T.font}`, color: T.text, ...(run ? pop(f, runAt) : {})}}>{run ? 'запущено' : 'ожидает'}</span>
        </div>
        <div style={{font: `800 150px ${T.font}`, color: T.text, letterSpacing: -4, lineHeight: 1.05}}>{typed(f, at + 4, '07:00', 12)}{f < at + 18 ? <Cursor h={120} /> : null}</div>
      </Row>
      <div style={abs({left: 60, right: 60, top: 490, font: `700 30px ${T.font}`, color: T.text, lineHeight: 1.35, ...rise(f, at + 16)})}>
        <span style={{font: `700 24px ${T.mono}`, color: T.chipText, background: T.chipBg, padding: '4px 12px', borderRadius: 8, marginRight: 12}}>/viral</span>
        найди ролики, которые залетели в моей нише за сутки
      </div>
    </>
  );
};

// Grid of found viral reels with view counts, pop-stagger.
export const ReelsFound: React.FC<{at: number}> = ({at}) => {
  const f = useCurrentFrame();
  const views = ['1,2 млн', '860 тыс', '2,4 млн', '540 тыс', '1,7 млн', '930 тыс'];
  const tint = ['#5A2A14', '#3B2A55', '#5C3A12', '#24343A', '#4A1E22', '#3A3016'];
  return (
    <>
      <div style={abs({left: 0, width: 900, top: 30, textAlign: 'center', font: `600 28px ${T.font}`, color: T.sub})}>залетели за последние сутки</div>
      <div style={abs({left: 60, right: 60, top: 90, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 22})}>
        {views.map((v, i) => (
          <div key={i} style={{height: 270, borderRadius: 18, background: `linear-gradient(170deg, ${tint[i]}, #120D0C)`, border: `1px solid ${T.rowBorder}`, position: 'relative', ...pop(f, at + i * 3)}}>
            <span style={abs({left: '50%', top: '42%', transform: 'translate(-50%,-50%)', font: `800 48px ${T.font}`, color: 'rgba(255,255,255,0.75)'})}>▶</span>
            <span style={abs({left: 14, bottom: 14, padding: '4px 12px', borderRadius: 12, background: T.orange, font: `800 22px ${T.font}`, color: T.text})}>{v}</span>
          </div>
        ))}
      </div>
    </>
  );
};

// Scenarist skill: chip + theme, then the script types in "my words".
export const ScriptCard: React.FC<{at: number; writeAt: number; tagAt: number}> = ({at, writeAt, tagAt}) => {
  const f = useCurrentFrame();
  const script = 'Хук: в Америке вирусится тренд — блог на автопилоте. Нейросети ведут его за вас 24/7…';
  return (
    <div style={abs({left: 32, right: 32, top: 40})}>
      <Row style={{padding: '24px 28px', flexDirection: 'column', alignItems: 'flex-start', ...rise(f, at)}}>
        <div>
          <span style={{font: `700 24px ${T.mono}`, color: T.chipText, background: T.chipBg, padding: '4px 12px', borderRadius: 8}}>/сценарист</span>
          <span style={{font: `600 26px ${T.font}`, color: T.sub, marginLeft: 14}}>тема дня</span>
        </div>
        <div style={{font: `700 36px ${T.font}`, color: T.text, marginTop: 16}}>Блог на автопилоте</div>
      </Row>
      <div style={{marginTop: 22, display: 'flex', gap: 16, ...rise(f, writeAt - 4)}}>
        <AppTile kind="claude" size={52} />
        <div style={{font: `700 38px ${T.font}`, color: T.text, lineHeight: 1.3, flex: 1}}>
          {typed(f, writeAt, script, 34)}
          {typed(f, writeAt, script, 34).length < script.length && f >= writeAt ? <Cursor h={36} /> : null}
        </div>
      </div>
      <div style={{display: 'inline-block', marginTop: 20, marginLeft: 68, padding: '6px 18px', borderRadius: 20, background: '#E46A2C', font: `700 24px ${T.font}`, color: T.text, ...pop(f, tagAt)}}>моими словами</div>
    </div>
  );
};

// HeyGen render: script file lands on the avatar card, progress 0 → 100 %.
export const Render: React.FC<{at: number; fileAt: number; from: number; to: number}> = ({at, fileAt, from, to}) => {
  const f = useCurrentFrame();
  const p = interpolate(f, [from, to], [0, 1], clamp);
  return (
    <>
      <div style={abs({left: 40, top: 36, display: 'flex', alignItems: 'center', gap: 12, font: `800 30px ${T.font}`, color: T.text})}>
        <span style={{padding: '2px 10px', borderRadius: 8, background: '#C42A1A', font: `800 18px ${T.font}`}}>● REC</span>HeyGen
      </div>
      <Row style={{position: 'absolute', left: 40, right: 40, top: 120, height: 300, padding: '0 34px', gap: 34, ...rise(f, at)}}>
        <Img src={staticFile('avatar.jpg')} style={{width: 220, height: 220, borderRadius: 24, objectFit: 'cover'}} />
        <div style={{flex: 1}}>
          <div style={{display: 'inline-block', padding: '6px 16px', borderRadius: 10, background: '#2A2424', font: `600 24px ${T.mono}`, color: T.text, ...pop(f, fileAt)}}>сценарий.txt</div>
          <div style={{font: `700 30px ${T.font}`, color: T.text, marginTop: 20}}>{p >= 1 ? 'Ролик готов' : 'Аватар записывает ролик'}</div>
          <div style={{height: 10, borderRadius: 5, background: '#1C1514', marginTop: 20}}>
            <div style={{height: 10, borderRadius: 5, width: `${p * 100}%`, background: T.orangeBar}} />
          </div>
          <div style={{display: 'flex', alignItems: 'center', gap: 12, marginTop: 12, font: `800 30px ${T.font}`, color: p >= 1 ? T.green : T.text}}>{Math.round(p * 100)}%{p >= 1 ? <Check s={30} /> : null}</div>
        </div>
      </Row>
      <div style={abs({left: 0, width: 900, top: 470, textAlign: 'center', font: `800 64px ${T.font}`, color: T.text, letterSpacing: -1, lineHeight: 1.1})}>
        <div style={rise(f, at + 6)}>{p >= 1 ? 'ролик записан' : 'аватар записывает'}</div>
        <div style={{color: T.orangeText, ...rise(f, to - 10)}}>вместо вас</div>
      </div>
    </>
  );
};

// Direct: the code word comes in, the AI agent replies with the material, then sells.
export const DirectChat: React.FC<{at: number; materialAt: number; sellAt: number}> = ({at, materialAt, sellAt}) => {
  const f = useCurrentFrame();
  const bubble = (mine: boolean): React.CSSProperties => ({
    alignSelf: mine ? 'flex-end' : 'flex-start',
    maxWidth: 620,
    padding: '18px 24px',
    borderRadius: 26,
    font: `700 30px ${T.font}`,
    color: T.text,
    background: mine ? 'linear-gradient(120deg, #7B3FE4, #A04BD8)' : '#231E1E',
    marginBottom: 18,
  });
  return (
    <>
      <div style={abs({left: 40, right: 40, top: 30, display: 'flex', alignItems: 'center', gap: 14})}>
        <span style={{width: 50, height: 50, borderRadius: 25, background: 'linear-gradient(140deg, #F09433, #DC2743)'}} />
        <span><div style={{font: `700 26px ${T.font}`, color: T.text}}>katya.reels</div><div style={{font: `500 20px ${T.font}`, color: T.sub}}>Instagram Direct</div></span>
        <span style={{marginLeft: 'auto', padding: '6px 16px', borderRadius: 16, background: T.orange, font: `800 22px ${T.font}`, color: T.text}}>ИИ-агент</span>
      </div>
      <div style={abs({left: 40, right: 40, top: 130, display: 'flex', flexDirection: 'column'})}>
        <div style={{...bubble(false), font: `800 32px ${T.font}`, letterSpacing: 1, ...pop(f, at)}}>ПРАКТИКУМ</div>
        {f >= materialAt ? (
          <div style={{...bubble(true), ...rise(f, materialAt)}}>
            Держи материал{' '}
            <span style={{marginLeft: 8, padding: '2px 12px', borderRadius: 10, background: 'rgba(255,255,255,0.22)', font: `700 24px ${T.mono}`}}>гайд.pdf</span>
          </div>
        ) : null}
        {f >= sellAt ? <div style={{...bubble(true), ...rise(f, sellAt)}}>{typed(f, sellAt, 'Хочешь так же под свою нишу? Вот ссылка на практикум', 40)}</div> : null}
      </div>
    </>
  );
};

// Big counter "диалогов в день".
export const Dialogs: React.FC<{at: number; to: number}> = ({at, to}) => {
  const f = useCurrentFrame();
  const p = ease(f, at, 34);
  return (
    <div style={abs({left: 0, width: 900, top: 190, textAlign: 'center'})}>
      <div style={{font: `800 190px ${T.font}`, color: p >= 1 ? T.orangeText : T.text, letterSpacing: -6, lineHeight: 1}}>{fmt(to * p)}</div>
      <div style={{font: `700 40px ${T.font}`, color: T.text, marginTop: 20, ...rise(f, at + 6)}}>диалогов в день</div>
    </div>
  );
};

// Payments arrive one after another.
export const Payments: React.FC<{at: number}> = ({at}) => {
  const f = useCurrentFrame();
  const rows = [['Оплата получена', 'Практикум · 14:02'], ['Оплата получена', 'Практикум · 14:09'], ['Оплата получена', 'Разбор ниши · 14:15'], ['Оплата получена', 'Практикум · 14:21']];
  return (
    <div style={abs({left: 40, right: 40, top: 96})}>
      {rows.map(([t, s], i) => (
        <Row key={i} style={{height: 112, marginBottom: 18, padding: '0 28px', gap: 22, ...rise(f, at + i * 6)}}>
          <Check s={48} />
          <span>
            <div style={{font: `800 34px ${T.font}`, color: T.text}}>{t}</div>
            <div style={{font: `600 22px ${T.font}`, color: T.sub}}>{s}</div>
          </span>
          <span style={{marginLeft: 'auto', font: `800 30px ${T.font}`, color: T.green}}>авто</span>
        </Row>
      ))}
    </div>
  );
};

// Growth curve to 100 000 subscribers.
export const Growth: React.FC<{at: number; to: number}> = ({at, to}) => {
  const f = useCurrentFrame();
  const p = ease(f, at, 40);
  const W = 780;
  const H = 360;
  const pts = Array.from({length: 41}, (_, i) => {
    const x = i / 40;
    return [x * W, H - Math.pow(x, 2.4) * H] as const;
  }).filter(([x]) => x <= p * W);
  const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x},${y}`).join(' ');
  const last = pts[pts.length - 1] ?? [0, H];
  return (
    <>
      <svg style={abs({left: 60, top: 140})} width={W + 40} height={H + 20} viewBox={`-20 -10 ${W + 40} ${H + 20}`}>
        <line x1={0} y1={H} x2={W} y2={H} stroke="#2A2222" strokeWidth={3} />
        <path d={d} fill="none" stroke={T.orange} strokeWidth={8} strokeLinecap="round" style={{filter: `drop-shadow(0 0 10px ${T.orange})`}} />
        <circle cx={last[0]} cy={last[1]} r={14} fill={T.text} />
      </svg>
      <div style={abs({right: 70, top: 70, font: `800 72px ${T.font}`, color: T.orangeText, letterSpacing: -2})}>{fmt(to * p)}</div>
    </>
  );
};
