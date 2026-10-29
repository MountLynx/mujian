import { Body, Headline, Kicker, Micro, SceneShell, useFadeUp } from '../components';
import { C, F } from '../theme';

const stats = [
  ['2', '层', '世界 + 聚焦'],
  ['N+T+3', '次调用', '每个时刻'],
  ['1', 'seed', '骰点可复现'],
  ['0', '构建', '原生 ESM 前端'],
];

const Stat = ({ value, label, note, delay }: { value: string; label: string; note: string; delay: number }) => (
  <div style={{ ...useFadeUp(delay, 28, 16), flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
    <span
      style={{
        fontFamily: F.mono,
        fontSize: 58,
        lineHeight: 1,
        color: C.gold2,
        letterSpacing: '-0.04em',
      }}
    >
      {value}
    </span>
    <span style={{ fontFamily: F.sans, fontSize: 18, color: C.ink }}>{label}</span>
    <Micro>{note}</Micro>
  </div>
);

export const Stats = ({ duration }: { duration: number }) => {
  const headline = useFadeUp(6, 18, 14);
  const note = useFadeUp(44, 16, 8);
  return (
    <SceneShell duration={duration} chapter="07 / SYSTEM" padding="180px 104px 112px">
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 42 }}>
        <Kicker delay={8}>AUDITABLE BY DESIGN</Kicker>
        <div style={headline}>
          <Headline size={56} style={{ maxWidth: 1180 }}>
            世界留下可审计的因果。
            <br />
            人物留下自己的选择。
          </Headline>
        </div>
        <div
          style={{
            display: 'flex',
            gap: 0,
            marginTop: 24,
            borderTop: `1px solid ${C.line}`,
            borderBottom: `1px solid ${C.line}`,
            padding: '34px 0',
          }}
        >
          {stats.map(([value, label, noteText], index) => (
            <div
              key={label}
              style={{
                flex: 1,
                paddingLeft: index === 0 ? 0 : 38,
                borderLeft: index === 0 ? 'none' : `1px solid ${C.line}`,
              }}
            >
              <Stat value={value} label={label} note={noteText} delay={18 + index * 6} />
            </div>
          ))}
        </div>
        <div style={{ ...note, display: 'flex', alignItems: 'center', gap: 14 }}>
          <span style={{ width: 30, height: 1, background: C.lineStrong }} />
          <Micro style={{ letterSpacing: '0.16em' }}>
            Node 24 · DeepSeek / MiniMax · 本地 JSON · 可导出战报
          </Micro>
        </div>
      </div>
    </SceneShell>
  );
};
