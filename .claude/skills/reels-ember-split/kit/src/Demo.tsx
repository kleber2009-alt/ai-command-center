// Demo of the style: face hook → cube → split (connect → chips → checks → slider) → zoom-through → face CTA.
// Word frames are hard-coded here; in a real reel they come from words.json (see SKILL.md, step 3).
import React from 'react';
import {AbsoluteFill, Loop, OffthreadVideo, Sequence, staticFile} from 'remotion';
import {T, Word} from './tokens';
import {Background, CaptionLine, FaceCaption, FaceFrame, GlowCard, MetaDisclaimer} from './ui/core';
import {CubeSwitch, ZoomSwitch} from './ui/transitions';
import {Checks, Chips, Connect, Slider} from './ui/widgets';

export const DEMO_FRAMES = 420;

// Sequential words: [text, frame, highlighted?]
const w = (...xs: [string, number, boolean?][]): Word[] => xs.map(([text, at, hl]) => ({text, at, hl}));

const Face: React.FC<{src: string; inFrame?: boolean}> = ({src, inFrame}) => (
  <Loop durationInFrames={90}>
    <OffthreadVideo
      src={staticFile(src)}
      muted
      style={{width: '100%', height: '100%', objectFit: 'cover', objectPosition: '50% 30%', transform: inFrame ? 'scale(1.18)' : undefined, transformOrigin: '50% 38%'}}
    />
  </Loop>
);

const Hook: React.FC<{face: string}> = ({face}) => (
  <AbsoluteFill>
    <Face src={face} />
    <MetaDisclaimer />
    <FaceCaption
      lines={[
        {words: w(['Claude', 3], ['оставил', 12])},
        {words: w(['SMM-щиков', 22])},
        {words: w(['без', 34], ['работы', 40]), block: 'red'},
      ]}
    />
  </AbsoluteFill>
);

const Split: React.FC<{face: string}> = ({face}) => (
  <AbsoluteFill>
    <Background />
    <Sequence from={0} durationInFrames={75} layout="none">
      <GlowCard label="прямое подключение" swapAt={0}>
        <Connect at={4} title="напрямую" accent="к Instagram" accentAt={40} />
      </GlowCard>
      <CaptionLine words={w(['может', 6], ['подключаться', 16, true])} />
    </Sequence>
    <Sequence from={75} durationInFrames={70} layout="none">
      <GlowCard label="это не один скилл" swapAt={0}>
        <Chips at={10} items={['ig-reel', 'ig-viral', 'ig-caption', 'ig-carousel', 'ig-story', 'ig-profile', 'ig-plan', 'ig-human', 'ig-comment', 'ig-reply', 'ig-audit']} />
      </GlowCard>
      <CaptionLine words={w(['их', 4], ['целых', 12], ['11 штук', 30, true])} />
    </Sequence>
    <Sequence from={145} durationInFrames={70} layout="none">
      <GlowCard label="5 проверок текста" swapAt={0}>
        <Checks at={6} rows={[['Ритм', 'burstiness'], ['Конкретика', 'specificity'], ['Штампы', 'cliché density'], ['Почерк ИИ', 'fingerprint'], ['Голос автора', 'voice']]} />
      </GlowCard>
      <CaptionLine words={w(['5', 4], ['разных', 10], ['субагентов', 22, true])} />
    </Sequence>
    <Sequence from={215} durationInFrames={95} layout="none">
      <GlowCard label="результат проверки" swapAt={0}>
        <Slider at={4} title="текст написан" accent="не как ИИ" />
      </GlowCard>
      <CaptionLine words={w(['что', 4], ['текст', 10], ['написан', 18])} />
    </Sequence>
    <FaceFrame>
      <Face src={face} inFrame />
    </FaceFrame>
  </AbsoluteFill>
);

const Cta: React.FC<{face: string}> = ({face}) => (
  <AbsoluteFill>
    <Face src={face} />
    <MetaDisclaimer />
    <FaceCaption
      lines={[
        {words: w(['Напиши', 4], ['в', 10], ['комментариях', 13])},
        {words: w(['«Инстаграм»', 26]), block: 'white'},
        {words: w(['я', 40], ['тебе', 44], ['всё', 50], ['скину', 55])},
      ]}
    />
  </AbsoluteFill>
);

export const Demo: React.FC<{face: string}> = ({face}) => (
  <AbsoluteFill style={{background: T.bg}}>
    <ZoomSwitch
      at={330}
      a={
        <CubeSwitch
          at={56}
          a={<Hook face={face} />}
          b={
            <Sequence from={56} layout="none">
              <Split face={face} />
            </Sequence>
          }
        />
      }
      b={
        <Sequence from={330} layout="none">
          <Cta face={face} />
        </Sequence>
      }
    />
  </AbsoluteFill>
);
