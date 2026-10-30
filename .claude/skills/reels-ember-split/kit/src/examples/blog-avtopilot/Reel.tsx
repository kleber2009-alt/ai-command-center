// «Блог на автопилоте» in the «Огненный сплит» style. All frames are absolute (30 fps); word frames come from words.json.
import React from 'react';
import {AbsoluteFill, OffthreadVideo, staticFile, useCurrentFrame} from 'remotion';
import {T, Word} from '../../tokens';
import {Background, CaptionLine, FaceCaption, FaceFrame, FaceLine, GlowCard, MetaDisclaimer} from '../../ui/core';
import {CubeSwitch, ZoomSwitch} from '../../ui/transitions';
import words from './words.json';
import {Autopilot, Dialogs, DirectChat, Followers, Growth, Modules, Payments, ReelsFound, Render, Schedule, ScriptCard} from '../../ui/cards';

export const REEL_FRAMES = 1648;

const at = (i: number) => (words as {f: number}[])[i].f;
// word i shown as `text` (spelling fixed by hand), `hl` = orange pill
const w = (i: number, text: string, hl = false): Word => ({text, at: at(i), hl});

const Range: React.FC<{from: number; to: number; children: React.ReactNode}> = ({from, to, children}) => {
  const f = useCurrentFrame();
  return f >= from && f < to ? <>{children}</> : null;
};

const FaceFull: React.FC = () => (
  <OffthreadVideo src={staticFile('face.mp4')} muted style={{position: 'absolute', width: T.w, height: T.h, objectFit: 'cover'}} />
);
// Head and shoulders inside the frame: source window x 98..982, y 250..1060.
const FaceCrop: React.FC = () => {
  const z = T.face.w / 884;
  return <OffthreadVideo src={staticFile('face.mp4')} muted style={{position: 'absolute', width: 1080 * z, height: 1920 * z, left: -98 * z, top: -250 * z}} />;
};

type Phrase = Word[];
type Card = {from: number; label?: string; node: React.ReactNode};

// Split screen: active card (by start frame), active phrase (until the next phrase starts), face in the frame.
const Split: React.FC<{to: number; cards: Card[]; phrases: Phrase[]}> = ({to, cards, phrases}) => (
  <AbsoluteFill>
    <Background />
    {cards.map((c, i) => (
      <Range key={c.from} from={c.from} to={cards[i + 1]?.from ?? to}>
        <GlowCard label={c.label} swapAt={c.from}>{c.node}</GlowCard>
      </Range>
    ))}
    {phrases.map((p, i) => (
      <Range key={i} from={p[0].at} to={phrases[i + 1]?.[0].at ?? to}>
        <CaptionLine words={p} />
      </Range>
    ))}
    <FaceFrame>
      <FaceCrop />
    </FaceFrame>
  </AbsoluteFill>
);

// Full-screen face with caption groups; each group replaces the previous one by a hard cut.
const Face: React.FC<{to: number; groups: FaceLine[][]}> = ({to, groups}) => (
  <AbsoluteFill>
    <FaceFull />
    <MetaDisclaimer />
    {groups.map((g, i) => (
      <Range key={i} from={g[0].words[0].at} to={groups[i + 1]?.[0].words[0].at ?? to}>
        <FaceCaption lines={g} />
      </Range>
    ))}
  </AbsoluteFill>
);

type Block = {to: number; node: React.ReactNode; next?: 'cube' | 'zoom'};

