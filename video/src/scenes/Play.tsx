import { AbsoluteFill, interpolate } from 'remotion';
import type { ReactNode } from 'react';
import { useCurrentFrame } from 'remotion';
import { Body, Headline, ImageFrame, Kicker, Micro, SceneShell, useFadeUp } from '../components';
import { C, F } from '../theme';

const CardLabel = ({ children, tone = 'muted' }: { children: ReactNode; tone?: 'muted' | 'gold' }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 10 }}>
    <span
      style={{
        width: 6,
        height: 6,
        borderRadius: 999,
        background: tone === 'gold' ? C.gold : C.ink3,
      }}
    />
    <Micro style={{ color: tone === 'gold' ? C.gold2 : C.ink3, letterSpacing: '0.18em' }}>
      {children}
    </Micro>
  </div>
);

export const Play = ({ duration }: { duration: number }) => {
  const frame = useCurrentFrame();
  const beat1Opacity = interpolate(frame, [0, 6, 204, 210], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const beat2Opacity = interpolate(frame, [210, 216], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const beatVeil = interpolate(frame, [204, 208, 212], [0, 0.4, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const b1Label = useFadeUp(8, 18, 10);
  const b1Headline = useFadeUp(14, 20, 16);
  const b1Body = useFadeUp(24, 18, 12);
  const b1Card = useFadeUp(28, 22, 14);
  const b2Label = useFadeUp(216, 16, 8);
  const b2Headline = useFadeUp(222, 18, 14);
  const b2Body = useFadeUp(232, 16, 10);
  const b2Cards = useFadeUp(244, 20, 12);
  const b2Note = useFadeUp(280, 16, 8);
  return (
    <SceneShell duration={duration} chapter="05 / PLAY" padding="152px 104px 104px">
      <div style={{ position: 'relative', height: '100%' }}>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            opacity: beat1Opacity,
            display: 'flex',
            gap: 54,
            alignItems: 'center',
          }}
        >
          <div style={{ width: 680, display: 'flex', flexDirection: 'column', gap: 24 }}>
            <div style={b1Label}>
              <Kicker delay={0}>A HUMAN AT THE TABLE</Kicker>
            </div>
            <div style={b1Headline}>
              <Headline size={60} style={{ maxWidth: 700 }}>
                现在，其中一个人
                <br />
                可以是你。
              </Headline>
            </div>
            <div style={b1Body}>
              <Body size={22} maxWidth={660}>
                同一套 deed / effect、DC 与骰点。
                <br />
                这一次，由你来宣告。
              </Body>
            </div>
            <div style={{ ...b1Label, display: 'flex', alignItems: 'center', gap: 12, marginTop: 18 }}>
              <span style={{ width: 36, height: 1, background: C.gold }} />
              <Micro style={{ color: C.gold2 }}>同一个引擎 · 多一个真人节点</Micro>
            </div>
          </div>
          <div style={b1Card}>
            <ImageFrame
              src="screens/play-form-card.png"
              width={800}
              height={571}
              caption="轮到你行动 · 阿岚"
              fadeBottom
            />
          </div>
        </div>

        <AbsoluteFill style={{ background: C.black, opacity: beatVeil, zIndex: 2 }} />
        <div
          style={{
            position: 'absolute',
            inset: 0,
            opacity: beat2Opacity,
            display: 'flex',
            gap: 48,
            alignItems: 'center',
          }}
        >
          <div style={{ width: 570, display: 'flex', flexDirection: 'column', gap: 22 }}>
            <div style={b2Label}>
              <Kicker delay={0} color={C.gold2}>INFORMATION BOUNDARY</Kicker>
            </div>
            <div style={b2Headline}>
              <Headline size={50} style={{ maxWidth: 560 }}>
                你只拿到这个角色
                <br />
                能知道的信息。
              </Headline>
            </div>
            <div style={b2Body}>
              <Body size={20} maxWidth={560}>
                他人的秘密、内心、effect 与检定，在复盘前不可见。
                <br />
                自己的角色卡与检定，完全可见。
              </Body>
            </div>
            <div style={{ ...b2Note, marginTop: 16 }}>
              <span style={{ display: 'block', width: 42, height: 1, background: C.gold, marginBottom: 12 }} />
              <span style={{ fontFamily: F.sans, fontSize: 15.5, lineHeight: 1.8, color: C.ink3 }}>
                故事结束、打开复盘之后，才能看到全部。
              </span>
            </div>
          </div>
          <div style={{ ...b2Cards, display: 'flex', gap: 36, alignItems: 'flex-start' }}>
            <div>
              <CardLabel>公开 / OTHERS</CardLabel>
              <ImageFrame src="screens/public-drawer-card.png" width={500} height={652} />
            </div>
            <div>
              <CardLabel tone="gold">只有你知道 / YOURS</CardLabel>
              <ImageFrame src="screens/own-drawer-card.png" width={500} height={652} />
            </div>
          </div>
        </div>
      </div>
    </SceneShell>
  );
};
