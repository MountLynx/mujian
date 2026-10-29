import type { ReactNode } from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { Body, Headline, Kicker, Micro, Panel, SceneShell, Tag, useFadeUp } from '../components';
import { C, F } from '../theme';

const Chip = ({ children }: { children: ReactNode }) => (
  <span
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      border: `1px solid ${C.line}`,
      background: 'rgba(11,18,21,0.45)',
      borderRadius: 6,
      padding: '6px 10px',
      fontFamily: F.sans,
      fontSize: 14,
      color: C.ink2,
      whiteSpace: 'nowrap',
    }}
  >
    {children}
  </span>
);

const Arrow = ({ label }: { label: string }) => (
  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, height: 66 }}>
    <span style={{ width: 1, flex: 1, background: C.lineStrong }} />
    <span style={{ fontFamily: F.mono, fontSize: 9.5, letterSpacing: '0.18em', color: C.ink3 }}>{label}</span>
    <span style={{ width: 1, flex: 1, background: C.lineStrong }} />
    <span style={{ color: C.gold, fontSize: 10, lineHeight: 1 }}>▼</span>
  </div>
);

const TimelineNode = ({ time, note, last }: { time: string; note: string; last?: boolean }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 7, alignItems: 'flex-start', flex: 1 }}>
    <div style={{ display: 'flex', alignItems: 'center', width: '100%', gap: 8 }}>
      <span
        style={{
          width: 7,
          height: 7,
          borderRadius: 999,
          background: last ? C.gold : C.bg3,
          border: `1px solid ${last ? C.gold : C.lineStrong}`,
          flex: 'none',
        }}
      />
      <span style={{ height: 1, background: C.line, flex: 1 }} />
    </div>
    <span style={{ fontFamily: F.mono, fontSize: 11.5, color: C.gold2, letterSpacing: '0.08em' }}>{time}</span>
    <span style={{ fontFamily: F.sans, fontSize: 12, color: C.ink3 }}>{note}</span>
  </div>
);

const WorldDiagram = () => {
  const world = useFadeUp(10, 16, 12);
  const arrow = useFadeUp(16, 14, 6);
  const scene = useFadeUp(22, 16, 12);
  const timeline = useFadeUp(30, 16, 8);
  return (
    <div style={{ width: 870, display: 'flex', flexDirection: 'column', gap: 0 }}>
      <div style={world}>
        <Panel style={{ borderLeft: `2px solid ${C.gold}` }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 20 }}>
            <span style={{ fontFamily: F.serif, fontSize: 24, color: C.ink }}>世界层</span>
            <Micro style={{ color: C.gold }}>WORLD</Micro>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 14 }}>
            <Chip>区域</Chip>
            <Chip>势力</Chip>
            <Chip>事实账本</Chip>
            <Chip>在途消息</Chip>
          </div>
          <p style={{ fontFamily: F.sans, fontSize: 13.5, color: C.ink3, margin: '12px 0 0', lineHeight: 1.7 }}>
            时间由事件推动，不是回合数；消息抵达之前，不会改变任何人的认知。
          </p>
        </Panel>
      </div>
      <div style={arrow}>
        <Arrow label="事件 · 纪元" />
      </div>
      <div style={scene}>
        <Panel tone="gold">
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 20 }}>
            <span style={{ fontFamily: F.serif, fontSize: 24, color: C.ink }}>聚焦场景</span>
            <Micro style={{ color: C.gold }}>SCENE</Micro>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <Chip>人物</Chip>
            <Chip>选择</Chip>
            <Chip>后果</Chip>
          </div>
          <p style={{ fontFamily: F.sans, fontSize: 13.5, color: C.ink2, margin: '12px 0 0', lineHeight: 1.7 }}>
            镜头只照进一个局部；每个人只带着自己知道的事入场。
          </p>
        </Panel>
      </div>
      <div style={{ ...timeline, marginTop: 24, paddingTop: 18, borderTop: `1px solid ${C.line}` }}>
        <div style={{ display: 'flex', gap: 20 }}>
          <TimelineNode time="22:40" note="起点" />
          <TimelineNode time="+12h" note="第一夜" />
          <TimelineNode time="+1.5d" note="围港" />
          <TimelineNode time="+1d" note="铜片与失名" last />
        </div>
      </div>
    </div>
  );
};

