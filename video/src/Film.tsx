import type { FC } from 'react';
import { AbsoluteFill, Series } from 'remotion';
import { Grain, ProgressBar } from './components';
import { C } from './theme';
import { Hero } from './scenes/Hero';
import { Why } from './scenes/Why';
import { World } from './scenes/World';
import { Focus } from './scenes/Focus';
import { D20 } from './scenes/D20';
import { Demo } from './scenes/Demo';
import { Play } from './scenes/Play';
import { Recap } from './scenes/Recap';
import { Stats } from './scenes/Stats';
import { Outro } from './scenes/Outro';

type SceneComponent = FC<{ duration: number }>;

const SCENES: { Component: SceneComponent; duration: number }[] = [
  { Component: Hero, duration: 180 },
  { Component: Why, duration: 420 },
  { Component: World, duration: 540 },
  { Component: D20, duration: 270 },
  { Component: Focus, duration: 270 },
  { Component: Demo, duration: 240 },
  { Component: Play, duration: 540 },
  { Component: Recap, duration: 270 },
  { Component: Stats, duration: 180 },
  { Component: Outro, duration: 150 },
];

export const Film = () => (
  <AbsoluteFill style={{ backgroundColor: C.bg }}>
    <AbsoluteFill
      style={{
        background: `radial-gradient(1300px 900px at 62% 34%, ${C.bg2} 0%, ${C.bg} 54%, ${C.black} 100%)`,
      }}
    />
    <Series>
      {SCENES.map(({ Component, duration }, index) => (
        <Series.Sequence key={index} durationInFrames={duration}>
          <Component duration={duration} />
        </Series.Sequence>
      ))}
    </Series>
    <Grain />
    <ProgressBar />
  </AbsoluteFill>
);
