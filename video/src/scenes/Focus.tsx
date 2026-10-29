import { Body, Headline, ImageFrame, Kicker, Micro, SceneShell, useFadeUp } from '../components';
import { C, F } from '../theme';

const PairLabel = ({ code, title, note }: { code: string; title: string; note: string }) => (
  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
    <span style={{ fontFamily: F.mono, fontSize: 11, letterSpacing: '0.18em', color: C.gold, width: 58, paddingTop: 4 }}>
      {code}
    </span>
    <span style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <span style={{ fontFamily: F.sans, fontSize: 18, color: C.ink }}>{title}</span>
      <span style={{ fontFamily: F.sans, fontSize: 13.5, color: C.ink3, lineHeight: 1.6 }}>{note}</span>
    </span>
  </div>
);

const Outcome = ({ color, title, note }: { color: string; title: string; note: string }) => (
  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flex: 1 }}>
    <span style={{ width: 8, height: 8, borderRadius: 999, background: color, marginTop: 7, flex: 'none' }} />
    <span style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontFamily: F.sans, fontSize: 18, color: C.ink }}>{title}</span>
      <span style={{ fontFamily: F.sans, fontSize: 13, lineHeight: 1.6, color: C.ink3 }}>{note}</span>
    </span>
  </div>
);

export const Focus = ({ duration }: { duration: number }) => {
  const pairs = useFadeUp(26, 18, 10);
  const quote = useFadeUp(34, 18, 10);
  const outcomes = useFadeUp(42, 18, 10);
  return (
    <SceneShell duration={duration} chapter="03 / SCENE" padding="148px 104px 100px">
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: 48, alignItems: 'flex-start' }}>
          <div style={{ width: 720, display: 'flex', flexDirection: 'column', gap: 20 }}>
            <Kicker delay={4}>ONE MOMENT, THREE SECRETS</Kicker>
            <Headline delay={10} size={58} style={{ maxWidth: 700 }}>
              每个人只依据
              <br />
              自己知道的事行动。
            </Headline>
            <Body delay={18} maxWidth={680} size={22}>
              一个时刻，所有主动角色各自秘密宣告；导演只负责裁定与收束。
            </Body>
            <div style={{ ...pairs, display: 'flex', flexDirection: 'column', gap: 14, marginTop: 6 }}>
              <PairLabel code="DEED" title="做了什么" note="可被看见的动作与台词；它通常会发生。" />
              <PairLabel code="EFFECT" title="想达成什么" note="不一定发生的意图；由检定决定是否落地。" />
              <div style={{ ...quote, marginTop: 12, paddingTop: 14, borderTop: `1px solid ${C.line}`, maxWidth: 620 }}>
                <p style={{ fontFamily: F.serif, fontSize: 22, lineHeight: 1.7, color: C.ink2, margin: 0 }}>
                  “潮水等得到。你等的是什么？”
                </p>
                <Micro style={{ display: 'inline-block', marginTop: 6 }}>阿婆 · 对话</Micro>
              </div>
            </div>
          </div>
          <ImageFrame
            src="screens/run-action-card.png"
            width={860}
            height={467}
            delay={14}
            caption="一条真实的行动记录 · 阿婆 / 林生"
          />
        </div>

        <div style={{ ...outcomes, display: 'flex', gap: 54, paddingTop: 18, borderTop: `1px solid ${C.line}` }}>
          <Outcome color={C.gold} title="意外奏效" note="差值 +5 以上：额外一层成功。" />
          <Outcome color={C.ok} title="落地" note="达到 DC / 回应总值：effect 发生。" />
          <Outcome color={C.soft} title="落空" note="未达到：deed 仍发生，effect 不落地。" />
        </div>
      </div>
    </SceneShell>
  );
};
