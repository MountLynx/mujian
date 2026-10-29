import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from 'remotion';
import { Body, Headline, Kicker, Micro, SceneShell, Tag, useFadeUp } from '../components';
import { C, F } from '../theme';

const STEPS = ['取景', '宣告', '裁定', '落定'];

const StepStrip = ({ frame }: { frame: number }) => {
  const active = frame < 42 ? 0 : frame < 60 ? 1 : frame < 86 ? 2 : 3;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0, width: 660 }}>
      {STEPS.map((step, i) => {
        const done = i < active;
        const current = i === active;
        return (
          <div key={step} style={{ display: 'flex', alignItems: 'center', flex: i === STEPS.length - 1 ? 'none' : 1 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7 }}>
              <div
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 999,
                  border: `1px solid ${current ? C.gold : done ? C.lineStrong : C.line}`,
                  background: current ? C.gold : done ? 'rgba(201,167,107,0.12)' : C.bg1,
                  color: current ? C.black : done ? C.gold2 : C.ink3,
                  fontFamily: F.mono,
                  fontSize: 10,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {done ? '·' : String(i + 1).padStart(2, '0')}
              </div>
              <span style={{ fontFamily: F.sans, fontSize: 12, color: current ? C.ink : done ? C.ink2 : C.ink3 }}>
                {step}
              </span>
            </div>
            {i < STEPS.length - 1 ? (
              <span style={{ flex: 1, height: 1, background: done ? C.lineStrong : C.line, margin: '0 10px', marginBottom: 22 }} />
            ) : null}
          </div>
        );
      })}
    </div>
  );
};

const Cursor = ({
  x,
  y,
  pressed,
  opacity = 1,
}: {
  x: number;
  y: number;
  pressed: boolean;
  opacity?: number;
}) => (
  <svg
    viewBox="0 0 28 36"
    width={28}
    height={36}
    style={{
      position: 'absolute',
      left: x,
      top: y,
      zIndex: 30,
      opacity,
      filter: 'drop-shadow(0 6px 12px rgba(0,0,0,0.55))',
      transform: `scale(${pressed ? 0.88 : 1})`,
      transformOrigin: 'top left',
    }}
  >
    <path d="M3 3 L3 28 L10 21 L15 33 L20 31 L15 19 L24 19 Z" fill={C.ink} stroke={C.black} strokeWidth={1.4} strokeLinejoin="round" />
  </svg>
);

