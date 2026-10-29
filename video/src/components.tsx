import type { CSSProperties, ReactNode } from 'react';
import {
  AbsoluteFill,
  Easing,
  Img,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import { C, F } from './theme';

/* -------------------------------------------------------------------------- */
/* 基础动画                                                                   */
/* -------------------------------------------------------------------------- */

export const useFadeUp = (delay = 0, duration = 18, distance = 16): CSSProperties => {
  const frame = useCurrentFrame();
  const progress = interpolate(frame, [delay, delay + duration], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });
  return {
    opacity: progress,
    transform: `translateY(${(1 - progress) * distance}px)`,
  };
};

export const useFadeIn = (delay = 0, duration = 18): CSSProperties => {
  const frame = useCurrentFrame();
  const progress = interpolate(frame, [delay, delay + duration], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });
  return { opacity: progress };
};

export const useScaleIn = (delay = 0, duration = 28, from = 0.94): CSSProperties => {
  const frame = useCurrentFrame();
  const progress = interpolate(frame, [delay, delay + duration], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });
  return {
    opacity: progress,
    transform: `scale(${from + (1 - from) * progress})`,
  };
};

/* -------------------------------------------------------------------------- */
/* 品牌与场景框                                                               */
/* -------------------------------------------------------------------------- */

export const LogoMark = ({
  size = 64,
  opacity = 1,
  style,
}: {
  size?: number;
  opacity?: number;
  style?: CSSProperties;
}) => (
  <svg
    viewBox="0 0 64 64"
    width={size}
    height={size}
    style={{ opacity, display: 'block', ...style }}
    aria-hidden="true"
  >
    <path
      d="M32 5 57 20v24L32 59 7 44V20Z"
      fill="none"
      stroke={C.gold}
      strokeWidth={1.5}
    />
    <path
      d="M32 5v54M7 20l50 24M57 20 7 44"
      fill="none"
      stroke={C.gold}
      strokeOpacity={0.5}
      strokeWidth={0.8}
    />
    <circle cx="32" cy="32" r="4" fill={C.gold} />
  </svg>
);

export const BrandLine = () => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
    <LogoMark size={22} />
    <span
      style={{
        fontFamily: F.serif,
        fontSize: 17,
        color: C.ink,
        letterSpacing: '0.12em',
      }}
    >
      幕间
    </span>
    <span style={{ width: 22, height: 1, background: C.gold, opacity: 0.7 }} />
    <span
      style={{
        fontFamily: F.mono,
        fontSize: 10.5,
        letterSpacing: '0.24em',
        color: C.ink3,
      }}
    >
      MISE-EN-SCÈNE
    </span>
  </div>
);

export const ChapterMark = ({ label }: { label: string }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
    <span
      style={{
        fontFamily: F.mono,
        fontSize: 10.5,
        letterSpacing: '0.22em',
        color: C.gold,
      }}
    >
      {label}
    </span>
    <span style={{ width: 42, height: 1, background: C.lineStrong }} />
  </div>
);

export const SceneShell = ({
  duration,
  chapter,
  children,
  fullBleed = false,
  chrome = true,
  fade = true,
  padding = '76px 104px 104px',
  style,
}: {
  duration: number;
  chapter?: string;
  children: ReactNode;
  fullBleed?: boolean;
  chrome?: boolean;
  fade?: boolean;
  padding?: string;
  style?: CSSProperties;
}) => {
  const frame = useCurrentFrame();
  const opacity = fade
    ? interpolate(frame, [0, 6, duration - 8, duration], [0, 1, 1, 0], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
      })
    : 1;
  return (
    <AbsoluteFill style={{ opacity }}>
      {fullBleed ? null : (
        <>
          <AbsoluteFill
            style={{ background: `radial-gradient(1100px 700px at 74% 18%, ${C.bg2} 0%, ${C.bg} 56%, ${C.black} 100%)` }}
          />
          <GridOverlay />
        </>
      )}
      {chrome ? (
        <>
          {fullBleed ? (
            <div
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                top: 0,
                height: 190,
                background: 'linear-gradient(180deg, rgba(7,13,16,0.94), rgba(7,13,16,0))',
                zIndex: 4,
              }}
            />
          ) : null}
          <div
            style={{
              position: 'absolute',
              top: 44,
              left: 104,
              right: 104,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              zIndex: 10,
            }}
          >
            <BrandLine />
            {chapter ? <ChapterMark label={chapter} /> : null}
          </div>
        </>
      ) : null}
      <AbsoluteFill style={{ padding: fullBleed ? 0 : padding, ...style }}>
        {children}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