const SignalNode = ({
  x,
  name,
  note,
  active,
  delivered,
}: {
  x: number;
  name: string;
  note: string;
  active: boolean;
  delivered: boolean;
}) => (
  <div
    style={{
      position: 'absolute',
      left: x - 52,
      top: 150,
      width: 104,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 8,
    }}
  >
    <div
      style={{
        width: 18,
        height: 18,
        borderRadius: 999,
        border: `1px solid ${active ? C.gold : C.lineStrong}`,
        background: active ? C.goldSoft : C.bg1,
        boxShadow: active ? `0 0 24px ${C.goldSoft}` : 'none',
      }}
    />
    <span style={{ fontFamily: F.sans, fontSize: 15, color: active ? C.ink : C.ink2 }}>{name}</span>
    <Micro style={{ color: delivered ? C.gold2 : C.ink3, letterSpacing: '0.1em' }}>{note}</Micro>
  </div>
);

const SignalFlow = () => {
  const frame = useCurrentFrame();
  const panel = useFadeUp(246, 18, 12);
  const text = useFadeUp(252, 18, 10);
  const card = useFadeUp(260, 18, 10);
  const travel = interpolate(frame, [280, 420], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const arrive = frame >= 420;
  const pulse = 0.65 + 0.35 * Math.sin((frame / 30) * Math.PI);
  const startX = 164;
  const endX = 560;
  const x = startX + (endX - startX) * travel;
  return (
    <div style={{ ...panel, width: 1100 }}>
      <Panel style={{ height: 560, position: 'relative', overflow: 'hidden' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <Micro style={{ color: C.gold, letterSpacing: '0.2em' }}>SIGNAL LOG / 在途信号</Micro>
          <Micro>{arrive ? '已抵达 · +6h' : `在途 · +${Math.max(0, Math.min(6, Math.round(travel * 6)))}h`}</Micro>
        </div>

        <div style={{ position: 'absolute', left: 110, right: 110, top: 159, height: 1, background: C.lineStrong }} />
        <div
          style={{
            position: 'absolute',
            left: 164,
            top: 159,
            height: 1,
            width: `${Math.max(0, x - 164)}px`,
            background: C.gold,
            opacity: 0.9,
          }}
        />
        <SignalNode x={164} name="白塔" note="发信" active={true} delivered={false} />
        <SignalNode x={560} name="雾港" note={arrive ? '已抵达' : '收信'} active={arrive} delivered={arrive} />
        <SignalNode x={956} name="铁湾" note="下一站" active={false} delivered={false} />

        <div
          style={{
            position: 'absolute',
            left: x - 8,
            top: 151,
            width: 16,
            height: 16,
            borderRadius: 999,
            background: C.gold2,
            boxShadow: `0 0 ${18 * pulse}px ${C.gold}`,
            opacity: travel > 0 && !arrive ? 1 : arrive ? 0.3 : 0,
          }}
        />
        {arrive ? (
          <>
            <div
              style={{
                position: 'absolute',
                left: 544,
                top: 143,
                width: 32,
                height: 32,
                borderRadius: 999,
                border: `1px solid ${C.gold}`,
                opacity: 0.5,
              }}
            />
            <div
              style={{
                position: 'absolute',
                left: 530,
                top: 129,
                width: 60,
                height: 60,
                borderRadius: 999,
                border: `1px solid ${C.lineStrong}`,
                opacity: 0.25,
              }}
            />
          </>
        ) : null}

        <div style={{ position: 'absolute', left: 0, right: 0, top: 320 }}>
          <div
            style={{
              ...card,
              border: `1px solid ${arrive ? C.lineStrong : C.line}`,
              background: arrive ? 'rgba(201,167,107,0.055)' : 'rgba(11,18,21,0.55)',
              borderRadius: 8,
              padding: '18px 20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 24,
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Tag tone={arrive ? 'gold' : 'muted'}>{arrive ? '已抵达' : '在途'}</Tag>
                <span style={{ fontFamily: F.sans, fontSize: 18, color: C.ink }}>
                  {arrive ? '白塔的封港令进入雾港的可知范围' : '白塔 → 雾港 · 封港令正在路上'}
                </span>
              </div>
              <span style={{ fontFamily: F.sans, fontSize: 14, color: C.ink3, lineHeight: 1.7 }}>
                {arrive
                  ? '第 1 夜 03:20 · 此时起，雾港的人才能据它行动。'
                  : '在消息抵达之前，雾港没有人能依据它行动。'}
              </span>
            </div>
            <div style={{ textAlign: 'right', flex: 'none' }}>
              <Micro style={{ color: arrive ? C.gold2 : C.ink3, letterSpacing: '0.12em' }}>
                {arrive ? '+6h / DELIVERED' : '+0h / EN ROUTE'}
              </Micro>
            </div>
          </div>
        </div>

        <div style={{ position: 'absolute', left: 0, right: 0, top: 430, display: 'flex', flexDirection: 'column', gap: 0 }}>
          {[
            ['22:40', '白塔', '发信', '已发出', true],
            ['03:20', '雾港', '收信', arrive ? '已抵达' : '在途', arrive],
            ['09:20', '铁湾', '下一站', '待抵达', false],
          ].map(([time, place, action, status, active]) => (
            <div
              key={`${time}-${place}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '3px 0',
                borderBottom: `1px solid ${C.line}`,
                opacity: active === true ? 1 : active === false ? 0.5 : 0.75,
              }}
            >
              <span style={{ width: 5, height: 5, borderRadius: 999, background: active === true ? C.gold : C.ink3, flex: 'none' }} />
              <span style={{ fontFamily: F.mono, fontSize: 11.5, color: active === true ? C.gold2 : C.ink3, width: 56 }}>{String(time)}</span>
              <span style={{ fontFamily: F.sans, fontSize: 12.5, color: active === true ? C.ink : C.ink3, width: 70 }}>{String(place)}</span>
              <span style={{ fontFamily: F.sans, fontSize: 12, color: C.ink3, flex: 1 }}>{String(action)}</span>
              <span style={{ fontFamily: F.mono, fontSize: 10.5, color: active === true ? C.gold : C.ink3, letterSpacing: '0.08em' }}>{String(status)}</span>
            </div>
          ))}
        </div>

        <div style={{ ...text, position: 'absolute', left: 0, right: 0, bottom: 16, display: 'flex', justifyContent: 'space-between' }}>
          <Micro>世界时间由事件推动</Micro>
          <Micro>抵达之后才进入可知范围</Micro>
        </div>
      </Panel>
    </div>
  );
};

const BeatOne = ({ visible }: { visible: boolean }) => {
  const tagStyle = useFadeUp(24, 16, 8);
  return (
    <div
      style={{
        opacity: visible ? 1 : 0,
        display: 'flex',
        alignItems: 'center',
        gap: 54,
        height: '100%',
      }}
    >
      <div style={{ width: 760, display: 'flex', flexDirection: 'column', gap: 22 }}>
        <Kicker delay={2}>THE LAYER OUTSIDE THE SHOT</Kicker>
        <Headline delay={8} size={62}>
          世界在镜头之外，
          <br />
          运行。
        </Headline>
        <Body delay={16} maxWidth={680} size={24}>
          区域、势力、事实与在途消息。
          <br />
          时间是事件推动的，不是回合数。
        </Body>
        <div style={{ ...tagStyle, display: 'flex', alignItems: 'center', gap: 12, marginTop: 14 }}>
          <Tag tone="gold">一次推进</Tag>
          <span style={{ fontFamily: F.sans, fontSize: 15, color: C.ink2 }}>= 一个不定长的纪元</span>
        </div>
      </div>
      <WorldDiagram />
    </div>
  );
};

const BeatTwo = ({ visible }: { visible: boolean }) => (
  <div
    style={{
      opacity: visible ? 1 : 0,
      display: 'flex',
      alignItems: 'center',
      gap: 48,
      height: '100%',
    }}
  >
    <div style={{ width: 560, display: 'flex', flexDirection: 'column', gap: 22 }}>
      <Kicker delay={246}>SIGNALS IN TRANSIT</Kicker>
      <Headline delay={252} size={52}>
        消息不会
        <br />
        瞬间抵达。
      </Headline>
      <Body delay={262} maxWidth={520} size={21}>
        在它到达之前，没有人能据此行动。抵达之后，它才进入人物的可知范围。
      </Body>
      <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
        <Tag>世界时间</Tag>
        <Tag>在途信号</Tag>
        <Tag tone="gold">抵达</Tag>
      </div>
    </div>
    <SignalFlow />
  </div>
);

export const World = ({ duration }: { duration: number }) => {
  const frame = useCurrentFrame();
  const first = frame < 240;
  return (
    <SceneShell duration={duration} chapter="01 / WORLD" padding="152px 104px 104px">
      <div style={{ position: 'relative', height: '100%' }}>
        <AbsoluteFill style={{ opacity: first ? 1 : 0 }}>
          <BeatOne visible={first} />
        </AbsoluteFill>
        <AbsoluteFill style={{ opacity: first ? 0 : 1 }}>
          <BeatTwo visible={!first} />
        </AbsoluteFill>
      </div>
    </SceneShell>
  );
};
