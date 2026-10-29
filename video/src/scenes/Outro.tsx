import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { LogoMark, Micro, SceneShell, useFadeUp, useScaleIn } from '../components';
import { C, F } from '../theme';

export const Outro = ({ duration }: { duration: number }) => {
  const frame = useCurrentFrame();
  const blackout = interpolate(frame, [duration - 24, duration], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const mark = useScaleIn(0, 26, 0.94);
  const title = useFadeUp(8, 20, 14);
  const tagline = useFadeUp(18, 20, 12);
  const latin = useFadeUp(28, 18, 8);
  return (
    <SceneShell duration={duration} chrome={false} fade={false} padding="0">
      <AbsoluteFill style={{ overflow: 'hidden' }}>
        <div style={{ position: 'absolute', right: 10, top: 40, opacity: 0.045 }}>
          <LogoMark size={720} />
        </div>
        <div
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            width: 1300,
            height: 700,
            transform: 'translate(-50%, -50%)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center',
            gap: 14,
          }}
        >
          <div style={mark}>
            <LogoMark size={72} />
          </div>
          <div style={{ ...title, display: 'flex', alignItems: 'baseline', gap: 22 }}>
            <span style={{ fontFamily: F.serif, fontSize: 96, color: C.ink, letterSpacing: '0.04em' }}>幕间</span>
            <span style={{ fontFamily: F.mono, fontSize: 15, color: C.gold2, letterSpacing: '0.36em' }}>
              MISE-EN-SCÈNE
            </span>
          </div>
          <div style={{ ...tagline, marginTop: 14 }}>
            <p style={{ fontFamily: F.serif, fontSize: 30, lineHeight: 1.8, color: C.ink2, margin: 0 }}>
              骰子落下之前，故事尚有另一种可能。
            </p>
          </div>
          <div style={{ ...latin, marginTop: 30, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
            <span style={{ width: 46, height: 1, background: C.gold, opacity: 0.8 }} />
            <Micro style={{ color: C.gold2, letterSpacing: '0.26em' }}>
              MAKE A CHOICE. KEEP THE CONSEQUENCE.
            </Micro>
            <Micro style={{ color: C.ink3, letterSpacing: '0.16em' }}>
              一个双层的 LLM 情节推演框架
            </Micro>
          </div>
        </div>
        <AbsoluteFill style={{ background: C.black, opacity: blackout }} />
      </AbsoluteFill>
    </SceneShell>
  );
};
