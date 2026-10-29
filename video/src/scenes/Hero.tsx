import { AbsoluteFill } from 'remotion';
import { GoldRule, LogoMark, Micro, SceneShell, useFadeUp, useScaleIn } from '../components';
import { C, F } from '../theme';

export const Hero = ({ duration }: { duration: number }) => {
  const markStyle = useScaleIn(0, 30, 0.9);
  const titleStyle = useFadeUp(8, 24, 22);
  const latinStyle = useFadeUp(16, 22, 14);
  const taglineStyle = useFadeUp(28, 24, 18);
  const noteStyle = useFadeUp(40, 20, 10);
  return (
    <SceneShell duration={duration} chrome={false} padding="0">
      <AbsoluteFill style={{ overflow: 'hidden' }}>
        <div style={{ position: 'absolute', right: 40, top: 90, opacity: 0.055 }}>
          <LogoMark size={760} />
        </div>
        <div
          style={{
            position: 'absolute',
            left: '50%',
            top: '48%',
            width: 900,
            height: 900,
            transform: 'translate(-50%, -50%)',
            background: 'radial-gradient(circle, rgba(201,167,107,0.10) 0%, rgba(201,167,107,0.02) 42%, transparent 70%)',
            filter: 'blur(2px)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: 168,
            top: 250,
            width: 980,
            display: 'flex',
            flexDirection: 'column',
            gap: 22,
          }}
        >
          <div style={markStyle}>
            <LogoMark size={92} />
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 28 }}>
            <h1
              style={{
                ...titleStyle,
                fontFamily: F.serif,
                fontWeight: 400,
                fontSize: 132,
                lineHeight: 1.05,
                letterSpacing: '0.03em',
                color: C.ink,
                margin: 0,
              }}
            >
              幕间
            </h1>
            <span
              style={{
                ...latinStyle,
                fontFamily: F.mono,
                fontSize: 19,
                letterSpacing: '0.42em',
                color: C.gold2,
                paddingBottom: 18,
              }}
            >
              MISE-EN-SCÈNE
            </span>
          </div>
          <div style={{ ...taglineStyle, marginTop: 12 }}>
            <GoldRule width={74} delay={34} />
            <p
              style={{
                fontFamily: F.serif,
                fontSize: 39,
                lineHeight: 1.7,
                color: C.ink,
                margin: '18px 0 0',
                letterSpacing: '0.02em',
              }}
            >
              骰子落下之前，故事尚有另一种可能。
            </p>
          </div>
          <div
            style={{
              ...noteStyle,
              display: 'flex',
              alignItems: 'center',
              gap: 16,
              marginTop: 26,
            }}
          >
            <Micro style={{ color: C.ink2, letterSpacing: '0.16em' }}>
              一个双层的 LLM 情节推演框架
            </Micro>
            <span style={{ width: 36, height: 1, background: C.lineStrong }} />
            <Micro>WORLD / FOCUS / PLAY</Micro>
          </div>
        </div>
      </AbsoluteFill>
    </SceneShell>
  );
};
