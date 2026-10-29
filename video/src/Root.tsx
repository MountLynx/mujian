import { Composition } from 'remotion';
import { Film } from './Film';
import { FPS, HEIGHT, TOTAL_FRAMES, WIDTH } from './theme';

export const Root = () => (
  <Composition
    id="Intro"
    component={Film}
    durationInFrames={TOTAL_FRAMES}
    fps={FPS}
    width={WIDTH}
    height={HEIGHT}
  />
);