const Ripple = ({ x, y, frame }: { x: number; y: number; frame: number }) => {
  const progress = interpolate(frame, [42, 58], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  if (progress <= 0 || progress >= 1) return null;
  return (
    <>
      <span
        style={{
          position: 'absolute',
          left: x - 10 - progress * 34,
          top: y - 10 - progress * 34,
          width: 20 + progress * 68,
          height: 20 + progress * 68,
          borderRadius: 999,
          border: `1px solid ${C.gold}`,
          opacity: 0.55 * (1 - progress),
          zIndex: 25,
        }}
      />
      <span
        style={{
          position: 'absolute',
          left: x - 6,
          top: y - 6,
          width: 12,
          height: 12,
          borderRadius: 999,
          background: C.gold2,
          opacity: 0.8 * (1 - progress),
          zIndex: 26,
        }}
      />
    </>
  );
};

const TopButton = ({ frame }: { frame: number }) => {
  const loading = frame >= 42 && frame < 60;
  const done = frame >= 86;
  const pressed = frame >= 42 && frame < 48;
  return (
    <div
      style={{
        width: 184,
        height: 38,
        borderRadius: 6,
        background: loading ? 'rgba(201,167,107,0.45)' : C.gold,
        color: C.black,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        fontFamily: F.sans,
        fontSize: 14,
        letterSpacing: '0.04em',
        transform: `scale(${pressed ? 0.96 : 1})`,
        transition: 'none',
        boxShadow: done ? `0 0 22px ${C.goldSoft}` : 'none',
      }}
    >
      {loading ? (
        <>
          <span
            style={{
              width: 10,
              height: 10,
              borderRadius: 999,
              border: `1px solid ${C.black}`,
              borderTopColor: 'transparent',
              transform: `rotate(${frame * 18}deg)`,
            }}
          />
          推进中…
        </>
      ) : done ? (
        <>▷ 再次推进</>
      ) : (
        <>▷ 推进一刻</>
      )}
    </div>
  );
};

const PanelTop = ({ frame }: { frame: number }) => (
  <div
    style={{
      height: 64,
      borderBottom: `1px solid ${C.line}`,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 24px',
      flex: 'none',
      background: 'rgba(15,25,30,0.66)',
    }}
  >
    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Micro style={{ color: C.gold, letterSpacing: '0.2em' }}>DIRECTOR / 导演台</Micro>
        <span style={{ fontFamily: F.serif, fontSize: 20, color: C.ink }}>雾港 · 第 4 日 22:40</span>
      </div>
      <span
        style={{
          border: `1px solid ${C.line}`,
          borderRadius: 999,
          padding: '3px 9px',
          fontFamily: F.mono,
          fontSize: 10,
          color: C.ink3,
          letterSpacing: '0.12em',
        }}
      >
        已暂停
      </span>
    </div>
    <TopButton frame={frame} />
  </div>
);

const CastRow = ({ name, role, char }: { name: string; role: string; char: string }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: `1px solid ${C.line}` }}>
    <span
      style={{
        width: 34,
        height: 34,
        borderRadius: 999,
        background: 'rgba(163,190,181,0.16)',
        color: C.ink,
        fontFamily: F.serif,
        fontSize: 16,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flex: 'none',
      }}
    >
      {char}
    </span>
    <span style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1 }}>
      <span style={{ fontFamily: F.sans, fontSize: 15, color: C.ink }}>{name}</span>
      <span style={{ fontFamily: F.sans, fontSize: 11.5, color: C.ink3 }}>{role}</span>
    </span>
    <Tag>在场</Tag>
  </div>
);

