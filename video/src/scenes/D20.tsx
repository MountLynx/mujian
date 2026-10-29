import { Body, Headline, Kicker, Micro, Panel, SceneShell, Tag, useFadeUp } from '../components';
import { C, F } from '../theme';

const ATTRS = [
  ['体魄', 6],
  ['敏捷', 6],
  ['感知', 8],
  ['智识', 7],
  ['意志', 8],
  ['风度', 5],
] as const;

const Die = () => (
  <svg viewBox="0 0 64 64" width={54} height={54} aria-hidden="true">
    <path d="M32 4 58 19v26L32 60 6 45V19Z" fill="none" stroke={C.gold} strokeWidth={1.4} />
    <path d="M32 4v56M6 19l52 26M58 19 6 45" fill="none" stroke={C.gold} strokeOpacity={0.45} strokeWidth={0.8} />
    <text x="32" y="38" textAnchor="middle" fill={C.gold2} fontSize="17" fontFamily="Menlo, monospace">20</text>
  </svg>
);

const AttrRow = ({ name, value, highlight }: { name: string; value: number; highlight?: boolean }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 14, height: 40, padding: highlight ? '0 8px' : '0', borderRadius: 4, background: highlight ? 'rgba(201,167,107,0.06)' : 'transparent' }}>
    <span style={{ width: 46, fontFamily: F.sans, fontSize: 15, color: highlight ? C.gold2 : C.ink2 }}>{name}</span>
    <div style={{ display: 'flex', gap: 4, width: 230 }}>
      {Array.from({ length: 10 }).map((_, i) => (
        <span
          key={i}
          style={{
            width: 20,
            height: 8,
            borderRadius: 2,
            background: i < value ? (highlight ? C.gold : 'rgba(163,190,181,0.62)') : 'rgba(163,190,181,0.10)',
            boxShadow: highlight && i < value ? `0 0 8px ${C.goldSoft}` : 'none',
          }}
        />
      ))}
    </div>
    <span style={{ fontFamily: F.mono, fontSize: 15, color: highlight ? C.gold : C.ink3, width: 24, textAlign: 'right' }}>
      {String(value).padStart(2, '0')}
    </span>
    {highlight ? <Tag tone="gold">本次检定</Tag> : null}
  </div>
);

export const D20 = ({ duration }: { duration: number }) => {
  const panel = useFadeUp(10, 20, 14);
  const formula = useFadeUp(26, 18, 8);
  const attrs = useFadeUp(24, 18, 10);
  const example = useFadeUp(44, 18, 10);
  const note = useFadeUp(56, 18, 8);
  return (
    <SceneShell duration={duration} chapter="02 / TABLETOP" padding="140px 104px 100px">
      <div style={{ display: 'flex', gap: 40, alignItems: 'center', height: '100%' }}>
        <div style={{ width: 500, display: 'flex', flexDirection: 'column', gap: 20 }}>
          <Kicker delay={4}>BORROWED FROM TABLETOP / 跑团机制</Kicker>
          <Headline delay={10} size={52} style={{ maxWidth: 500 }}>
            掷一颗 d20，
            <br />
            加你这个人。
          </Headline>
          <Body delay={18} maxWidth={500} size={20}>
            借自跑团：掷点决定运气；属性点决定你是谁；
            <br />
            特质与状态决定这一刻的处境。
          </Body>
          <div style={{ ...formula, display: 'flex', flexDirection: 'column', gap: 10, borderLeft: `2px solid ${C.gold}`, paddingLeft: 14 }}>
            <span style={{ fontFamily: F.mono, fontSize: 15, color: C.gold2, letterSpacing: '0.02em' }}>
              d20 + 属性点 + 特质 / 状态
            </span>
            <span style={{ fontFamily: F.sans, fontSize: 15, color: C.ink3 }}>→ 对 DC 或回应总值</span>
          </div>
          <div style={{ ...note, display: 'flex', alignItems: 'center', gap: 10, marginTop: 6 }}>
            <span style={{ width: 24, height: 1, background: C.lineStrong }} />
            <Micro>属性不是临时加成；它写在这个人身上。</Micro>
          </div>
        </div>

        <div style={{ ...panel, width: 1120 }}>
          <Panel style={{ padding: '22px 26px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <Micro style={{ color: C.gold, letterSpacing: '0.2em' }}>CHARACTER / 人物卡</Micro>
                <span style={{ fontFamily: F.serif, fontSize: 26, color: C.ink }}>阿岚 · 七号井的绞车工</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Die />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <Micro style={{ color: C.gold2 }}>d20</Micro>
                  <Micro>1–20</Micro>
                </div>
              </div>
            </div>

            <div style={{ ...attrs, display: 'flex', flexDirection: 'column', gap: 2, marginTop: 18, paddingTop: 14, borderTop: `1px solid ${C.line}` }}>
              {ATTRS.map(([name, value]) => (
                <AttrRow key={name} name={name} value={value} highlight={name === '意志'} />
              ))}
            </div>

            <div
              style={{
                ...example,
                marginTop: 16,
                border: `1px solid ${C.lineStrong}`,
                background: 'rgba(201,167,107,0.06)',
                borderRadius: 8,
                padding: '14px 16px',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ fontFamily: F.mono, fontSize: 15, color: C.ink2 }}>d20</span>
                <span style={{ fontFamily: F.mono, fontSize: 22, color: C.gold2 }}>3</span>
                <span style={{ fontFamily: F.mono, fontSize: 15, color: C.ink3 }}>+</span>
                <span style={{ fontFamily: F.sans, fontSize: 17, color: C.ink }}>意志</span>
                <span style={{ fontFamily: F.mono, fontSize: 22, color: C.gold2 }}>8</span>
                <span style={{ fontFamily: F.mono, fontSize: 15, color: C.ink3 }}>+</span>
                <span style={{ fontFamily: F.sans, fontSize: 17, color: C.ink2 }}>守势 +2</span>
                <span style={{ fontFamily: F.mono, fontSize: 15, color: C.ink3 }}>=</span>
                <span style={{ fontFamily: F.mono, fontSize: 24, color: C.gold }}>13</span>
                <span style={{ fontFamily: F.mono, fontSize: 13, color: C.ink3 }}>vs DC 13</span>
                <Tag tone="ok">落地</Tag>
              </div>
              <Micro>这一次用的是意志；下一次可能是体魄、感知或别的属性。</Micro>
            </div>
          </Panel>
        </div>
      </div>
    </SceneShell>
  );
};