const BLOCKS: Block[] = [
  {
    to: 106,
    next: 'cube',
    node: (
      <Face
        to={106}
        groups={[[{words: [w(0, 'В'), w(1, 'Америке'), w(2, 'сейчас')]}, {words: [w(3, 'вирусится'), w(4, 'тренд')]}, {words: [w(5, 'блог'), w(6, 'на'), w(7, 'автопилоте')], block: 'red'}]]}
      />
    ),
  },
  {
    to: 210,
    next: 'cube',
    node: (
      <Split
        to={210}
        cards={[{from: 100, label: 'нейросети ведут блог', node: <Autopilot at={104} onAt={at(12)} />}]}
        phrases={[[w(8, 'то'), w(9, 'есть'), w(10, 'нейросети')], [w(11, 'которые'), w(12, 'ведут'), w(13, 'его')], [w(14, 'за'), w(15, 'вас'), {text: '24/7', at: at(16), hl: true}]]}
      />
    ),
  },
  {
    to: 330,
    next: 'cube',
    node: (
      <Face
        to={330}
        groups={[
          [{words: [w(19, 'Я'), w(20, 'сделал'), w(21, 'себе')]}, {words: [w(22, 'такой'), w(23, 'же')]}],
          [{words: [w(24, 'и'), w(25, 'вырос'), w(26, 'до')]}, {words: [{text: '300 000', at: at(27)}, w(29, 'подписчиков')], block: 'red'}],
        ]}
      />
    ),
  },
  {
    to: 1026,
    next: 'cube',
    node: (
      <Split
        to={1026}
        cards={[
          {from: 324, label: 'мой блог', node: <Followers at={330} to={300000} minutesAt={at(32)} />},
          {from: at(36), label: 'из чего состоит', node: <Modules at={at(36) + 4} />},
          {from: at(43), node: <Schedule at={at(46)} runAt={at(55)} />},
          {from: at(59), node: <ReelsFound at={at(60)} />},
          {from: at(67), node: <ScriptCard at={at(69)} writeAt={at(77)} tagAt={at(79)} />},
          {from: at(81), node: <Render at={at(84)} fileAt={at(88)} from={at(91)} to={at(95) + 10} />},
        ]}
        phrases={[
          [w(30, 'тратя'), w(31, 'всего'), {text: '15 минут', at: at(32), hl: true}, w(35, 'в день')],
          [w(36, 'и'), w(37, 'вот'), w(38, 'наглядно')],
          [w(39, 'из'), w(40, 'чего'), w(41, 'он'), w(42, 'состоит', true)],
          [w(43, 'первое'), w(45, 'это')],
          [w(46, 'задачи'), w(47, 'по'), w(48, 'расписанию', true)],
          [w(49, 'в'), w(50, 'Claude', true)],
          [w(51, 'каждое'), w(52, 'утро')],
          [w(53, 'он'), w(54, 'сам'), w(55, 'запускается', true)],
          [w(56, 'и'), w(57, 'собирает'), w(58, 'ролики')],
          [w(59, 'которые'), w(60, 'залетели', true)],
          [w(61, 'в'), w(62, 'моей'), w(63, 'нише')],
          [w(64, 'за'), w(65, 'последние'), w(66, 'сутки', true)],
          [w(67, 'дальше')],
          [w(69, 'скилл'), w(70, 'сценариста', true)],
          [w(71, 'где'), w(72, 'Claude'), w(73, 'берёт')],
          [w(74, 'эти'), w(75, 'темы')],
          [w(76, 'и'), w(77, 'пишет'), w(78, 'сценарий')],
          [w(79, 'моими'), w(80, 'словами', true)],
          [w(81, 'следующее'), w(83, 'это'), w(84, 'HeyGen', true)],
          [w(85, 'загружаешь'), w(86, 'к'), w(87, 'нему'), w(88, 'сценарий')],
          [w(89, 'и'), w(90, 'ваш'), w(91, 'аватар', true)],
          [w(92, 'записывает'), w(93, 'ролик')],
          [w(94, 'вместо'), w(95, 'вас', true)],
        ]}
      />
    ),
  },
  {
    to: 1116,
    next: 'cube',
    node: (
      <Face
        to={1116}
        groups={[[{words: [w(96, 'И'), w(97, 'моё'), w(98, 'любимое')]}, {words: [w(100, 'это')]}, {words: [w(101, 'ИИ-агент'), w(103, 'в'), w(104, 'Директе')], block: 'red'}]]}
      />
    ),
  },
  {
    to: 1562,
    next: 'zoom',
    node: (
      <Split
        to={1562}
        cards={[
          {from: 1110, node: <DirectChat at={at(107)} materialAt={at(112)} sellAt={at(115)} />},
          {from: at(118), label: 'ИИ-агент сейчас', node: <Dialogs at={at(123)} to={1500} />},
          {from: at(129), label: 'оплаты', node: <Payments at={at(131)} />},
          {from: at(134), label: 'система', node: <Modules at={at(134) + 4} allOnAt={at(142)} />},
          {from: at(146), label: 'рост блога', node: <Growth at={at(147)} to={100000} />},
        ]}
        phrases={[
          [w(105, 'человек'), w(106, 'пишет')],
          [{text: 'кодовое слово', at: at(107), hl: true}],
          [w(109, 'а'), w(110, 'агент'), w(111, 'сам')],
          [w(112, 'выдаёт'), w(113, 'материал', true)],
          [w(114, 'и'), w(115, 'дальше'), w(116, 'ему'), w(117, 'продаёт', true)],
          [w(118, 'сейчас'), w(119, 'у'), w(120, 'меня')],
          [w(121, 'он'), w(122, 'ведёт'), w(123, 'до')],
          [{text: '1 500', at: at(124), hl: true}, w(126, 'диалогов')],
          [w(127, 'в'), w(128, 'день')],
          [w(129, 'и'), w(130, 'я'), w(131, 'получаю')],
          [w(132, 'автоматические'), w(133, 'оплаты', true)],
          [w(134, 'так'), w(135, 'что'), w(136, 'если'), w(137, 'хотите')],
          [w(138, 'создать'), w(139, 'себе'), w(140, 'такую'), w(141, 'же')],
          [w(142, 'систему', true), w(143, 'под'), w(144, 'свою'), w(145, 'нишу')],
          [w(146, 'и'), w(147, 'вырастить'), w(148, 'блог')],
          [w(149, 'до'), {text: '100 000', at: at(150), hl: true}, w(152, 'подписчиков')],
        ]}
      />
    ),
  },
  {
    to: REEL_FRAMES,
    node: (
      <Face
        to={REEL_FRAMES}
        groups={[[{words: [w(153, 'Пишите'), w(154, 'слово')]}, {words: [w(155, '«Практикум»')], block: 'white'}, {words: [w(156, 'в'), w(157, 'комментариях')]}]]}
      />
    ),
  },
];

const DUR = {cube: T.dur.cube, zoom: T.dur.zoom};

export const Reel: React.FC = () => {
  const f = useCurrentFrame();
  const i = Math.max(0, BLOCKS.findIndex((b) => f < b.to));
  // switch window is centred on the boundary between blocks
  const around = (k: number) => {
    const b = BLOCKS[k];
    if (!b?.next) return null;
    const dur = DUR[b.next];
    const start = b.to - Math.round(dur / 2);
    if (f < start || f >= start + dur) return null;
    const S = b.next === 'cube' ? CubeSwitch : ZoomSwitch;
    return <S a={b.node} b={BLOCKS[k + 1].node} at={start} dur={dur} />;
  };
  return <AbsoluteFill style={{background: T.bg}}>{around(i) ?? around(i - 1) ?? BLOCKS[i].node}</AbsoluteFill>;
};