const PanelBody = ({ frame }: { frame: number }) => {
  const cardIn = interpolate(frame, [50, 68], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });
  const highlight = interpolate(frame, [70, 82, 88, 100], [0, 1, 1, 0.35], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  return (
    <div style={{ display: 'flex', height: 640 }}>
      <div style={{ width: 1040, borderRight: `1px solid ${C.line}`, padding: '22px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <Micro style={{ color: C.ink2, letterSpacing: '0.16em' }}>LEDGER / 行动记录</Micro>
          <Micro>本刻 · 1 条宣告</Micro>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0 10px', borderBottom: `1px solid ${C.line}` }}>
          <span style={{ width: 5, height: 5, borderRadius: 999, background: C.ink3 }} />
          <span style={{ fontFamily: F.sans, fontSize: 12.5, color: C.ink3 }}>
            第 3 刻 · 22:40 / 雾港 / 阿婆把干票压在票匣边；林生没有接。
          </span>
        </div>

        <div
          style={{
            opacity: cardIn,
            transform: `translateY(${(1 - cardIn) * 16}px)`,
            border: `1px solid ${C.lineStrong}`,
            borderRadius: 8,
            background: 'rgba(11,18,21,0.52)',
            padding: '16px 18px',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span
              style={{
                width: 28,
                height: 28,
                borderRadius: 999,
                background: 'rgba(163,190,181,0.16)',
                color: C.ink,
                fontFamily: F.serif,
                fontSize: 14,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              阿
            </span>
            <span style={{ fontFamily: F.sans, fontSize: 14, color: C.ink2 }}>阿婆 → 林生</span>
            <span style={{ fontFamily: F.sans, fontSize: 17, color: C.ink }}>把干票又推回窗口那半寸</span>
            <span style={{ marginLeft: 'auto' }}>
              <Tag tone="ok">落地</Tag>
            </span>
          </div>
          <div style={{ borderLeft: `2px solid ${C.lineStrong}`, paddingLeft: 10, display: 'flex', flexDirection: 'column', gap: 5 }}>
            <span style={{ fontFamily: F.sans, fontSize: 14, lineHeight: 1.75, color: C.ink2 }}>
              阿婆把压在票匣边的干票重新拿起来，隔着窗口递出去，还是只递半寸，票角对着林生的方向。
            </span>
            <span style={{ fontFamily: F.sans, fontSize: 12.5, lineHeight: 1.7, color: C.ink3 }}>
              想要的效果：让他把这张干票接过去，或者把那个关于船等人的问题再问一遍。
            </span>
            <span style={{ fontFamily: F.serif, fontSize: 16, color: C.ink, marginTop: 2 }}>“潮水等得到。你等的是什么？”</span>
          </div>
          <div
            style={{
              background: `rgba(201,167,107,${0.06 + highlight * 0.12})`,
              border: `1px solid ${highlight > 0.5 ? C.lineStrong : C.line}`,
              borderRadius: 6,
              padding: '9px 12px',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              marginTop: 2,
            }}
          >
            <span style={{ fontFamily: F.mono, fontSize: 13.5, color: C.gold2 }}>
              d20 3 + 意志 8 + 把话咽回去 +2 = <span style={{ color: C.gold, fontSize: 16 }}>13</span>
            </span>
            <span style={{ width: 1, height: 18, background: C.lineStrong, margin: '0 4px' }} />
            <span style={{ fontFamily: F.mono, fontSize: 12.5, color: C.ink2 }}>DC 13</span>
            <span style={{ fontFamily: F.mono, fontSize: 12.5, color: C.ink3 }}>差值 +0</span>
            <span style={{ marginLeft: 'auto' }}>
              <Tag tone="ok">落地</Tag>
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto' }}>
          <Micro>{cardIn > 0.8 ? '已记录 · 1 条行动' : '等待推进…'}</Micro>
          <Micro style={{ color: cardIn > 0.8 ? C.gold2 : C.ink3 }}>
            {cardIn > 0.8 ? 'deed 仍发生 · effect 落地' : '点击右上角，推进这一刻'}
          </Micro>
        </div>
      </div>

      <div style={{ flex: 1, padding: '22px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <Micro style={{ color: C.ink2, letterSpacing: '0.16em' }}>CAST / 卡司</Micro>
          <Micro>2</Micro>
        </div>
        <CastRow name="阿婆" role="渡口守夜人" char="阿" />
        <CastRow name="林生" role="未班渡轮的乘客" char="林" />
        <div style={{ marginTop: 6 }}>
          <Micro style={{ color: C.ink2, letterSpacing: '0.16em' }}>KNOWN / 已知事实</Micro>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
            {['只隔三分钟，船还没开。', '票在阿婆手里，林生没有接。', '雾里有一盏灯，不是渡口的。'].map((line) => (
              <div key={line} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <span style={{ width: 4, height: 4, borderRadius: 999, background: C.ink3, marginTop: 8, flex: 'none' }} />
                <span style={{ fontFamily: F.sans, fontSize: 12, lineHeight: 1.7, color: C.ink3 }}>{line}</span>
              </div>
            ))}
          </div>
        </div>
        <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <Micro>世界时间</Micro>
          <span style={{ fontFamily: F.mono, fontSize: 13, color: C.gold2 }}>22:40</span>
        </div>
      </div>
    </div>
  );
};

const Callout = ({ frame }: { frame: number }) => {
  const inProgress = interpolate(frame, [86, 100], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const outProgress = interpolate(frame, [142, 156], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const opacity = inProgress * outProgress;
  if (opacity <= 0) return null;
  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', background: 'rgba(7,13,16,0.7)', opacity, zIndex: 40 }}>
      <div
        style={{
          width: 1060,
          border: `1px solid ${C.lineStrong}`,
          background: 'rgba(11,18,21,0.96)',
          borderRadius: 10,
          padding: '34px 38px',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
          transform: `translateY(${(1 - inProgress) * 16}px)`,
        }}
      >
        <Micro style={{ color: C.gold, letterSpacing: '0.2em' }}>THE ROLL / 裁定</Micro>
        <div style={{ fontFamily: F.mono, fontSize: 38, color: C.ink, letterSpacing: '-0.02em' }}>
          d20 <span style={{ color: C.gold2 }}>3</span> + 意志 8 + 把话咽回去 +2 = <span style={{ color: C.gold }}>13</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginTop: 4 }}>
          <Tag tone="gold">DC 13</Tag>
          <span style={{ fontFamily: F.sans, fontSize: 20, color: C.ok }}>落地</span>
          <span style={{ width: 1, height: 20, background: C.lineStrong }} />
          <span style={{ fontFamily: F.sans, fontSize: 17, color: C.ink2 }}>deed 仍发生；effect 落地。</span>
        </div>
        <span style={{ fontFamily: F.sans, fontSize: 15, lineHeight: 1.8, color: C.ink3, marginTop: 8 }}>
          骰点决定 effect 是否落地，不决定 deed 是否发生。目标若有敌意回应，会改用回应总值结算。
        </span>
      </div>
    </AbsoluteFill>
  );
};

export const Demo = ({ duration }: { duration: number }) => {
  const frame = useCurrentFrame();
  const topLabel = useFadeUp(6, 16, 8);
  const topHeadline = useFadeUp(12, 20, 14);
  const topBody = useFadeUp(16, 18, 10);
  const bottomNote = useFadeUp(146, 18, 8);
  const panelIn = useFadeUp(18, 20, 14);
  const cursorX = interpolate(frame, [10, 40], [1450, 1630], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.inOut(Easing.cubic),
  });
  const cursorY = interpolate(frame, [10, 40], [900, 258], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.inOut(Easing.cubic),
  });
  const afterX = interpolate(frame, [50, 80], [1630, 820], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.inOut(Easing.cubic),
  });
  const afterY = interpolate(frame, [50, 80], [258, 500], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.inOut(Easing.cubic),
  });
  const cx = frame < 48 ? cursorX : afterX;
  const cy = frame < 48 ? cursorY : afterY;
  const pressed = frame >= 42 && frame < 48;
  return (
    <SceneShell duration={duration} chapter="04 / DEMO" padding="0">
      <div style={{ ...topLabel, position: 'absolute', left: 104, top: 110 }}>
        <Kicker delay={0}>SIMULATED TURN</Kicker>
      </div>
      <div style={{ ...topHeadline, position: 'absolute', left: 104, top: 138, width: 1000 }}>
        <Headline size={40} style={{ maxWidth: 980 }}>
          点一下，推进一个时刻。
        </Headline>
      </div>
      <div style={{ ...topBody, position: 'absolute', left: 104, top: 196, width: 1000 }}>
        <Body size={16} maxWidth={900}>
          取景、宣告、裁定、落定——一条时间线，四次决定。
        </Body>
      </div>
      <div style={{ position: 'absolute', right: 104, top: 150 }}>
        <Micro style={{ color: C.ink3, letterSpacing: '0.16em', display: 'block', textAlign: 'right', marginBottom: 10 }}>
          SIMULATED / 非实时录屏
        </Micro>
        <StepStrip frame={frame} />
      </div>

      <div style={{ ...panelIn, position: 'absolute', left: 160, top: 240, width: 1600, height: 704, zIndex: 10 }}>
        <div
          style={{
            width: '100%',
            height: '100%',
            border: `1px solid ${C.lineStrong}`,
            borderRadius: 12,
            background: 'rgba(11,18,21,0.93)',
            boxShadow: '0 30px 90px rgba(0,0,0,0.45)',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <PanelTop frame={frame} />
          <PanelBody frame={frame} />
        </div>
      </div>

      <Ripple x={1630} y={258} frame={frame} />
      <Cursor x={cx} y={cy} pressed={pressed} />
      <Callout frame={frame} />

      <div style={{ ...bottomNote, position: 'absolute', left: 104, bottom: 74, display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ width: 28, height: 1, background: C.lineStrong }} />
        <Micro>一个时刻结束，世界继续向前。</Micro>
      </div>
    </SceneShell>
  );
};
