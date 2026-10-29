import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame } from 'remotion';
import { Body, Headline, Kicker, Micro, SceneShell, Tag, useFadeUp } from '../components';
import { C, F } from '../theme';

export const Recap = ({ duration }: { duration: number }) => {
  const frame = useCurrentFrame();
  const swap = interpolate(frame, [110, 118], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const veil = interpolate(frame, [106, 112, 120], [0, 0.55, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const first = useFadeUp(6, 16, 12);
  const body = useFadeUp(14, 16, 8);
  const second = useFadeUp(116, 16, 8);
  const final = useFadeUp(138, 16, 8);
  return (
    <SceneShell duration={duration} chapter="06 / RECAP" fullBleed>
      <AbsoluteFill>
        <Img
          src={staticFile('screens/recap-modal.png')}
          style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 1 - swap }}
        />
        <AbsoluteFill style={{ opacity: swap }}>
          <Img
            src={staticFile('screens/recap-expanded.png')}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        </AbsoluteFill>
        <AbsoluteFill
          style={{
            background:
              'linear-gradient(90deg, rgba(7,13,16,0.98) 0px, rgba(7,13,16,0.98) 330px, rgba(7,13,16,0.84) 420px, rgba(7,13,16,0.24) 510px, rgba(7,13,16,0) 600px)',
          }}
        />
        <AbsoluteFill
          style={{
            background:
              'radial-gradient(800px 600px at 20% 45%, rgba(201,167,107,0.06), transparent 65%)',
          }}
        />
        <AbsoluteFill style={{ background: C.black, opacity: veil }} />
      </AbsoluteFill>

      <AbsoluteFill style={{ padding: '260px 104px 104px' }}>
        <div style={{ width: 430, display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={first}>
            <Kicker delay={0}>THE LEDGER OPENS</Kicker>
          </div>
          <div style={first}>
            <Headline size={48} style={{ maxWidth: 430 }}>
              故事结束后，
              <br />
              才看见全部真相。
            </Headline>
          </div>
          <div style={body}>
            <Body size={20} maxWidth={410}>
              所有人的秘密、欲望、恐惧、内心，
              <br />
              effect 与检定。
            </Body>
          </div>
          <div style={{ ...body, display: 'flex', gap: 10, marginTop: 4, flexWrap: 'wrap' }}>
            <Tag tone="gold">全量公开</Tag>
            <Tag>逐刻记录</Tag>
            <Tag>终局</Tag>
          </div>
          <div style={{ ...second, marginTop: 18, maxWidth: 410 }}>
            <p style={{ fontFamily: F.sans, fontSize: 18, lineHeight: 1.8, color: C.ink2, margin: 0 }}>
              逐刻裁定、内心与幕后注，一次展开。
            </p>
          </div>
          <div style={{ ...final, marginTop: 6, maxWidth: 410 }}>
            <span style={{ display: 'block', width: 40, height: 1, background: C.gold, marginBottom: 10 }} />
            <Micro style={{ color: C.soft, letterSpacing: '0.12em' }}>
              复盘是终局：看过幕后，就不能再继续推进。
            </Micro>
          </div>
        </div>
      </AbsoluteFill>
    </SceneShell>
  );
};