export const GridOverlay = () => (
  <>
    <AbsoluteFill
      style={{
        backgroundImage:
          'linear-gradient(rgba(163,190,181,0.045) 1px, transparent 1px), linear-gradient(90deg, rgba(163,190,181,0.045) 1px, transparent 1px)',
        backgroundSize: '72px 72px',
        opacity: 0.55,
        maskImage: 'radial-gradient(ellipse at 50% 40%, black 20%, transparent 78%)',
      }}
    />
    <AbsoluteFill
      style={{
        background:
          'radial-gradient(ellipse at 50% 45%, transparent 38%, rgba(0,0,0,0.46) 100%)',
      }}
    />
  </>
);

/* -------------------------------------------------------------------------- */
/* 排版                                                                       */
/* -------------------------------------------------------------------------- */

export const Kicker = ({
  children,
  delay = 0,
  color = C.gold,
}: {
  children: ReactNode;
  delay?: number;
  color?: string;
}) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 14, ...useFadeUp(delay, 16, 8) }}>
    <span style={{ width: 34, height: 1, background: color }} />
    <span
      style={{
        fontFamily: F.mono,
        fontSize: 12,
        letterSpacing: '0.26em',
        color,
        textTransform: 'uppercase',
      }}
    >
      {children}
    </span>
  </div>
);

export const Headline = ({
  children,
  delay = 0,
  size = 58,
  style,
}: {
  children: ReactNode;
  delay?: number;
  size?: number;
  style?: CSSProperties;
}) => (
  <h1
    style={{
      fontFamily: F.serif,
      fontWeight: 400,
      fontSize: size,
      lineHeight: 1.42,
      letterSpacing: '0.015em',
      color: C.ink,
      margin: 0,
      textWrap: 'balance',
      ...useFadeUp(delay, 20, 20),
      ...style,
    }}
  >
    {children}
  </h1>
);

export const Body = ({
  children,
  delay = 0,
  size = 25,
  maxWidth = 620,
  style,
}: {
  children: ReactNode;
  delay?: number;
  size?: number;
  maxWidth?: number;
  style?: CSSProperties;
}) => (
  <p
    style={{
      fontFamily: F.sans,
      fontSize: size,
      lineHeight: 1.92,
      color: C.ink2,
      margin: 0,
      maxWidth,
      ...useFadeUp(delay, 18, 14),
      ...style,
    }}
  >
    {children}
  </p>
);

export const Micro = ({
  children,
  style,
}: {
  children: ReactNode;
  style?: CSSProperties;
}) => (
  <span
    style={{
      fontFamily: F.mono,
      fontSize: 12,
      letterSpacing: '0.16em',
      color: C.ink3,
      ...style,
    }}
  >
    {children}
  </span>
);

export const GoldRule = ({ width = 120, delay = 0 }: { width?: number; delay?: number }) => {
  const frame = useCurrentFrame();
  const progress = interpolate(frame, [delay, delay + 24], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });
  return <span style={{ display: 'block', width: width * progress, height: 1, background: C.gold, opacity: 0.8 }} />;
};

export const Tag = ({
  children,
  tone = 'gold',
}: {
  children: ReactNode;
  tone?: 'gold' | 'muted' | 'ok';
}) => {
  const color = tone === 'gold' ? C.gold2 : tone === 'ok' ? C.ok : C.ink3;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        border: `1px solid ${tone === 'gold' ? C.lineStrong : C.line}`,
        borderRadius: 999,
        padding: '3px 11px',
        fontFamily: F.mono,
        fontSize: 10.5,
        letterSpacing: '0.14em',
        color,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </span>
  );
};

