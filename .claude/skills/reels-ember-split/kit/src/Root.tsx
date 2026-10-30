import React from 'react';
import {Composition} from 'remotion';
import {Demo, DEMO_FRAMES} from './Demo';
import {T} from './tokens';

export const Root: React.FC = () => (
  <Composition id="Demo" component={Demo} durationInFrames={DEMO_FRAMES} fps={T.fps} width={T.w} height={T.h} defaultProps={{face: 'face.mp4'}} />
);