/* -------------------------------------------------------------------------- */
/* 图像与卡片                                                                 */
/* -------------------------------------------------------------------------- */

export const ImageFrame = ({
  src,
  width,
  height,
  objectPosition = 'center',
  caption,
  delay = 0,
  fadeBottom = false,
  style,
}: {
  src: string;
  width: number;
  height: number;
  objectPosition?: string;
  caption?: ReactNode;
  delay?: number;
  fadeBottom?: boolean;
  style?: CSSProperties;
}) => (
  <figure style={{ margin: 0, width, ...useFadeUp(delay, 22, 14), ...style }}>
    <div
      style={{
        width,
        height,
        overflow: 'hidden',
        borderRadius: 10,
        border: `1px solid ${C.lineStrong}`,
        background: C.bg1,
        boxShadow: '0 28px 80px rgba(0,0,0,0.42)',
        position: 'relative',
      }}
    >
      <Img
        src={staticFile(src)}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          objectPosition,
          display: 'block',
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          boxShadow: 'inset 0 0 0 1px rgba(227,233,230,0.035)',
          pointerEvents: 'none',
        }}
      />
      {fadeBottom ? (
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            height: 72,
            background: `linear-gradient(180deg, rgba(11,18,21,0), ${C.bg1})`,
            pointerEvents: 'none',
          }}
        />
      ) : null}
    </div>
    {caption ? (
      <figcaption
        style={{
          marginTop: 12,
          fontFamily: F.mono,
          fontSize: 10.5,
          letterSpacing: '0.14em',
          color: C.ink3,
          display: 'flex',
          gap: 10,
          alignItems: 'center',
        }}
      >
        <span style={{ width: 18, height: 1, background: C.lineStrong }} />
        {caption}
      </figcaption>
    ) : null}
  </figure>
);

export const Panel = ({
  children,
  style,
  tone = 'default',
}: {
  children: ReactNode;
  style?: CSSProperties;
  tone?: 'default' | 'gold';
}) => (
  <div
    style={{
      border: `1px solid ${tone === 'gold' ? C.lineStrong : C.line}`,
      background: tone === 'gold' ? 'rgba(201,167,107,0.055)' : 'rgba(15,25,30,0.72)',
      borderRadius: 10,
      padding: '20px 22px',
      ...style,
    }}
  >
    {children}
  </div>
);

/* -------------------------------------------------------------------------- */
/* 全局底部进度                                                               */
/* -------------------------------------------------------------------------- */

export const ProgressBar = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const progress = Math.min(1, Math.max(0, frame / (durationInFrames - 1)));
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 2, background: 'rgba(163,190,181,0.12)', zIndex: 30 }}>
      <div style={{ width: `${progress * 100}%`, height: '100%', background: C.gold, opacity: 0.9 }} />
      <div
        style={{
          position: 'absolute',
          top: -2,
          left: `calc(${progress * 100}% - 2px)`,
          width: 6,
          height: 6,
          borderRadius: 999,
          background: C.gold2,
          boxShadow: `0 0 12px ${C.gold}`,
        }}
      />
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* 噪点                                                                       */
/* -------------------------------------------------------------------------- */

const NOISE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="220" height="220"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.86" numOctaves="3" stitchTiles="stitch"/></filter><rect width="220" height="220" filter="url(%23n)" opacity="0.55"/></svg>`;
const NOISE_URL = `url("data:image/svg+xml;utf8,${NOISE_SVG}")`;

export const Grain = () => (
  <AbsoluteFill
    style={{
      backgroundImage: NOISE_URL,
      backgroundSize: '220px 220px',
      opacity: 0.045,
      pointerEvents: 'none',
      zIndex: 20,
      mixBlendMode: 'overlay',
    }}
  />
);
